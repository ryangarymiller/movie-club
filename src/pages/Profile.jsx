import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getAwardsForUser, fetchAwardsForUser } from '../lib/awards'
import { USER_COLOR_PALETTE, MEMBER_COLORS, hexToRgbTriple } from '../lib/colors'
import AwardsBadges from '../components/AwardsBadges'
import PersonalLists from '../components/PersonalLists'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import { avatarLabel } from '../lib/avatars'
import { deliberateSignOut } from '../lib/authLog'
import { FilmDetailOverlay } from './Films.jsx'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import { useMemberStatsOverlay } from '../context/MemberStatsOverlayContext'
import { useNotifications } from '../context/NotificationsContext'

const ACCENT_SWATCHES = [
  { name: 'crimson',    hex: '#dc2626', label: 'Crimson'    },
  { name: 'ember',      hex: '#ea580c', label: 'Ember'      },
  { name: 'amber',      hex: '#d97706', label: 'Amber'      },
  { name: 'sage',       hex: '#16a34a', label: 'Sage'       },
  { name: 'slate-blue', hex: '#2563eb', label: 'Slate Blue' },
  { name: 'indigo',     hex: '#4f46e5', label: 'Indigo'     },
  { name: 'violet',     hex: '#7c3aed', label: 'Violet'     },
  { name: 'hot-pink',   hex: '#ec4899', label: 'Hot Pink'   },
]

const TMDB_IMG = 'https://image.tmdb.org/t/p/w300'

// Notification event types the member can mute. Glyphs mirror the bulletin/call-sheet
// language used in the notification center so the section reads as the same system.
// `desc` is a one-line clarifier shown under the friendly label.
const NOTIF_TYPES = [
  { key: 'scores_revealed', glyph: '🎬',  label: 'Scores revealed', desc: "A film's scores go public" },
  { key: 'month_active',    glyph: '📅',  label: 'New month starts', desc: 'This month’s films go live' },
  { key: 'month_reveal',    glyph: '🎭',  label: 'End-of-month reveal', desc: 'Scores + pickers revealed' },
  { key: 'reply',           glyph: '💬',  label: 'Replies to me', desc: 'Someone replies to your review or comment' },
  { key: 'mention',         glyph: '@',   label: '@mentions', desc: 'You’re tagged in a review or comment' },
  { key: 'score_change',    glyph: '✏️',  label: 'My score-change decisions', desc: 'Admin approves or denies your request' },
]

// ─── Style helpers ──────────────────────────────────────────────────────────────

const CARD = {
  background: 'rgba(var(--fg-rgb), 0.025)',
  border: '1px solid rgba(var(--fg-rgb), 0.07)',
  borderRadius: '14px',
}

const LABEL_STYLE = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--hairline)',
}

const SECTION_LABEL = {
  ...LABEL_STYLE,
  color: 'var(--text-faint)',
  marginBottom: '12px',
  display: 'block',
}

// Small pill button matching the "Change" affordance on the color picker.
const AVATAR_BTN = {
  flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: '11px',
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)',
  background: 'none', border: '1px solid var(--accent)', borderRadius: '100px',
  padding: '4px 14px', cursor: 'pointer',
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Skeleton({ style = {} }) {
  return (
    <div
      className="animate-pulse"
      style={{ background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: '8px', ...style }}
    />
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ ...CARD, padding: '14px 12px' }}>
      <p style={LABEL_STYLE}>{label}</p>
      <p
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '2rem',
          color: 'var(--text-strong)',
          lineHeight: 1,
          margin: '6px 0 4px',
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            color: 'var(--text-dim)',
            fontSize: '11px',
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

// An accessible on/off switch (role="switch"). On = accent-filled track + knob
// pushed right; off = neutral hairline track. Theme tokens only so light + dark land.
function NotifToggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: 42,
        height: 24,
        borderRadius: '999px',
        border: '1px solid rgba(var(--fg-rgb), 0.12)',
        background: checked ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.10)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.18s ease, border-color 0.18s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: checked ? '20px' : '2px',
          transform: 'translateY(-50%)',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: checked ? '#fff' : 'var(--surface)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
          transition: 'left 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </button>
  )
}

// One event-type row: glyph chip + friendly label/desc on the left, switch on the
// right. On = notified, off = muted.
function NotifTypeRow({ type, enabled, onToggle, isLast }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '11px 0',
        borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb), 0.06)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: type.key === 'mention' ? '15px' : '14px',
          fontWeight: type.key === 'mention' ? 700 : 400,
          fontFamily: type.key === 'mention' ? "'DM Mono', monospace" : undefined,
          color: type.key === 'mention' ? 'var(--accent)' : undefined,
          borderRadius: '8px',
          background: 'rgba(var(--fg-rgb), 0.05)',
          border: '1px solid rgba(var(--fg-rgb), 0.06)',
          lineHeight: 1,
        }}
      >
        {type.glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.3 }}>
          {type.label}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: 1.3 }}>
          {type.desc}
        </p>
      </div>
      <NotifToggle
        checked={enabled}
        onChange={onToggle}
        label={`${enabled ? 'Mute' : 'Unmute'} ${type.label}`}
      />
    </div>
  )
}

// The Browser-push delivery row. When the browser supports push it renders a real
// NotifToggle (same pattern as Email); otherwise it falls back to a disabled,
// "Not supported" affordance. `note` shows an inline error/hint below the row.
function PushChannelRow({ glyph, label, desc, supported, checked, busy, note, onToggle, isLast }) {
  return (
    <div
      style={{
        padding: '11px 0',
        borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb), 0.06)',
        opacity: supported ? 1 : 0.62,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            borderRadius: '8px',
            background: 'rgba(var(--fg-rgb), 0.05)',
            border: '1px solid rgba(var(--fg-rgb), 0.06)',
            lineHeight: 1,
          }}
        >
          {glyph}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: '13.5px',
              fontWeight: 600,
              color: supported ? 'var(--text-strong)' : 'var(--text-muted)',
              lineHeight: 1.3,
            }}
          >
            {label}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: 1.3 }}>
            {supported ? desc : 'Not supported on this browser'}
          </p>
        </div>
        {supported ? (
          <NotifToggle
            checked={checked}
            onChange={onToggle}
            disabled={busy}
            label={`${checked ? 'Disable' : 'Enable'} ${label}`}
          />
        ) : (
          <span
            style={{
              flexShrink: 0,
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              background: 'rgba(var(--fg-rgb), 0.06)',
              border: '1px solid rgba(var(--fg-rgb), 0.08)',
              borderRadius: '999px',
              padding: '3px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            Unsupported
          </span>
        )}
      </div>
      {/* Inline hint: either the supplied error/feedback, or the iOS guidance. */}
      {(note || !supported) && (
        <p
          role={note ? 'alert' : undefined}
          style={{
            margin: '8px 0 0 42px',
            fontSize: '11px',
            color: note ? 'var(--accent)' : 'var(--text-dim)',
            lineHeight: 1.4,
          }}
        >
          {note || 'On iOS, add this app to your Home Screen first to allow push notifications.'}
        </p>
      )}
    </div>
  )
}

function RecentRow({ rating, loading, onFilmClick, isLast }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
        <Skeleton style={{ width: 48, height: 68, borderRadius: '6px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton style={{ height: 14, width: '60%', marginBottom: 6 }} />
          <Skeleton style={{ height: 11, width: '30%' }} />
        </div>
        <Skeleton style={{ width: 40, height: 28 }} />
      </div>
    )
  }

  const { movie, score } = rating
  const clickable = !!(onFilmClick && movie)

  return (
    <button
      onClick={clickable ? () => onFilmClick(movie) : undefined}
      disabled={!clickable}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0',
        width: '100%',
        background: 'none',
        border: 'none',
        borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb), 0.05)',
        cursor: clickable ? 'pointer' : 'default',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      aria-label={clickable ? `Open ${movie?.title}` : undefined}
    >
      {/* Poster */}
      <div
        style={{
          width: 48,
          height: 68,
          borderRadius: '6px',
          overflow: 'hidden',
          background: '#111',
          flexShrink: 0,
        }}
      >
        {movie?.poster_url ? (
          <img
            src={`${TMDB_IMG}${movie.poster_url}`}
            alt={movie?.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '18px',
                color: 'rgba(var(--fg-rgb), 0.15)',
              }}
            >
              {(movie?.title || '?').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Title + year */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            color: 'var(--text-strong)',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            margin: 0,
          }}
        >
          {movie?.title ?? '—'}
        </p>
        {movie?.year_released && (
          <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '2px 0 0' }}>
            {movie.year_released}
          </p>
        )}
      </div>

      {/* Score */}
      <p
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '1.75rem',
          color: 'var(--accent)',
          lineHeight: 1,
          flexShrink: 0,
          margin: 0,
        }}
      >
        {score != null ? Number(score).toFixed(2) : '—'}
      </p>
    </button>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatMemberSince(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return 'Member since ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function Profile({ overlayUserId = null } = {}) {
  const params = useParams()
  // In the member-overlay, the user id comes from a prop; on the /profile/:id
  // route it comes from the URL. The bottom-bar /profile (no id) = own profile.
  const userId = overlayUserId ?? params.userId
  const navigate = useNavigate()
  const { profile, isAdmin, fetchProfile } = useAuth()
  const { accent, setAccent, mode, setMode, MODE_OPTIONS } = useTheme()
  // Persist theme to the user's row so it follows them across devices (it's also
  // kept in localStorage by ThemeContext for instant first paint on this device).
  const persistTheme = (patch) => {
    if (profile?.id) supabase.from('users').update(patch).eq('id', profile.id).then(() => {})
  }
  const { close: closeMemberOverlay } = useMemberOverlay()
  const { openStats: openMemberStats } = useMemberStatsOverlay()
  const {
    prefs: notifPrefs,
    updatePrefs: updateNotifPrefs,
    pushSupported,
    pushEnabled,
    enablePush,
    disablePush,
  } = useNotifications()
  // Inline error/feedback for the push toggle (e.g. permission denied).
  const [pushError, setPushError] = useState('')
  const [pushBusy, setPushBusy] = useState(false)

  const handleTogglePush = useCallback(async (on) => {
    setPushError('')
    setPushBusy(true)
    try {
      if (on) await enablePush()
      else await disablePush()
    } catch (err) {
      // Revert is implicit: the toggle is bound to pushEnabled (channel_push),
      // which we never flipped on failure. Just surface the message.
      setPushError(err?.message || 'Couldn’t change push notifications.')
    } finally {
      setPushBusy(false)
    }
  }, [enablePush, disablePush])
  const isOverlayMode = !!overlayUserId

  // If viewing another member's profile, load their data
  const isOwnProfile = !userId || userId === profile?.id
  const [viewedUser, setViewedUser] = useState(null)
  const [, setViewedUserLoading] = useState(false)

  useEffect(() => {
    if (isOwnProfile) {
      setViewedUser(null)
      return
    }
    setViewedUserLoading(true)
    supabase
      .from('users')
      .select('id, name, email, user_color, avatar_id, joined_at, role, is_op, is_active')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setViewedUser(data ?? null)
        setViewedUserLoading(false)
      })
  }, [userId, isOwnProfile])

  // The profile data to display: either viewed user (read-only) or own profile
  const displayProfile = isOwnProfile ? profile : viewedUser

  const [statsLoading, setStatsLoading] = useState(true)
  const [stats, setStats] = useState(null)          // { count, avg, highest, lowest }
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentRatings, setRecentRatings] = useState([]) // [{movie, score, submitted_at}]
  const [signingOut, setSigningOut] = useState(false)
  const [adminToggling, setAdminToggling] = useState(false)
  const [userAwards, setUserAwards] = useState([])
  const [awardsLoading, setAwardsLoading] = useState(true)
  // Colors already claimed by other members (one-per-member rule)
  const [takenColors, setTakenColors] = useState(new Set())
  // Color picker expand/collapse
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  // Picks section
  const [pickedFilms, setPickedFilms] = useState([])  // [{movie, monthYear, avgScore}]
  const [picksLoading, setPicksLoading] = useState(true)
  // Film overlay
  const [overlayMovie, setOverlayMovie] = useState(null)

  // ── Fetch other members' colors ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOwnProfile || !profile) return
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, user_color, email')
          .neq('id', profile.id)
          .neq('email', 'i.am.ryan.the.miller@gmail.com')
        if (!alive) return
        const taken = new Set()
        for (const u of (data ?? [])) {
          if (u.user_color) {
            taken.add(u.user_color)
          } else if (u.name && MEMBER_COLORS[u.name]) {
            taken.add(MEMBER_COLORS[u.name])
          }
        }
        setTakenColors(taken)
      } catch { /* ignore — transient/test mock */ }
    })()
    return () => { alive = false }
  }, [isOwnProfile, profile])

  // ── Fetch stats + recent scores ──────────────────────────────────────────────
  useEffect(() => {
    if (!displayProfile) return
    setStatsLoading(true)
    setRecentLoading(true)

    async function load() {
      const { data: ratings } = await supabase
        .from('ratings')
        .select('id, movie_id, score, pre_watch_excitement, submitted_at')
        .eq('user_id', displayProfile.id)
        .not('score', 'is', null)
        .order('submitted_at', { ascending: false })

      if (!ratings || ratings.length === 0) {
        setStats({ count: 0, avg: null, highest: null, lowest: null })
        setRecentRatings([])
        setStatsLoading(false)
        setRecentLoading(false)
        return
      }

      // Compute stats
      const scores = ratings.map(r => Number(r.score))
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const maxScore = Math.max(...scores)
      const minScore = Math.min(...scores)
      const highestRating = ratings.find(r => Number(r.score) === maxScore)
      const lowestRating = ratings.find(r => Number(r.score) === minScore)

      // Fetch movie titles for highest/lowest + recent 5
      const neededIds = new Set([
        ...ratings.slice(0, 5).map(r => r.movie_id),
        highestRating?.movie_id,
        lowestRating?.movie_id,
      ].filter(Boolean))

      const { data: movies } = await supabase
        .from('movies_safe')
        .select('id, title, poster_url, year_released, director')
        .in('id', [...neededIds])

      const movieMap = Object.fromEntries((movies ?? []).map(m => [m.id, m]))

      setStats({
        count: ratings.length,
        avg,
        highest: { score: maxScore, movie: movieMap[highestRating?.movie_id] },
        lowest:  { score: minScore, movie: movieMap[lowestRating?.movie_id] },
      })
      setStatsLoading(false)

      setRecentRatings(
        ratings.slice(0, 5).map(r => ({
          ...r,
          movie: movieMap[r.movie_id] ?? null,
        }))
      )
      setRecentLoading(false)
    }

    load()
  }, [displayProfile])

  // ── Load awards this user has won — prefer DB read; fall back to compute ────────
  useEffect(() => {
    if (!displayProfile) return
    let cancelled = false
    async function loadAwards() {
      if (!cancelled) setAwardsLoading(true)
      // Try DB first
      const dbAwards = await fetchAwardsForUser(supabase, displayProfile.id)
      if (cancelled) return
      if (dbAwards.length > 0) {
        setUserAwards(dbAwards)
        setAwardsLoading(false)
        return
      }
      // DB empty — fall back to compute approach
      try {
        const [
          { data: moviesData },
          { data: ratingsData },
          { data: usersData },
          { data: monthsData },
          { data: seasonsData },
        ] = await Promise.all([
          supabase.from('movies_safe').select('id, month_id, title, poster_url, year_released, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id'),
          supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, submitted_at'),
          supabase.from('users').select('id, name, email, role, joined_at, is_active'),
          supabase.from('months').select('id, season_id, month_year, status'),
          supabase.from('seasons').select('id, name, start_date, end_date'),
        ])
        if (cancelled) return
        const data = {
          movies: moviesData ?? [],
          ratings: ratingsData ?? [],
          users: usersData ?? [],
          months: monthsData ?? [],
          seasons: seasonsData ?? [],
        }
        setUserAwards(getAwardsForUser(displayProfile.id, data))
      } catch {
        if (!cancelled) setUserAwards([])
      }
      if (!cancelled) setAwardsLoading(false)
    }
    loadAwards()
    return () => { cancelled = true }
  }, [displayProfile])

  // ── Load revealed picks for this user ────────────────────────────────────────
  useEffect(() => {
    if (!displayProfile) return
    let cancelled = false

    async function loadPicks() {
      if (!cancelled) setPicksLoading(true)
      try {
        // Query movies where picker_revealed = true and picked_by_user_id = displayProfile.id
        const { data: movies } = await supabase
          .from('movies_safe')
          .select('id, month_id, title, poster_url, year_released, historical_avg_score, picker_revealed, picked_by_user_id, scores_revealed')
          .eq('picker_revealed', true)
          .eq('picked_by_user_id', displayProfile.id)

        if (cancelled || !movies || movies.length === 0) {
          if (!cancelled) setPickedFilms([])
          if (!cancelled) setPicksLoading(false)
          return
        }

        // Fetch month info for ordering
        const monthIds = [...new Set(movies.map(m => m.month_id))]
        const { data: months } = await supabase
          .from('months')
          .select('id, month_year')
          .in('id', monthIds)

        const monthMap = Object.fromEntries((months ?? []).map(m => [m.id, m.month_year]))

        // For movies without historical_avg_score, compute avg from ratings
        const needAvg = movies.filter(m => m.historical_avg_score == null)
        let ratingsMap = {}
        if (needAvg.length > 0) {
          const { data: ratings } = await supabase
            .from('ratings')
            .select('movie_id, score')
            .in('movie_id', needAvg.map(m => m.id))
            .not('score', 'is', null)
          for (const r of (ratings ?? [])) {
            if (!ratingsMap[r.movie_id]) ratingsMap[r.movie_id] = []
            ratingsMap[r.movie_id].push(Number(r.score))
          }
        }

        function computeAvg(movieId) {
          const scores = ratingsMap[movieId] ?? []
          if (scores.length === 0) return null
          return scores.reduce((a, b) => a + b, 0) / scores.length
        }

        const result = movies.map(m => ({
          movie: m,
          monthYear: monthMap[m.month_id] ?? '',
          avgScore: m.historical_avg_score != null
            ? Number(m.historical_avg_score)
            : computeAvg(m.id),
        }))

        // Sort by month ascending (earliest pick first)
        result.sort((a, b) => (a.monthYear < b.monthYear ? -1 : a.monthYear > b.monthYear ? 1 : 0))

        if (!cancelled) {
          setPickedFilms(result)
          setPicksLoading(false)
        }
      } catch {
        if (!cancelled) {
          setPickedFilms([])
          setPicksLoading(false)
        }
      }
    }

    loadPicks()
    return () => { cancelled = true }
  }, [displayProfile])

  // ── Notification preferences ──────────────────────────────────────────────────
  const mutedTypes = notifPrefs?.muted_types ?? []
  // Toggle a single event type's notified/muted state. on → ensure NOT muted;
  // off → add to muted_types. We send the full next array so the upsert is atomic.
  function toggleNotifType(typeKey, enabled) {
    const set = new Set(mutedTypes)
    if (enabled) set.delete(typeKey)
    else set.add(typeKey)
    updateNotifPrefs({ muted_types: [...set] })
  }
  // Sensible default quiet window (overnight) shown when nothing is set yet.
  const QUIET_DEFAULTS = { quiet_start: '22:00', quiet_end: '08:00' }
  function setQuietHour(field, value) {
    // Empty input clears the bound (stored as null).
    if (!value) { updateNotifPrefs({ [field]: null }); return }
    const other = field === 'quiet_start' ? 'quiet_end' : 'quiet_start'
    const otherCurrent = (notifPrefs?.[other] ?? '').slice(0, 5)
    const patch = { [field]: `${value}:00` }
    // Completing the window: if the other bound is still unset, seed it with its
    // default so touching either field yields a full, active quiet range.
    if (!otherCurrent) patch[other] = `${QUIET_DEFAULTS[other]}:00`
    updateNotifPrefs(patch)
  }
  // <input type="time"> wants HH:MM; the DB stores HH:MM:SS — trim for display.
  // Fall back to the defaults so the fields autofill instead of showing blank.
  const quietStartVal = (notifPrefs?.quiet_start ?? '').slice(0, 5)
  const quietEndVal = (notifPrefs?.quiet_end ?? '').slice(0, 5)
  const quietStartShown = quietStartVal || QUIET_DEFAULTS.quiet_start
  const quietEndShown = quietEndVal || QUIET_DEFAULTS.quiet_end

  // ── Sign out ─────────────────────────────────────────────────────────────────
  async function handleSignOut() {
    setSigningOut(true)
    await deliberateSignOut() // tags the sign-out as user-initiated, then signs out
  }

  // ── Admin mode toggle ────────────────────────────────────────────────────────
  async function handleAdminModeToggle() {
    if (!profile || adminToggling) return
    setAdminToggling(true)
    await supabase
      .from('users')
      .update({ admin_mode_enabled: !profile.admin_mode_enabled })
      .eq('id', profile.id)
    await fetchProfile(profile.id)
    setAdminToggling(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const memberSince = formatMemberSince(displayProfile?.joined_at)

  // When viewing ANOTHER member's profile, recolor the accent to *their* user
  // color so the accent-driven bits (colored text, "View full stats" button, etc.)
  // match their identity — same idea as MemberStatsOverlay. Scoped to this subtree
  // via CSS custom properties (cascades into the inline var(--accent) styles), so
  // the rest of the app keeps the viewer's accent. Own profile is unaffected.
  const memberAccent = !isOwnProfile ? (displayProfile?.user_color || null) : null
  const memberAccentRgb = memberAccent ? hexToRgbTriple(memberAccent) : null
  const accentVars = memberAccent
    ? { '--accent': memberAccent, ...(memberAccentRgb ? { '--accent-rgb': memberAccentRgb } : {}) }
    : null

  return (
    <div
      style={{
        ...accentVars,
        background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
        fontFamily: "'DM Sans', sans-serif",
        minHeight: '100vh',
        paddingBottom: '6rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* ── Section 1: Profile Header ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Avatar (chosen image or colored initials) */}
            <Avatar user={displayProfile} size={64} />

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '2rem',
                    color: 'var(--text-strong)',
                    margin: 0,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {displayProfile?.name ?? '—'}
                </h1>
                {/* Tier badge reflects the DISPLAYED member's role (op > admin),
                    not the signed-in viewer's — so it shows only for actual
                    admins/op, on their own profile and in the member overlay. */}
                {(displayProfile?.is_op || displayProfile?.role === 'admin') && (
                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '9px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: '100px',
                      padding: '2px 8px',
                      lineHeight: 1.6,
                    }}
                  >
                    {displayProfile?.is_op ? 'Op' : 'Admin'}
                  </span>
                )}
              </div>
              <p
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '13px',
                  margin: '4px 0 0',
                }}
              >
                {memberSince}
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 1b: Your Color ── */}
        {isOwnProfile && <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.04s ease both' }}>
          <span style={SECTION_LABEL}>Your Color</span>

          <div style={{ ...CARD, padding: '16px' }}>
            {/* Collapsed view: show chosen swatch + "Change" button */}
            {!colorPickerOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Current color swatch */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: displayProfile?.user_color ?? 'var(--accent)',
                    outline: '2px solid white',
                    outlineOffset: '2px',
                    flexShrink: 0,
                  }}
                />
                <button
                  onClick={() => setColorPickerOpen(true)}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    background: 'none',
                    border: '1px solid var(--accent)',
                    borderRadius: '100px',
                    padding: '4px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              /* Expanded picker */
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 36px)',
                  gap: '10px',
                }}>
                  {USER_COLOR_PALETTE.map(color => {
                    const active = displayProfile?.user_color === color
                    const taken = takenColors.has(color) && !active
                    return (
                      <div
                        key={color}
                        style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}
                      >
                        <button
                          onClick={async () => {
                            if (taken) return
                            await supabase.from('users').update({ user_color: color }).eq('id', profile.id)
                            await fetchProfile(profile.id)
                            setColorPickerOpen(false)
                          }}
                          title={taken ? `${color} (taken)` : color}
                          aria-label={taken ? `${color} taken` : color}
                          aria-pressed={active}
                          disabled={taken}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: color,
                            border: 'none',
                            padding: 0,
                            cursor: taken ? 'not-allowed' : 'pointer',
                            flexShrink: 0,
                            outline: active ? '2px solid white' : 'none',
                            outlineOffset: active ? '2px' : undefined,
                            transition: 'outline 0.15s',
                            opacity: taken ? 0.35 : 1,
                          }}
                        />
                        {taken && (
                          /* strikethrough diagonal line */
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%) rotate(-45deg)',
                              width: '120%',
                              height: '2px',
                              background: 'rgba(255,255,255,0.75)',
                              borderRadius: '1px',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                  <p style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '10px',
                    color: 'var(--text-dim)',
                    margin: 0,
                  }}>
                    Dimmed colors are taken by other members.
                  </p>
                  <button
                    onClick={() => setColorPickerOpen(false)}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '10px',
                      letterSpacing: '0.06em',
                      color: 'var(--text-dim)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 0 0 8px',
                      flexShrink: 0,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </section>}

        {/* ── Section 1c: Your Avatar ── */}
        {isOwnProfile && <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.05s ease both' }}>
          <span style={SECTION_LABEL}>Your Avatar</span>
          <div style={{ ...CARD, padding: '16px' }}>
            {!avatarPickerOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar user={displayProfile} size={44} />
                <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                  {avatarLabel(displayProfile?.avatar_id) ?? 'No avatar — colored initials'}
                </p>
                <button onClick={() => setAvatarPickerOpen(true)} style={AVATAR_BTN}>Change</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <Avatar user={displayProfile} size={44} />
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    {avatarLabel(displayProfile?.avatar_id) ?? 'No avatar — colored initials'}
                  </p>
                  <button onClick={() => setAvatarPickerOpen(false)} style={AVATAR_BTN}>Done</button>
                </div>
                <AvatarPicker
                  currentId={displayProfile?.avatar_id ?? null}
                  color={displayProfile?.user_color}
                  busy={avatarBusy}
                  onSelect={async (id) => {
                    if (avatarBusy) return
                    setAvatarBusy(true)
                    await supabase.from('users').update({ avatar_id: id }).eq('id', profile.id)
                    await fetchProfile(profile.id)
                    setAvatarBusy(false)
                  }}
                />
              </>
            )}
          </div>
        </section>}

        {/* ── Section 2: Personal Stats Snapshot ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.08s ease both' }}>
          <span style={SECTION_LABEL}>{isOwnProfile ? 'Your Stats' : `${displayProfile?.name?.split(' ')[0] ?? 'Their'}'s Stats`}</span>

          {statsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} style={{ height: '88px', borderRadius: '14px' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <StatCard
                label="Films Scored"
                value={stats?.count ?? 0}
                sub={stats?.count === 1 ? 'film rated' : 'films rated'}
              />
              <StatCard
                label="Avg Score Given"
                value={stats?.avg != null ? Number(stats.avg).toFixed(2) : '—'}
                sub="across all films"
              />
              <StatCard
                label="Highest Score"
                value={stats?.highest?.score != null ? Number(stats.highest.score).toFixed(2) : '—'}
                sub={stats?.highest?.movie?.title}
              />
              <StatCard
                label="Lowest Score"
                value={stats?.lowest?.score != null ? Number(stats.lowest.score).toFixed(2) : '—'}
                sub={stats?.lowest?.movie?.title}
              />
            </div>
          )}
        </section>

        {/* ── Section 3: Recent Scores ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.16s ease both' }}>
          <span style={SECTION_LABEL}>Recent Scores</span>

          <div style={{ ...CARD, padding: '4px 14px' }}>
            {recentLoading ? (
              [...Array(5)].map((_, i) => <RecentRow key={i} loading />)
            ) : recentRatings.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                No scores submitted yet.
              </p>
            ) : (
              recentRatings.map((r, i) => (
                <RecentRow
                  key={r.id}
                  rating={r}
                  loading={false}
                  onFilmClick={r.movie ? (m) => setOverlayMovie(m) : undefined}
                  isLast={i === recentRatings.length - 1}
                />
              ))
            )}
          </div>
        </section>

        {/* ── Section 3b: Awards ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.2s ease both' }}>
          <AwardsBadges
            awards={userAwards}
            loading={awardsLoading}
            onAwardClick={(award) => {
              const key = award.award_key || award.key || ''
              const ref = award.period_ref || award.periodRef || ''
              const scope = award.scope || ''
              if (isOverlayMode) closeMemberOverlay()
              navigate(`/awards?scope=${encodeURIComponent(scope)}&key=${encodeURIComponent(key)}&ref=${encodeURIComponent(ref)}`)
            }}
          />
        </section>

        {/* ── Popup-only: View full stats link ── */}
        {isOverlayMode && (
          <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.22s ease both' }}>
            <button
              onClick={() => {
                closeMemberOverlay()
                openMemberStats(displayProfile.id)
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(var(--accent-rgb), 0.08)',
                border: '1px solid rgba(var(--accent-rgb), 0.2)',
                color: 'var(--accent)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              View full stats
              <span style={{ fontSize: '16px', lineHeight: 1 }}>&#8594;</span>
            </button>
          </section>
        )}

        {/* ── Section 3c: Picks ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.22s ease both' }}>
          <span style={SECTION_LABEL}>
            {isOwnProfile ? 'Films You Picked' : `${displayProfile?.name?.split(' ')[0] ?? 'Their'}'s Picks`}
          </span>

          {picksLoading ? (
            <div style={{ ...CARD, padding: '4px 14px' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
                  <div
                    className="animate-pulse"
                    style={{ width: 48, height: 68, borderRadius: '6px', background: 'rgba(var(--fg-rgb), 0.05)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="animate-pulse" style={{ height: 14, width: '60%', background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: 4, marginBottom: 6 }} />
                    <div className="animate-pulse" style={{ height: 11, width: '30%', background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: 4 }} />
                  </div>
                  <div className="animate-pulse" style={{ width: 40, height: 28, background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : pickedFilms.length === 0 ? (
            <div style={{ ...CARD, padding: '16px 14px' }}>
              <p style={{ color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
                No revealed picks yet.
              </p>
            </div>
          ) : (
            <div style={{ ...CARD, padding: '4px 14px' }}>
              {pickedFilms.map(({ movie, monthYear, avgScore }, i) => {
                const monthLabel = monthYear
                  ? new Date(`${monthYear}-02`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : ''
                return (
                  <button
                    key={movie.id}
                    onClick={() => setOverlayMovie(movie)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 0',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      borderBottom: i === pickedFilms.length - 1
                        ? 'none'
                        : '1px solid rgba(var(--fg-rgb), 0.05)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    aria-label={`${movie.title} — picked ${monthLabel}`}
                  >
                    {/* Poster */}
                    <div
                      style={{
                        width: 48,
                        height: 68,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        background: '#111',
                        flexShrink: 0,
                      }}
                    >
                      {movie.poster_url ? (
                        <img
                          src={`${TMDB_IMG}${movie.poster_url}`}
                          alt={movie.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: '18px',
                              color: 'rgba(var(--fg-rgb), 0.15)',
                            }}
                          >
                            {(movie.title || '?').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Title + month */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: 'var(--text-strong)',
                          fontSize: '14px',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          margin: 0,
                        }}
                      >
                        {movie.title ?? '—'}
                      </p>
                      {monthLabel && (
                        <p
                          style={{
                            fontFamily: "'DM Mono', monospace",
                            fontSize: '10px',
                            letterSpacing: '0.06em',
                            color: 'var(--text-dim)',
                            margin: '3px 0 0',
                            textTransform: 'uppercase',
                          }}
                        >
                          {monthLabel}
                        </p>
                      )}
                    </div>

                    {/* Club avg */}
                    <p
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: '1.75rem',
                        color: 'var(--accent)',
                        lineHeight: 1,
                        flexShrink: 0,
                        margin: 0,
                      }}
                    >
                      {avgScore != null ? Number(avgScore).toFixed(2) : '—'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Section 3d: Personal Lists — watchlist + draft queue (own profile only, private) ── */}
        {isOwnProfile && (
          <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.22s ease both' }}>
            <PersonalLists userId={profile.id} />
          </section>
        )}

        {/* ── Section 4: Appearance Settings ── */}
        {isOwnProfile && <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.24s ease both' }}>
          <span style={SECTION_LABEL}>Appearance</span>

          <div style={{ ...CARD, padding: '16px' }}>
            {/* Theme mode: Light · Sepia · Grey · Dark (lightest → darkest) */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ ...LABEL_STYLE, margin: '0 0 10px' }}>
                Theme
              </p>
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(var(--fg-rgb), 0.06)', borderRadius: '10px', padding: '4px' }}>
                {(MODE_OPTIONS ?? ['light', 'sepia', 'grey', 'dark']).map(opt => (
                  <button
                    key={opt}
                    onClick={() => { if (mode !== opt) { setMode(opt); persistTheme({ theme_mode: opt }) } }}
                    aria-pressed={mode === opt}
                    style={{
                      flex: 1,
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '11px',
                      letterSpacing: '0.06em',
                      textTransform: 'capitalize',
                      padding: '6px 4px',
                      borderRadius: '7px',
                      border: 'none',
                      background: mode === opt ? 'rgba(var(--fg-rgb), 0.15)' : 'transparent',
                      color: mode === opt ? 'var(--text-strong)' : 'rgba(var(--fg-rgb), 0.4)',
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                      fontWeight: mode === opt ? 600 : 400,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <p
              style={{
                ...LABEL_STYLE,
                marginBottom: '14px',
                display: 'block',
              }}
            >
              Accent Color
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {ACCENT_SWATCHES.map(swatch => {
                const active = accent === swatch.name
                return (
                  <button
                    key={swatch.name}
                    onClick={() => { setAccent(swatch.name); persistTheme({ theme_accent: swatch.name }) }}
                    title={swatch.label}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: swatch.hex,
                      border: active ? '2px solid white' : '2px solid transparent',
                      boxShadow: active ? `0 0 0 2px ${swatch.hex}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      outline: 'none',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                      flexShrink: 0,
                    }}
                    aria-label={swatch.label}
                    aria-pressed={active}
                  />
                )
              })}
            </div>

            <p
              style={{
                color: 'var(--text-faint)',
                fontSize: '12px',
                marginTop: '12px',
                margin: '12px 0 0',
              }}
            >
              {ACCENT_SWATCHES.find(s => s.name === accent)?.label ?? ''}
            </p>
          </div>
        </section>}

        {/* ── Section 4b: Notifications ── */}
        {isOwnProfile && <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.26s ease both' }}>
          <span style={SECTION_LABEL}>Notifications</span>

          <div style={{ ...CARD, padding: '16px' }}>
            {/* Per-type toggles. On = notified, off = muted (hidden from the bell
                immediately and excluded from the unread badge). */}
            <p style={{ ...LABEL_STYLE, margin: '0 0 4px', display: 'block' }}>What you’re notified about</p>
            <div style={{ marginTop: '4px' }}>
              {NOTIF_TYPES.map((t, i) => (
                <NotifTypeRow
                  key={t.key}
                  type={t}
                  enabled={!mutedTypes.includes(t.key)}
                  onToggle={(enabled) => toggleNotifType(t.key, enabled)}
                  isLast={i === NOTIF_TYPES.length - 1}
                />
              ))}
            </div>

            {/* Quiet hours */}
            <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid rgba(var(--fg-rgb), 0.07)' }}>
              <p style={{ ...LABEL_STYLE, margin: '0 0 4px', display: 'block' }}>Quiet hours</p>
              <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                Used for push &amp; email. In-app notifications always appear.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
                {[
                  { label: 'From', field: 'quiet_start', value: quietStartShown },
                  { label: 'Until', field: 'quiet_end', value: quietEndShown },
                ].map(({ label, field, value }) => (
                  <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ ...LABEL_STYLE, color: 'var(--text-dim)' }}>{label}</span>
                    <input
                      type="time"
                      value={value}
                      onChange={(e) => setQuietHour(field, e.target.value)}
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '13px',
                        color: 'var(--text-strong)',
                        background: 'rgba(var(--fg-rgb), 0.04)',
                        border: '1px solid rgba(var(--fg-rgb), 0.12)',
                        borderRadius: '9px',
                        padding: '8px 10px',
                        colorScheme: (mode === 'dark' || mode === 'grey') ? 'dark' : 'light',
                      }}
                    />
                  </label>
                ))}
                {(quietStartVal || quietEndVal) && (
                  <button
                    type="button"
                    onClick={() => updateNotifPrefs({ quiet_start: null, quiet_end: null })}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '10px',
                      letterSpacing: '0.06em',
                      color: 'var(--text-dim)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 0',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Delivery channels. Both are live: email via Resend and browser push
                via the send-push Edge Function — for enabled, unmuted notifications,
                respecting quiet hours. */}
            <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid rgba(var(--fg-rgb), 0.07)' }}>
              <p style={{ ...LABEL_STYLE, margin: '0 0 6px', display: 'block' }}>Delivery</p>
              <NotifTypeRow
                type={{ key: 'channel_email', glyph: '✉️', label: 'Email', desc: 'Also email me for notifications I haven’t muted' }}
                enabled={!!notifPrefs?.channel_email}
                onToggle={(on) => updateNotifPrefs({ channel_email: on })}
              />
              <PushChannelRow
                glyph="🔔"
                label="Browser push"
                desc="Get notified even when the app is closed"
                supported={pushSupported}
                checked={pushEnabled}
                busy={pushBusy}
                note={pushError}
                onToggle={handleTogglePush}
                isLast
              />
            </div>
          </div>
        </section>}

        {/* ── Section 5: Admin ── */}
        {isOwnProfile && isAdmin && (
          <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.30s ease both' }}>
            <span style={SECTION_LABEL}>Admin</span>

            <div style={{ ...CARD, padding: '16px' }}>
              {/* Admin Mode row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: 'rgba(var(--fg-rgb), 0.8)',
                  }}
                >
                  Admin Mode
                </span>

                {/* Toggle switch */}
                <button
                  onClick={handleAdminModeToggle}
                  disabled={adminToggling}
                  aria-pressed={!!profile?.admin_mode_enabled}
                  aria-label="Toggle admin mode"
                  style={{
                    position: 'relative',
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    border: 'none',
                    padding: 0,
                    cursor: adminToggling ? 'not-allowed' : 'pointer',
                    background: profile?.admin_mode_enabled
                      ? 'var(--accent)'
                      : 'rgba(var(--fg-rgb), 0.12)',
                    transition: 'background 0.2s ease',
                    flexShrink: 0,
                    outline: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: profile?.admin_mode_enabled ? '22px' : '3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'var(--text-strong)',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </button>
              </div>

              {/* Note */}
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  color: 'var(--text-faint)',
                  margin: '10px 0 0',
                  letterSpacing: '0.04em',
                }}
              >
                Shows the Admin tab in navigation
              </p>
            </div>
          </section>
        )}

        {/* ── Section 6: Sign Out ── */}
        {isOwnProfile && <section style={{ animation: 'fadeUp 0.45s 0.32s ease both', paddingBottom: '1rem' }}>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              color: signingOut ? 'var(--text-dim)' : '#f87171',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              fontWeight: 500,
              cursor: signingOut ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </section>}

      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Film Detail Overlay ── */}
      {overlayMovie && (
        <FilmDetailOverlay
          movie={overlayMovie}
          onClose={() => setOverlayMovie(null)}
        />
      )}
    </div>
  )
}
