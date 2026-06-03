import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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

export function NotificationsProvider({ children }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  // Track the latest userId in a ref so the realtime callback (created once per
  // subscription) can guard against rows that arrive after a user switch.
  const userIdRef = useRef(userId)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // Mirror notifications into a ref so read-marking can synchronously decide
  // whether a write is needed without depending on React's updater timing.
  const notificationsRef = useRef(notifications)
  useEffect(() => { notificationsRef.current = notifications }, [notifications])

  const load = useCallback(async (uid) => {
    if (!uid) {
      setNotifications([])
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (error) throw error
      setNotifications(data ?? [])
    } catch (err) {
      console.error('[NotificationsContext] load error:', err)
      // Keep whatever we already had in memory rather than blanking it.
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
            setNotifications((prev) => {
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

  const unreadCount = notifications.reduce((n, x) => n + (x.read_at ? 0 : 1), 0)

  const markRead = useCallback(async (id) => {
    if (!id) return
    // Decide off the ref (synchronous, current) — only write if actually unread.
    const target = notificationsRef.current.find((n) => n.id === id)
    if (!target || target.read_at) return
    const now = new Date().toISOString()
    setNotifications((prev) =>
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
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n))
      )
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const snapshot = notificationsRef.current
    const hadUnread = snapshot.some((n) => !n.read_at)
    if (!hadUnread) return
    const now = new Date().toISOString()
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    )
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
        .is('read_at', null)
      if (error) throw error
    } catch (err) {
      console.error('[NotificationsContext] markAllRead error:', err)
      setNotifications(snapshot) // rollback
    }
  }, [userId])

  const value = {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
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
      refresh: () => {},
    }
  )
}
