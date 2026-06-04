import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// In-app notification data layer.
//
// Notifications are created SERVER-SIDE (SECURITY DEFINER triggers) — the client
// only ever READS them and flips read_at. RLS scopes every row to auth.uid(), so
// we never need to filter by user beyond what the database already enforces; the
// explicit .eq('user_id', …) below is belt-and-suspenders + lets the realtime
// channel target a single user's rows.
//
// Everything here is defensive: a failed query or a missing profile must never
// crash the app or blank the bell — it just yields an empty list.
// ─────────────────────────────────────────────────────────────────────────────

const NotificationsContext = createContext(null)

const PAGE_SIZE = 50

// VAPID public key (safe to embed client-side) for Web Push subscriptions.
const VAPID_PUBLIC_KEY =
  'BPWTm62KWStCugQNiHyZonaZ6eMoaOpo6ZhgmBFw3Wt3z7Cbu8StfGiEuaXalAONbR5OlFEEUX6lK-1QnHRmY6U'

// Standard helper: a base64url VAPID key → the Uint8Array the Push API wants as
// `applicationServerKey`. (Pads, swaps the URL-safe alphabet, then byte-decodes.)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Feature-detect Web Push. Guarded for SSR/test environments where these globals
// may be absent. `pushSupported` is the single gate the UI reads.
const PUSH_SUPPORTED =
  typeof navigator !== 'undefined' &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

// A missing preferences row means "all defaults": nothing muted, channels off, no
// quiet hours. We normalise into this exact shape so consumers never see undefined.
const DEFAULT_PREFS = Object.freeze({
  muted_types: [],
  channel_push: false,
  channel_email: false,
  quiet_start: null,
  quiet_end: null,
})

function normalisePrefs(row) {
  if (!row) return { ...DEFAULT_PREFS }
  return {
    muted_types: Array.isArray(row.muted_types) ? row.muted_types : [],
    channel_push: !!row.channel_push,
    channel_email: !!row.channel_email,
    quiet_start: row.quiet_start ?? null,
    quiet_end: row.quiet_end ?? null,
  }
}

export function NotificationsProvider({ children }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null

  // RAW notifications as loaded from the DB. The value we EXPOSE is derived from
  // this by filtering out muted types (see `notifications`/`unreadCount` below),
  // so muting takes effect in-app immediately without a re-fetch.
  const [rawNotifications, setRawNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS }))

  // Track the latest userId in a ref so the realtime callback (created once per
  // subscription) can guard against rows that arrive after a user switch.
  const userIdRef = useRef(userId)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // Mirror raw notifications into a ref so read-marking can synchronously decide
  // whether a write is needed without depending on React's updater timing.
  const notificationsRef = useRef(rawNotifications)
  useEffect(() => { notificationsRef.current = rawNotifications }, [rawNotifications])

  const load = useCallback(async (uid) => {
    if (!uid) {
      setRawNotifications([])
      setPrefs({ ...DEFAULT_PREFS })
      setLoading(false)
      return
    }
    try {
      // Load notifications + the user's preferences row in parallel. Each is
      // independently defensive: a failure in one must not blank the other.
      const [notifRes, prefsRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle(),
      ])

      if (notifRes.error) {
        console.error('[NotificationsContext] load error:', notifRes.error)
        // Keep whatever we already had in memory rather than blanking it.
      } else {
        setRawNotifications(notifRes.data ?? [])
      }

      if (prefsRes.error) {
        console.error('[NotificationsContext] prefs load error:', prefsRes.error)
      } else {
        // No row → all defaults (nothing muted).
        setPrefs(normalisePrefs(prefsRes.data))
      }
    } catch (err) {
      console.error('[NotificationsContext] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + reload on user change.
  useEffect(() => {
    setLoading(true)
    load(userId)
  }, [userId, load])

  // Realtime: prepend new notifications for THIS user as the server inserts them.
  useEffect(() => {
    if (!userId) return
    let channel
    try {
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload?.new
            if (!row || row.user_id !== userIdRef.current) return
            // We store the row even if its type is currently muted — muting is a
            // VIEW concern (applied in the exposed `notifications`), so unmuting
            // later surfaces it without a re-fetch.
            setRawNotifications((prev) => {
              if (prev.some((n) => n.id === row.id)) return prev // de-dupe
              return [row, ...prev].slice(0, PAGE_SIZE)
            })
          }
        )
        .subscribe()
    } catch (err) {
      console.error('[NotificationsContext] subscribe error:', err)
    }
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* no-op */ }
      }
    }
  }, [userId])

  // ── Exposed (filtered) view ────────────────────────────────────────────────
  // A notification whose `type` is muted is hidden from the center AND excluded
  // from the unread badge. The raw list is kept internally so unmuting is instant.
  const mutedSet = useMemo(
    () => new Set(Array.isArray(prefs.muted_types) ? prefs.muted_types : []),
    [prefs.muted_types]
  )
  const notifications = useMemo(
    () => rawNotifications.filter((n) => !mutedSet.has(n.type)),
    [rawNotifications, mutedSet]
  )
  const unreadCount = notifications.reduce((n, x) => n + (x.read_at ? 0 : 1), 0)

  const markRead = useCallback(async (id) => {
    if (!id) return
    // Decide off the ref (synchronous, current) — only write if actually unread.
    const target = notificationsRef.current.find((n) => n.id === id)
    if (!target || target.read_at) return
    const now = new Date().toISOString()
    setRawNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n))
    )
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', id)
        .is('read_at', null)
      if (error) throw error
    } catch (err) {
      console.error('[NotificationsContext] markRead error:', err)
      // Revert the optimistic flip on failure.
      setRawNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n))
      )
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const snapshot = notificationsRef.current
    // "Mark all read" acts on the VISIBLE set — if every unread row is muted there
    // is nothing for the user to clear. We still persist read_at for muted rows we
    // touch (they're already flagged read in the snapshot below), which is harmless.
    const visibleUnread = snapshot.some((n) => !n.read_at && !mutedSet.has(n.type))
    if (!visibleUnread) return
    const now = new Date().toISOString()
    setRawNotifications((prev) =>
      prev.map((n) => (n.read_at || mutedSet.has(n.type) ? n : { ...n, read_at: now }))
    )
    try {
      // Only clear the unread rows the user can actually see, so muted-but-unread
      // notifications stay unread and resurface (unread) if the type is unmuted.
      const visibleTypes = [...new Set(snapshot.map((n) => n.type))].filter(
        (t) => !mutedSet.has(t)
      )
      let q = supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
      // Restrict to the visible types BEFORE the terminal `.is()` filter so muted
      // rows stay unread and resurface (unread) if their type is later unmuted.
      if (visibleTypes.length > 0) q = q.in('type', visibleTypes)
      const { error } = await q.is('read_at', null)
      if (error) throw error
    } catch (err) {
      console.error('[NotificationsContext] markAllRead error:', err)
      setRawNotifications(snapshot) // rollback
    }
  }, [userId, mutedSet])

  // ── Preferences write ──────────────────────────────────────────────────────
  // Optimistic upsert: apply the partial locally immediately, persist via upsert
  // (onConflict user_id), and roll back to the prior snapshot if the write fails.
  const prefsRef = useRef(prefs)
  useEffect(() => { prefsRef.current = prefs }, [prefs])

  const updatePrefs = useCallback(async (partial) => {
    if (!userId || !partial || typeof partial !== 'object') return
    const prev = prefsRef.current
    const next = normalisePrefs({ ...prev, ...partial })
    setPrefs(next) // optimistic
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: userId, ...next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      if (error) throw error
    } catch (err) {
      console.error('[NotificationsContext] updatePrefs error:', err)
      setPrefs(prev) // rollback
    }
  }, [userId])

  // ── Web Push ────────────────────────────────────────────────────────────────
  // `pushSupported` is a static capability check; `pushEnabled` reflects the saved
  // preference. Both subscribe (enablePush) and unsubscribe (disablePush) are fully
  // defensive: every browser/IO call is wrapped so a failure surfaces as a readable
  // Error the UI can show, never an app crash. We only flip `channel_push` AFTER the
  // subscription is persisted (enable) / removed (disable), so the toggle never lies.
  const pushSupported = PUSH_SUPPORTED
  const pushEnabled = !!prefs.channel_push

  const enablePush = useCallback(async () => {
    if (!pushSupported) {
      throw new Error('Push notifications aren’t supported on this browser.')
    }
    if (!userId) {
      throw new Error('You need to be signed in to enable push notifications.')
    }

    // a/b. Permission gate. If the user blocks (or dismisses) the prompt we bail
    // WITHOUT touching channel_push, so the toggle reverts cleanly.
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      throw new Error('Allow notifications in your browser to enable push.')
    }

    let sub
    try {
      // c. Register the SW and wait until it's active.
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // d. Reuse an existing subscription if present, else create one.
      sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }
    } catch (err) {
      console.error('[NotificationsContext] push subscribe error:', err)
      throw new Error('Could not subscribe to push notifications. Please try again.', { cause: err })
    }

    // e. Persist the subscription keyed on its unique endpoint.
    const j = sub.toJSON()
    try {
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: j.endpoint,
          p256dh: j.keys?.p256dh,
          auth: j.keys?.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'endpoint' }
      )
      if (error) throw error
    } catch (err) {
      console.error('[NotificationsContext] push subscription save error:', err)
      throw new Error('Could not save your push subscription. Please try again.', { cause: err })
    }

    // f. Only now flip the channel on.
    await updatePrefs({ channel_push: true })
    return { ok: true }
  }, [pushSupported, userId, updatePrefs])

  const disablePush = useCallback(async () => {
    // Best-effort teardown: remove the row + unsubscribe locally, then flip the
    // pref off. We turn the pref off regardless of teardown hiccups so the user is
    // never stuck "on" — but we still report a hard failure if the pref write fails.
    if (pushSupported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (sub) {
          const endpoint = sub.endpoint
          if (userId && endpoint) {
            const { error } = await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', endpoint)
            if (error) console.error('[NotificationsContext] push row delete error:', error)
          }
          try {
            await sub.unsubscribe()
          } catch (err) {
            console.error('[NotificationsContext] push unsubscribe error:', err)
          }
        }
      } catch (err) {
        console.error('[NotificationsContext] disablePush teardown error:', err)
      }
    }
    await updatePrefs({ channel_push: false })
    return { ok: true }
  }, [pushSupported, userId, updatePrefs])

  // On mount (and when push is already enabled), silently re-register the SW AND
  // re-validate the push subscription. Browsers drop or rotate subscriptions
  // without warning (Ryan's went 410 Gone, got pruned, and then never came back
  // because nothing re-subscribed on load). So: if the subscription is missing we
  // resubscribe, then always re-store the current endpoint so the server has a
  // live subscription on file every session. Defensive — any failure is swallowed.
  useEffect(() => {
    if (!pushSupported || !pushEnabled || !userId) return
    if (Notification.permission !== 'granted') return
    let cancelled = false
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        if (cancelled) return

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          // The browser dropped/expired the old subscription — make a fresh one.
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }
        if (cancelled || !sub) return

        // Re-store (upsert by endpoint). A rotated endpoint inserts the new row;
        // the stale one is pruned server-side on its next 404/410. We never delete
        // other endpoints here — the same user may have other live devices.
        const j = sub.toJSON()
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint: j.endpoint,
            p256dh: j.keys?.p256dh,
            auth: j.keys?.auth,
            user_agent: navigator.userAgent,
          },
          { onConflict: 'endpoint' }
        )
      } catch (err) {
        console.error('[NotificationsContext] push subscription refresh error:', err)
      }
    })()
    return () => { cancelled = true }
  }, [pushSupported, pushEnabled, userId])

  const value = {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    prefs,
    updatePrefs,
    pushSupported,
    pushEnabled,
    enablePush,
    disablePush,
    refresh: () => load(userId),
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

// Safe default so components (and isolated tests) can call the hook even when the
// provider isn't mounted.
export function useNotifications() {
  return (
    useContext(NotificationsContext) ?? {
      notifications: [],
      unreadCount: 0,
      loading: false,
      markRead: () => {},
      markAllRead: () => {},
      prefs: { ...DEFAULT_PREFS },
      updatePrefs: async () => {},
      pushSupported: false,
      pushEnabled: false,
      enablePush: async () => {
        throw new Error('Push notifications aren’t available.')
      },
      disablePush: async () => {},
      refresh: () => {},
    }
  )
}
