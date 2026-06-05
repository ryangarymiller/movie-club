import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { memberColor, userColor } from '../lib/colors'

// --- Shared helpers ---
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
const EDIT_WINDOW_MS = 15 * 60 * 1000
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀']
const MAX_DEPTH = 6 // cap visual nesting indentation

const MONO = "'DM Mono', monospace"
const BODY_FONT = "'DM Sans', sans-serif"

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

// Avatar background: member color if known, else a deterministic hash fallback.
const AVATAR_FALLBACK = ['#e11d48', '#db2777', '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#ca8a04']
function avatarColor(name = '') {
  const mc = memberColor(name)
  if (mc) return mc
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_FALLBACK[Math.abs(h) % AVATAR_FALLBACK.length]
}

export default function CommentThread({ movieId, currentUserId, isAdmin, users = [], canParticipate, focusId = null }) {
  const [reviews, setReviews] = useState([])
  const [comments, setComments] = useState([])
  const [reactions, setReactions] = useState([])
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Deep-link focus: a comment/review id to scroll to + highlight (from a
  // notification "Open"). The highlight clears on the next click anywhere.
  const rootRef = useRef(null)
  const [highlightId, setHighlightId] = useState(null)
  const scrolledForRef = useRef(null)
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
  // Email lookup so we can hide content authored by the test account.
  const emailById = useMemo(() => {
    const m = {}
    for (const u of users || []) if (u) m[u.id] = u.email
    return m
  }, [users])
  const isTestAuthor = useCallback(uid => emailById[uid] === TEST_EMAIL, [emailById])

  // Members eligible to be @mentioned, with their handle.
  const mentionable = useMemo(
    () => safeUsers.map(u => ({ ...u, handle: mentionHandle(u.name) })).filter(u => u.handle),
    [safeUsers]
  )

  const fetchAll = useCallback(async () => {
    if (!movieId) return
    const [revRes, comRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('id, movie_id, user_id, body, created_at, updated_at')
        .eq('movie_id', movieId)
        .order('created_at', { ascending: true }),
      supabase
        .from('comments')
        .select('id, movie_id, user_id, review_id, parent_comment_id, body, created_at, updated_at')
        .eq('movie_id', movieId)
        .order('created_at', { ascending: true }),
    ])

    if (revRes.error || comRes.error) {
      setError((revRes.error || comRes.error).message || 'Could not load discussion.')
      setReviews([])
      setComments([])
      setReactions([])
      setVotes([])
      setLoading(false)
      return
    }

    const revList = (revRes.data || []).filter(r => !isTestAuthor(r.user_id))
    const comList = (comRes.data || []).filter(c => !isTestAuthor(c.user_id))
    setReviews(revList)
    setComments(comList)
    setError(null)

    // Targets across both reviews and comments for reactions + votes.
    const reviewIds = revList.map(r => r.id)
    const commentIds = comList.map(c => c.id)
    const allTargetIds = [...reviewIds, ...commentIds]

    if (allTargetIds.length) {
      const reviewIdSet = new Set(reviewIds)
      const commentIdSet = new Set(commentIds)

      const [reacRes, voteRes] = await Promise.all([
        supabase
          .from('reactions')
          .select('id, target_type, target_id, user_id, emoji')
          .in('target_id', allTargetIds),
        supabase
          .from('votes')
          .select('id, target_type, target_id, user_id, value')
          .in('target_id', allTargetIds),
      ])
      // Reactions/votes are non-critical; degrade gracefully on error.
      // Client-side validation: only keep a reaction if its target_type matches
      // the entity it belongs to (guards against cross-type id collisions).
      const rawReactions = reacRes.error ? [] : (reacRes.data || [])
      setReactions(rawReactions.filter(r =>
        (r.target_type === 'review' && reviewIdSet.has(r.target_id)) ||
        (r.target_type === 'comment' && commentIdSet.has(r.target_id))
      ))
      setVotes(voteRes.error ? [] : (voteRes.data || []))
    } else {
      setReactions([])
      setVotes([])
    }
    setLoading(false)
  }, [movieId, isTestAuthor])

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

  // Aggregate reactions per (target_type:target_id) -> { emoji: { count, mine } }
  const reactionsByTarget = useMemo(() => {
    const map = {}
    for (const r of reactions) {
      const key = `${r.target_type}:${r.target_id}`
      if (!map[key]) map[key] = {}
      if (!map[key][r.emoji]) map[key][r.emoji] = { count: 0, mine: false }
      map[key][r.emoji].count += 1
      if (r.user_id === currentUserId) map[key][r.emoji].mine = true
    }
    return map
  }, [reactions, currentUserId])

  // Aggregate votes per (target_type:target_id) -> { score, mine: -1|0|1 }
  const votesByTarget = useMemo(() => {
    const map = {}
    for (const v of votes) {
      const key = `${v.target_type}:${v.target_id}`
      if (!map[key]) map[key] = { score: 0, mine: 0 }
      map[key].score += (v.value || 0)
      if (v.user_id === currentUserId) map[key].mine = v.value || 0
    }
    return map
  }, [votes, currentUserId])

  // Build nested comment trees keyed by review_id.
  // commentsByReview[reviewId] = array of top-level comment nodes (each with .children).
  // Comments with a null review_id (orphans or legacy film-level comments) are stored
  // under the special key '__unthreaded__' so they are never silently dropped.
  const UNTHREADED_KEY = '__unthreaded__'
  const commentsByReview = useMemo(() => {
    const nodes = {}
    for (const c of comments) nodes[c.id] = { ...c, children: [] }
    const roots = {} // reviewId (or UNTHREADED_KEY) -> [top-level comment nodes]
    for (const c of comments) {
      const node = nodes[c.id]
      const parent = c.parent_comment_id ? nodes[c.parent_comment_id] : null
      if (parent) {
        parent.children.push(node)
      } else {
        // Use the special key for comments whose review_id is null so they are
        // not lost (Object.keys ignores null properties).
        const rid = c.review_id != null ? c.review_id : UNTHREADED_KEY
        if (!roots[rid]) roots[rid] = []
        roots[rid].push(node)
      }
    }
    // Sort children/roots chronologically.
    const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at)
    const sortDeep = arr => {
      arr.sort(byTime)
      for (const n of arr) sortDeep(n.children)
    }
    for (const rid of Object.keys(roots)) sortDeep(roots[rid])
    return roots
  }, [comments])

  const totalCount = reviews.length + comments.length

  // --- Reaction toggle (polymorphic) ---
  // On add: upsert with onConflict so a duplicate-key (23505) is silently treated as success.
  // On remove: delete by id when local state has the record, or by natural key as fallback.
  // Always refetch so local state is consistent after any toggle.
  async function toggleReaction(targetType, targetId, emoji) {
    if (!currentUserId || !canParticipate) return
    const existing = reactions.find(
      r => r.target_type === targetType && r.target_id === targetId &&
        r.user_id === currentUserId && r.emoji === emoji
    )
    try {
      if (existing) {
        const { error: delErr } = await supabase.from('reactions').delete().eq('id', existing.id)
        if (delErr) throw delErr
      } else {
        const { error: upsErr } = await supabase
          .from('reactions')
          .upsert(
            { target_type: targetType, target_id: targetId, user_id: currentUserId, emoji },
            { onConflict: 'target_type,target_id,user_id,emoji', ignoreDuplicates: true }
          )
        // 23505 = unique_violation — reaction already exists; treat as success.
        if (upsErr && upsErr.code !== '23505') throw upsErr
      }
      await fetchAll()
    } catch (e) {
      // Swallow duplicate-key errors that somehow escape upsert; surface all others.
      if (e.code !== '23505') setError(e.message || 'Could not update reaction.')
      else await fetchAll()
    }
  }

  // --- Vote toggle (up/down, one per user per target) ---
  // Uses upsert so stale local state never causes a duplicate-key error.
  // Clicking the already-active arrow deletes the vote (toggle off).
  async function castVote(targetType, targetId, value) {
    if (!currentUserId || !canParticipate) return
    const existing = votes.find(
      v => v.target_type === targetType && v.target_id === targetId && v.user_id === currentUserId
    )
    try {
      if (existing && existing.value === value) {
        // Clicking the active arrow again removes the vote.
        const { error: delErr } = await supabase.from('votes').delete().eq('id', existing.id)
        if (delErr) throw delErr
      } else {
        // Insert or update (change direction) — upsert handles both cases idempotently.
        const { error: upsErr } = await supabase
          .from('votes')
          .upsert(
            { target_type: targetType, target_id: targetId, user_id: currentUserId, value },
            { onConflict: 'target_type,target_id,user_id' }
          )
        if (upsErr) throw upsErr
      }
      await fetchAll()
    } catch (e) {
      // Swallow duplicate-key errors; surface all others.
      if (e.code !== '23505') setError(e.message || 'Could not record vote.')
      else await fetchAll()
    }
  }

  // --- Delete a review (and cascade its comments client-side) ---
  async function deleteReview(reviewId, authorId) {
    if (!(isAdmin || authorId === currentUserId)) return
    if (!window.confirm('Delete this review and its replies? This cannot be undone.')) return
    try {
      const { error: delErr } = await supabase.from('reviews').delete().eq('id', reviewId)
      if (delErr) throw delErr
      await fetchAll()
    } catch (e) {
      setError(e.message || 'Could not delete review.')
    }
  }

  // --- Delete a comment ---
  async function deleteComment(commentId, authorId) {
    if (!(isAdmin || authorId === currentUserId)) return
    if (!window.confirm('Delete this comment? This cannot be undone.')) return
    try {
      const { error: delErr } = await supabase.from('comments').delete().eq('id', commentId)
      if (delErr) throw delErr
      await fetchAll()
    } catch (e) {
      setError(e.message || 'Could not delete comment.')
    }
  }

  // Once the thread has rendered, scroll the deep-linked post into view and light
  // it up. Runs once per focusId (so reactions/edits don't re-scroll).
  useEffect(() => {
    if (!focusId || loading) return
    if (scrolledForRef.current === focusId) return
    const el = rootRef.current?.querySelector(`[data-thread-id="${focusId}"]`)
    if (!el) return
    scrolledForRef.current = focusId
    setHighlightId(focusId)
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [focusId, loading, reviews, comments])

  // Clear the highlight on the next click anywhere (deferred so the click that
  // opened the thread doesn't immediately clear it).
  useEffect(() => {
    if (!highlightId) return
    const clear = () => setHighlightId(null)
    const t = setTimeout(() => document.addEventListener('click', clear, true), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', clear, true) }
  }, [highlightId])

  const shared = {
    userById, mentionable, reactionsByTarget, votesByTarget,
    currentUserId, isAdmin, canParticipate, now, highlightId,
    onToggleReaction: toggleReaction, onVote: castVote,
    onDeleteComment: deleteComment, onError: setError,
    movieId, onMutated: fetchAll,
  }

  return (
    <div ref={rootRef} style={{ fontFamily: BODY_FONT, color: 'var(--text)' }}>
      <p style={{
        fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-dim)', margin: '0 0 16px',
      }}>
        Discussion{totalCount ? ` · ${totalCount}` : ''}
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

      {/* New review (thread root) composer */}
      {canParticipate ? (
        <Composer
          movieId={movieId}
          currentUserId={currentUserId}
          target="review"
          mentionable={mentionable}
          onPosted={fetchAll}
          onError={setError}
          placeholder="Write a review to start a thread…"
          submitLabel="Post review"
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

      {/* Threads */}
      {loading ? (
        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '8px 0' }}>
          Loading discussion…
        </p>
      ) : reviews.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '8px 0' }}>
          No reviews yet. {canParticipate ? 'Be the first to write one.' : ''}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginTop: '8px' }}>
          {reviews.map(rev => (
            <ReviewThread
              key={rev.id}
              review={rev}
              childComments={commentsByReview[rev.id] || []}
              onDeleteReview={deleteReview}
              {...shared}
            />
          ))}
          {/* Render orphan / legacy film-level comments that have no review_id */}
          {(commentsByReview[UNTHREADED_KEY] || []).length > 0 && (
            <div style={{
              border: '1px solid rgba(var(--fg-rgb),0.1)', borderRadius: '14px',
              padding: '16px', background: 'rgba(var(--fg-rgb),0.02)',
            }}>
              <p style={{
                fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-dim)', margin: '0 0 12px',
              }}>
                Comments
              </p>
              {commentsByReview[UNTHREADED_KEY].map(node => (
                <CommentNode
                  key={node.id}
                  node={node}
                  reviewId={null}
                  depth={0}
                  {...shared}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- A review thread root + its nested comments ----------
function ReviewThread({ review, childComments, onDeleteReview, ...shared }) {
  const {
    userById, mentionable, reactionsByTarget, votesByTarget, currentUserId,
    isAdmin, canParticipate, now, onToggleReaction, onVote,
    onError, movieId, onMutated, highlightId,
  } = shared
  const [replying, setReplying] = useState(false)
  const lit = highlightId === review.id

  return (
    <div
      data-thread-id={review.id}
      style={{
        border: lit ? '1px solid rgba(var(--accent-rgb),0.6)' : '1px solid rgba(var(--fg-rgb),0.1)',
        borderRadius: '14px',
        padding: '16px',
        background: lit ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(var(--fg-rgb),0.02)',
        boxShadow: lit ? '0 0 0 2px rgba(var(--accent-rgb),0.45), 0 0 18px rgba(var(--accent-rgb),0.35)' : 'none',
        transition: 'box-shadow 0.4s ease, background 0.4s ease, border-color 0.4s ease',
      }}>
      <PostCard
        post={review}
        targetType="review"
        userById={userById}
        mentionable={mentionable}
        reactionsByTarget={reactionsByTarget}
        votesByTarget={votesByTarget}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        canParticipate={canParticipate}
        now={now}
        onToggleReaction={onToggleReaction}
        onVote={onVote}
        onDelete={() => onDeleteReview(review.id, review.user_id)}
        onMutated={onMutated}
        onError={onError}
        isReviewRoot
      />

      {/* Reply to the review */}
      {canParticipate && (
        <div style={{ marginTop: '8px', marginLeft: '44px' }}>
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
      {canParticipate && replying && (
        <div style={{ marginLeft: '44px', marginTop: '10px' }}>
          <Composer
            movieId={movieId}
            currentUserId={currentUserId}
            target="comment"
            reviewId={review.id}
            parentId={null}
            mentionable={mentionable}
            placeholder={`Reply to ${userById[review.user_id]?.name || 'review'}…`}
            submitLabel="Reply"
            compact
            onPosted={() => { setReplying(false); onMutated() }}
            onError={onError}
          />
        </div>
      )}

      {/* Nested comment tree */}
      {childComments.length > 0 && (
        <div style={{ marginTop: '16px', marginLeft: '8px' }}>
          {childComments.map(node => (
            <CommentNode
              key={node.id}
              node={node}
              reviewId={review.id}
              depth={0}
              {...shared}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- A recursive nested comment node ----------
function CommentNode({ node, reviewId, depth, ...shared }) {
  const {
    userById, mentionable, reactionsByTarget, votesByTarget, currentUserId,
    isAdmin, canParticipate, now, onToggleReaction, onVote, onDeleteComment,
    onError, movieId, onMutated, highlightId,
  } = shared
  const [replying, setReplying] = useState(false)
  const indent = depth < MAX_DEPTH
  const lit = highlightId === node.id

  return (
    <div
      data-thread-id={node.id}
      style={{
        marginTop: depth === 0 ? 0 : '14px',
        paddingLeft: indent ? '14px' : 0,
        marginLeft: indent ? '4px' : 0,
        borderLeft: indent ? '2px solid rgba(var(--fg-rgb),0.08)' : 'none',
        borderRadius: lit ? '10px' : 0,
        background: lit ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
        boxShadow: lit ? '0 0 0 2px rgba(var(--accent-rgb),0.45), 0 0 18px rgba(var(--accent-rgb),0.3)' : 'none',
        transition: 'box-shadow 0.4s ease, background 0.4s ease',
      }}>
      <PostCard
        post={node}
        targetType="comment"
        userById={userById}
        mentionable={mentionable}
        reactionsByTarget={reactionsByTarget}
        votesByTarget={votesByTarget}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        canParticipate={canParticipate}
        now={now}
        onToggleReaction={onToggleReaction}
        onVote={onVote}
        onDelete={() => onDeleteComment(node.id, node.user_id)}
        onMutated={onMutated}
        onError={onError}
      />

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
      {canParticipate && replying && (
        <div style={{ marginLeft: '44px', marginTop: '10px' }}>
          <Composer
            movieId={movieId}
            currentUserId={currentUserId}
            target="comment"
            reviewId={reviewId}
            parentId={node.id}
            mentionable={mentionable}
            placeholder={`Reply to ${userById[node.user_id]?.name || 'comment'}…`}
            submitLabel="Reply"
            compact
            onPosted={() => { setReplying(false); onMutated() }}
            onError={onError}
          />
        </div>
      )}

      {node.children.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          {node.children.map(child => (
            <CommentNode
              key={child.id}
              node={child}
              reviewId={reviewId}
              depth={depth + 1}
              {...shared}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- A single review or comment card (vote rail + body + actions) ----------
function PostCard({
  post, targetType, userById, mentionable, reactionsByTarget, votesByTarget,
  currentUserId, isAdmin, canParticipate, now, onToggleReaction, onVote,
  onDelete, onMutated, onError, isReviewRoot,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [saving, setSaving] = useState(false)

  const author = userById[post.user_id]
  const name = author?.name || 'Unknown member'
  const isOwn = post.user_id === currentUserId
  const edited = post.updated_at && post.created_at &&
    new Date(post.updated_at).getTime() > new Date(post.created_at).getTime() + 1000

  // Edit allowed only for own post within 15 min of creation.
  const withinEditWindow = isOwn && canParticipate &&
    now - new Date(post.created_at).getTime() < EDIT_WINDOW_MS

  const canDelete = isAdmin || isOwn

  const key = `${targetType}:${post.id}`
  const counts = reactionsByTarget[key] || {}
  const vote = votesByTarget[key] || { score: 0, mine: 0 }

  async function saveEdit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const table = targetType === 'review' ? 'reviews' : 'comments'
      const { error: upErr } = await supabase
        .from(table)
        .update({ body: trimmed, updated_at: new Date().toISOString() })
        .eq('id', post.id)
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
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      {/* Vote rail */}
      <div style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '2px', paddingTop: '2px', width: '28px',
      }}>
        <VoteArrow
          dir="up"
          active={vote.mine === 1}
          disabled={!canParticipate}
          onClick={() => onVote(targetType, post.id, 1)}
        />
        <span style={{
          fontFamily: MONO, fontSize: '12px', fontWeight: 600, lineHeight: 1,
          color: vote.mine === 1 ? '#86efac' : vote.mine === -1 ? '#f87171' : 'var(--text-muted)',
        }}>
          {vote.score}
        </span>
        <VoteArrow
          dir="down"
          active={vote.mine === -1}
          disabled={!canParticipate}
          onClick={() => onVote(targetType, post.id, -1)}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
              background: userColor(author) || avatarColor(name), display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontFamily: BODY_FONT,
              fontWeight: 700, fontSize: '10px', letterSpacing: '0.02em',
            }}
          >
            {initials(name)}
          </div>
          <span style={{
            color: 'var(--text-strong)', fontWeight: 600,
            fontSize: isReviewRoot ? '14px' : '13px',
          }}>
            {name}
          </span>
          {isReviewRoot && (
            <span style={{
              fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'var(--accent-light)',
              border: '1px solid rgba(var(--fg-rgb),0.12)', borderRadius: '999px',
              padding: '1px 7px',
            }}>
              Review
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '0.04em' }}>
            {timeAgo(post.created_at)}
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
                onClick={() => { setEditing(false); setDraft(post.body) }}
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
            margin: '4px 0 0', fontSize: isReviewRoot ? '14px' : '13px', lineHeight: 1.55,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {renderBody(post.body, mentionable)}
          </p>
        )}

        {/* Reactions + actions row */}
        {!editing && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
            {REACTION_EMOJIS.map(emoji => {
              const info = counts[emoji]
              const has = !!info && info.count > 0
              const mine = !!info && info.mine
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(targetType, post.id, emoji)}
                  disabled={!canParticipate}
                  aria-label={`React with ${emoji}${mine ? ' (selected)' : ''}`}
                  aria-pressed={mine}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: has ? '3px 8px' : '3px 7px',
                    borderRadius: '999px',
                    cursor: canParticipate ? 'pointer' : 'default',
                    border: `1px solid ${mine ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.1)'}`,
                    background: mine ? 'rgba(var(--fg-rgb),0.06)' : 'transparent',
                    fontSize: '13px', lineHeight: 1.2, fontFamily: BODY_FONT,
                    opacity: has || mine ? 1 : (canParticipate ? 0.5 : 0.35),
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
                onClick={() => { setDraft(post.body); setEditing(true) }}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '3px 4px', fontFamily: MONO, fontSize: '10px',
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)',
                }}
              >
                Edit
              </button>
            )}

            {/* Delete (own or admin) */}
            {canDelete && (
              <button
                onClick={onDelete}
                aria-label={`Delete ${targetType}`}
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

// ---------- Up/down vote arrow ----------
function VoteArrow({ dir, active, disabled, onClick }) {
  const up = dir === 'up'
  const color = active ? (up ? '#86efac' : '#f87171') : 'var(--text-faint)'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={up ? 'Upvote' : 'Downvote'}
      aria-pressed={active}
      style={{
        background: 'none', border: 'none', padding: '1px',
        cursor: disabled ? 'default' : 'pointer', lineHeight: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {up ? (
          <path d="M8 3l5 6H3z" fill={color} />
        ) : (
          <path d="M8 13L3 7h10z" fill={color} />
        )}
      </svg>
    </button>
  )
}

// Render a post body, highlighting @FirstLast mentions that match a known member.
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

// ---------- Composer with @mention autocomplete (posts a review or a comment) ----------
function Composer({
  movieId, currentUserId, target, reviewId = null, parentId = null,
  mentionable, onPosted, onError, placeholder, submitLabel, compact,
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
      if (target === 'review') {
        const { error: insErr } = await supabase.from('reviews').insert({
          movie_id: movieId,
          user_id: currentUserId,
          body: trimmed,
        })
        if (insErr) throw insErr
      } else {
        const { error: insErr } = await supabase.from('comments').insert({
          movie_id: movieId,
          user_id: currentUserId,
          review_id: reviewId,
          parent_comment_id: parentId,
          body: trimmed,
        })
        if (insErr) throw insErr
      }
      setBody('')
      setMentionQuery(null)
      await onPosted()
    } catch (e) {
      onError(e.message || 'Could not post.')
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
                    background: userColor(m) || avatarColor(m.name), display: 'flex', alignItems: 'center',
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
