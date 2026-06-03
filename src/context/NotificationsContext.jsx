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

  const value = {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    prefs,
    updatePrefs,
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
      refresh: () => {},
    }
  )
}
