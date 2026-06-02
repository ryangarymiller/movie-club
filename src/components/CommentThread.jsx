import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

// --- Shared helpers (inlined verbatim for consistency) ---
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const AVATAR_COLORS = ['#e11d48', '#db2777', '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#ca8a04']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
const EDIT_WINDOW_MS = 15 * 60 * 1000
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀']

// Relative timestamp helper
function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

// Derive the @mention handle (FirstLast) from a member name
function mentionHandle(name = '') {
  return name.split(/\s+/).filter(Boolean).join('')
}

const MONO = "'DM Mono', monospace"
const BODY_FONT = "'DM Sans', sans-serif"

export default function CommentThread({ movieId, currentUserId, isAdmin, users = [], canParticipate }) {
  const [comments, setComments] = useState([])
  const [reactions, setReactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Ticks every 30s so the 15-min edit window can expire without a manual refresh.
  const [now, setNow] = useState(() => Date.now())

  // Filter out the test account up front; build lookup maps.
  const safeUsers = useMemo(
    () => (users || []).filter(u => u && u.email !== TEST_EMAIL),
    [users]
  )
  const userById = useMemo(() => {
    const m = {}
    for (const u of safeUsers) m[u.id] = u
    return m
  }, [safeUsers])

  // Members eligible to be @mentioned, with their handle.
  const mentionable = useMemo(
    () => safeUsers.map(u => ({ ...u, handle: mentionHandle(u.name) })).filter(u => u.handle),
    [safeUsers]
  )

  const fetchAll = useCallback(async () => {
    if (!movieId) return
    const { data: cData, error: cErr } = await supabase
      .from('comments')
      .select('id, movie_id, user_id, parent_comment_id, body, reaction_counts, created_at, updated_at')
      .eq('movie_id', movieId)
      .order('created_at', { ascending: true })

    if (cErr) {
      setError(cErr.message || 'Could not load discussion.')
      setComments([])
      setReactions([])
      setLoading(false)
      return
    }

    const list = cData || []
    setComments(list)
    setError(null)

    const ids = list.map(c => c.id)
    if (ids.length) {
      const { data: rData, error: rErr } = await supabase
        .from('reactions')
        .select('id, comment_id, user_id, emoji')
        .in('comment_id', ids)
      if (rErr) {
        // Reactions are non-critical; degrade gracefully.
        setReactions([])
      } else {
        setReactions(rData || [])
      }
    } else {
      setReactions([])
    }
    setLoading(false)
  }, [movieId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await fetchAll()
      if (!alive) return
    })()
    return () => { alive = false }
  }, [fetchAll])

  // Keep `now` fresh so edit affordances expire on their own.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // Aggregate reactions per comment id -> { emoji: { count, mine } }
  const reactionsByComment = useMemo(() => {
    const map = {}
    for (const r of reactions) {
      if (!map[r.comment_id]) map[r.comment_id] = {}
      if (!map[r.comment_id][r.emoji]) map[r.comment_id][r.emoji] = { count: 0, mine: false }
      map[r.comment_id][r.emoji].count += 1
      if (r.user_id === currentUserId) map[r.comment_id][r.emoji].mine = true
    }
    return map
  }, [reactions, currentUserId])

  // Build a 2-level tree: top-level comments + flat list of replies under each.
  const tree = useMemo(() => {
    const topLevel = []
    const repliesByParent = {}
    const byId = {}
    for (const c of comments) byId[c.id] = c

    for (const c of comments) {
      if (!c.parent_comment_id) {
        topLevel.push(c)
      } else {
        // Resolve to the top-level ancestor so deeper replies render flat under it.
        let anchor = c.parent_comment_id
        let guard = 0
        while (byId[anchor] && byId[anchor].parent_comment_id && guard < 10) {
          anchor = byId[anchor].parent_comment_id
          guard += 1
        }
        if (!repliesByParent[anchor]) repliesByParent[anchor] = []
        repliesByParent[anchor].push(c)
      }
    }
    return topLevel.map(c => ({
      ...c,
      replies: (repliesByParent[c.id] || []).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      ),
    }))
  }, [comments])

  // --- Reaction toggle ---
  async function toggleReaction(commentId, emoji) {
    if (!currentUserId) return
    const existing = reactions.find(
      r => r.comment_id === commentId && r.user_id === currentUserId && r.emoji === emoji
    )
    try {
      if (existing) {
        const { error: delErr } = await supabase.from('reactions').delete().eq('id', existing.id)
        if (delErr) throw delErr
      } else {
        const { error: insErr } = await supabase
          .from('reactions')
          .insert({ comment_id: commentId, user_id: currentUserId, emoji })
        if (insErr) throw insErr
      }
      await fetchAll()
    } catch (e) {
      setError(e.message || 'Could not update reaction.')
    }
  }

  // --- Delete (admin only) ---
  async function handleDelete(commentId) {
    if (!isAdmin) return
    if (!window.confirm('Delete this comment? This cannot be undone.')) return
    try {
      const { error: delErr } = await supabase.from('comments').delete().eq('id', commentId)
      if (delErr) throw delErr
      await fetchAll()
    } catch (e) {
      setError(e.message || 'Could not delete comment.')
    }
  }

  return (
    <div style={{ fontFamily: BODY_FONT, color: 'var(--text)' }}>
      <p style={{
        fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-dim)', margin: '0 0 16px',
      }}>
        Discussion{comments.length ? ` · ${comments.length}` : ''}
      </p>

      {error && (
        <div role="alert" style={{
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
          color: '#f87171', fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Top-level composer */}
      {canParticipate ? (
        <Composer
          movieId={movieId}
          currentUserId={currentUserId}
          parentId={null}
          mentionable={mentionable}
          onPosted={fetchAll}
          onError={setError}
          placeholder="Add to the discussion…"
          submitLabel="Post"
        />
      ) : (
        <div style={{
          background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)',
          borderRadius: '12px', padding: '14px 16px', marginBottom: '24px',
          color: 'var(--text-muted)', fontSize: '13px',
        }}>
          Submit your score to join the discussion.
        </div>
      )}

      {/* Thread */}
      {loading ? (
        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '8px 0' }}>
          Loading discussion…
        </p>
      ) : tree.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '8px 0' }}>
          No comments yet. {canParticipate ? 'Be the first to say something.' : ''}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '8px' }}>
          {tree.map(c => (
            <TopLevelComment
              key={c.id}
              comment={c}
              userById={userById}
              mentionable={mentionable}
              reactionsByComment={reactionsByComment}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canParticipate={canParticipate}
              movieId={movieId}
              now={now}
              onToggleReaction={toggleReaction}
              onDelete={handleDelete}
              onMutated={fetchAll}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Top-level comment with its replies ----------
function TopLevelComment({
  comment, userById, mentionable, reactionsByComment, currentUserId, isAdmin,
  canParticipate, movieId, now, onToggleReaction, onDelete, onMutated, onError,
}) {
  const [replying, setReplying] = useState(false)

  return (
    <div>
      <CommentCard
        comment={comment}
        userById={userById}
        mentionable={mentionable}
        reactionsByComment={reactionsByComment}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        now={now}
        onToggleReaction={onToggleReaction}
        onDelete={onDelete}
        onMutated={onMutated}
        onError={onError}
      />

      {/* Reply affordance (only when the viewer can participate) */}
      {canParticipate && (
        <div style={{ marginTop: '6px', marginLeft: '44px' }}>
          <button
            onClick={() => setReplying(v => !v)}
            aria-expanded={replying}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
              fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'var(--text-dim)',
            }}
          >
            {replying ? 'Cancel' : 'Reply'}
          </button>
        </div>
      )}

      {/* Inline reply composer */}
      {canParticipate && replying && (
        <div style={{ marginLeft: '44px', marginTop: '10px' }}>
          <Composer
            movieId={movieId}
            currentUserId={currentUserId}
            parentId={comment.id}
            mentionable={mentionable}
            placeholder={`Reply to ${userById[comment.user_id]?.name || 'comment'}…`}
            submitLabel="Reply"
            compact
            onPosted={() => { setReplying(false); onMutated() }}
            onError={onError}
          />
        </div>
      )}

      {/* Replies (rendered flat, indented) */}
      {comment.replies.length > 0 && (
        <div style={{
          marginLeft: '44px', marginTop: '14px',
          paddingLeft: '14px', borderLeft: '2px solid rgba(var(--fg-rgb),0.08)',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          {comment.replies.map(r => (
            <CommentCard
              key={r.id}
              comment={r}
              userById={userById}
              mentionable={mentionable}
              reactionsByComment={reactionsByComment}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              now={now}
              onToggleReaction={onToggleReaction}
              onDelete={onDelete}
              onMutated={onMutated}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- A single comment (used for both top-level and replies) ----------
function CommentCard({
  comment, userById, mentionable, reactionsByComment, currentUserId, isAdmin,
  now, onToggleReaction, onDelete, onMutated, onError,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  const author = userById[comment.user_id]
  const name = author?.name || 'Unknown member'
  const isOwn = comment.user_id === currentUserId
  const edited = comment.updated_at && comment.created_at &&
    new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime() + 1000

  // Edit allowed only for own comment within 15 min of creation.
  // `now` is supplied by the parent (ticked on an interval) to keep render pure.
  const withinEditWindow = isOwn &&
    now - new Date(comment.created_at).getTime() < EDIT_WINDOW_MS

  const counts = reactionsByComment[comment.id] || {}

  async function saveEdit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const { error: upErr } = await supabase
        .from('comments')
        .update({ body: trimmed, updated_at: new Date().toISOString() })
        .eq('id', comment.id)
      if (upErr) throw upErr
      setEditing(false)
      await onMutated()
    } catch (e) {
      onError(e.message || 'Could not save edit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {/* Avatar */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%',
          background: avatarColor(name), display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontFamily: BODY_FONT,
          fontWeight: 700, fontSize: '12px', letterSpacing: '0.02em',
        }}
      >
        {initials(name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-strong)', fontWeight: 600, fontSize: '14px' }}>
            {name}
          </span>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '0.04em' }}>
            {timeAgo(comment.created_at)}
          </span>
          {edited && (
            <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)', fontStyle: 'italic' }}>
              edited
            </span>
          )}
        </div>

        {/* Body / edit form */}
        {editing ? (
          <div style={{ marginTop: '8px' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)',
                borderRadius: '10px', padding: '10px 12px', fontFamily: BODY_FONT,
                fontSize: '14px', color: 'var(--text-strong)', outline: 'none', lineHeight: 1.5,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(var(--fg-rgb),0.1)')}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={saveEdit}
                disabled={saving || !draft.trim()}
                style={{
                  padding: '7px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent)', color: 'var(--text-strong)',
                  fontFamily: BODY_FONT, fontWeight: 600, fontSize: '13px',
                  cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !draft.trim() ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(comment.body) }}
                style={{
                  padding: '7px 16px', borderRadius: '8px',
                  background: 'rgba(var(--fg-rgb),0.06)', border: '1px solid rgba(var(--fg-rgb),0.1)',
                  color: 'var(--text-strong)', fontFamily: BODY_FONT, fontWeight: 500,
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p style={{
            margin: '4px 0 0', fontSize: '14px', lineHeight: 1.55,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {renderBody(comment.body, mentionable)}
          </p>
        )}

        {/* Reactions row */}
        {!editing && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
            {REACTION_EMOJIS.map(emoji => {
              const info = counts[emoji]
              const has = !!info && info.count > 0
              const mine = !!info && info.mine
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(comment.id, emoji)}
                  aria-label={`React with ${emoji}${mine ? ' (selected)' : ''}`}
                  aria-pressed={mine}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: has ? '3px 8px' : '3px 7px',
                    borderRadius: '999px', cursor: 'pointer',
                    border: `1px solid ${mine ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.1)'}`,
                    background: mine ? 'rgba(var(--fg-rgb),0.06)' : 'transparent',
                    fontSize: '13px', lineHeight: 1.2, fontFamily: BODY_FONT,
                    opacity: has || mine ? 1 : 0.5,
                    transition: 'opacity 0.12s ease, border-color 0.12s ease',
                  }}
                >
                  <span aria-hidden="true">{emoji}</span>
                  {has && (
                    <span style={{
                      fontFamily: MONO, fontSize: '11px',
                      color: mine ? 'var(--accent-light)' : 'var(--text-muted)',
                    }}>
                      {info.count}
                    </span>
                  )}
                </button>
              )
            })}

            {/* Edit (own, within window) */}
            {withinEditWindow && (
              <button
                onClick={() => { setDraft(comment.body); setEditing(true) }}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '3px 4px', fontFamily: MONO, fontSize: '10px',
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)',
                }}
              >
                Edit
              </button>
            )}

            {/* Delete (admin only) */}
            {isAdmin && (
              <button
                onClick={() => onDelete(comment.id)}
                aria-label="Delete comment"
                style={{
                  marginLeft: withinEditWindow ? 0 : 'auto',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '3px 4px', fontFamily: MONO, fontSize: '10px',
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f87171',
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Render a comment body, highlighting @FirstLast mentions that match a known member.
function renderBody(body = '', mentionable = []) {
  if (!body) return null
  const handles = new Set(mentionable.map(m => m.handle))
  // Match @ followed by word characters (handles are FirstLast, no spaces).
  const parts = body.split(/(@[A-Za-z0-9_]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const handle = part.slice(1)
      if (handles.has(handle)) {
        return (
          <span key={i} style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
            {part}
          </span>
        )
      }
    }
    return <span key={i}>{part}</span>
  })
}

// ---------- Composer with @mention autocomplete ----------
function Composer({
  movieId, currentUserId, parentId, mentionable, onPosted, onError,
  placeholder, submitLabel, compact,
}) {
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [mentionQuery, setMentionQuery] = useState(null) // null = closed
  const [mentionStart, setMentionStart] = useState(0)
  const [rawActiveIdx, setRawActiveIdx] = useState(0)
  const textareaRef = useRef(null)

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.toLowerCase()
    return mentionable
      .filter(m => m.handle.toLowerCase().startsWith(q))
      .slice(0, 6)
  }, [mentionQuery, mentionable])

  // Clamp into range derived from current suggestions (avoids a setState-in-effect).
  const activeIdx = suggestions.length ? rawActiveIdx % suggestions.length : 0
  const setActiveIdx = setRawActiveIdx

  function detectMention(value, caret) {
    // Find the last '@' before the caret with no intervening whitespace.
    const upto = value.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1) { setMentionQuery(null); return }
    const between = upto.slice(at + 1)
    // Only an open mention if what follows '@' is mention-safe (no spaces/newlines).
    if (/[\s@]/.test(between)) { setMentionQuery(null); return }
    // Must be at start or preceded by whitespace.
    const before = at === 0 ? '' : upto[at - 1]
    if (at !== 0 && !/\s/.test(before)) { setMentionQuery(null); return }
    setMentionStart(at)
    setMentionQuery(between)
    setRawActiveIdx(0)
  }

  function handleChange(e) {
    const value = e.target.value
    setBody(value)
    detectMention(value, e.target.selectionStart)
  }

  function insertMention(handle) {
    const el = textareaRef.current
    const caret = el ? el.selectionStart : body.length
    const before = body.slice(0, mentionStart)
    const after = body.slice(caret)
    const inserted = `@${handle} `
    const next = before + inserted + after
    setBody(next)
    setMentionQuery(null)
    // Restore focus and caret position after the inserted mention.
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        const pos = before.length + inserted.length
        el.setSelectionRange(pos, pos)
      }
    })
  }

  function handleKeyDown(e) {
    if (mentionQuery != null && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((activeIdx + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((activeIdx - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(suggestions[activeIdx].handle)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
  }

  async function submit() {
    const trimmed = body.trim()
    if (!trimmed || !currentUserId) return
    setPosting(true)
    try {
      const { error: insErr } = await supabase.from('comments').insert({
        movie_id: movieId,
        user_id: currentUserId,
        parent_comment_id: parentId,
        body: trimmed,
      })
      if (insErr) throw insErr
      setBody('')
      setMentionQuery(null)
      await onPosted()
    } catch (e) {
      onError(e.message || 'Could not post comment.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={{ position: 'relative', marginBottom: compact ? 0 : '24px' }}>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)',
          borderRadius: '12px', padding: '12px 14px', fontFamily: BODY_FONT,
          fontSize: '14px', color: 'var(--text-strong)', outline: 'none', lineHeight: 1.5,
          transition: 'border-color 0.15s ease',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => { e.target.style.borderColor = 'rgba(var(--fg-rgb),0.1)' }}
      />

      {/* Mention autocomplete */}
      {mentionQuery != null && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention a member"
          style={{
            listStyle: 'none', margin: '4px 0 0', padding: '4px',
            position: 'absolute', zIndex: 20, left: 0, top: '100%',
            minWidth: '180px', maxWidth: '260px',
            background: 'var(--surface-2)', border: '1px solid rgba(var(--fg-rgb),0.12)',
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          {suggestions.map((m, idx) => (
            <li key={m.id} role="option" aria-selected={idx === activeIdx}>
              <button
                onMouseDown={e => { e.preventDefault(); insertMention(m.handle) }}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '7px 9px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: idx === activeIdx ? 'rgba(var(--fg-rgb),0.08)' : 'transparent',
                  fontFamily: BODY_FONT, fontSize: '13px', color: 'var(--text)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                    background: avatarColor(m.name), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '9px',
                  }}
                >
                  {initials(m.name)}
                </span>
                <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>@{m.handle}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: '11px', marginLeft: 'auto' }}>
                  {m.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button
          onClick={submit}
          disabled={posting || !body.trim()}
          style={{
            padding: '9px 20px', borderRadius: '10px', border: 'none',
            background: 'var(--accent)', color: 'var(--text-strong)',
            fontFamily: BODY_FONT, fontWeight: 600, fontSize: '14px',
            cursor: posting || !body.trim() ? 'not-allowed' : 'pointer',
            opacity: posting || !body.trim() ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {posting ? 'Posting…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
