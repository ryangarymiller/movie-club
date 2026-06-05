import { avatarSrc } from '../lib/avatars'
import { userColor } from '../lib/colors'

// Member avatar: shows the chosen avatar image (users.avatar_id → /avatars/<id>.webp)
// inside a ring in the member's user color; falls back to colored initials when no
// avatar is set. Reusable everywhere a member is shown.
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function Avatar({ user, size = 40, ring = true, onClick, title, style }) {
  const src = avatarSrc(user?.avatar_id)
  const color = userColor(user) || 'var(--accent)'
  const box = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    border: ring ? `2px solid ${color}` : 'none',
    background: 'rgba(var(--fg-rgb), 0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  }
  return (
    <div onClick={onClick} title={title} style={box}>
      {src ? (
        <img
          src={src}
          alt={user?.name ? `${user.name}'s avatar` : 'avatar'}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif", color,
          fontSize: Math.round(size * 0.4), letterSpacing: '0.03em', lineHeight: 1,
          paddingLeft: '0.04em',
        }}>
          {initials(user?.name)}
        </span>
      )}
    </div>
  )
}
