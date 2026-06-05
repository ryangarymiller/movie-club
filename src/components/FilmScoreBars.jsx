import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip,
} from 'recharts'
import { userColor } from '../lib/colors'

// Per-member score bar chart for a single film, with glowing mean (μ) and ±1
// std-dev (σ) reference lines and a data-fitted x-domain. Self-contained so it
// can be dropped on the film overlay without depending on Stats internals (Stats
// already imports from Films, so importing back would be a cycle). Mirrors the
// look of Stats' MemberScoreBars.

// Full first + last name (drops any middle names) for the score-breakdown axis.
function firstLast(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0]
}

// Tight domain so clustered scores (e.g. all > 7) spread out instead of wasting
// the full 0–10 range. Pads, snaps to 0.5, clamps to [0,10].
function niceScoreDomain(values) {
  const vs = values.filter(v => Number.isFinite(v))
  if (!vs.length) return [0, 10]
  let lo = Math.min(...vs), hi = Math.max(...vs)
  if (hi - lo < 0.5) { lo -= 0.5; hi += 0.5 }
  const pad = Math.max(0.4, (hi - lo) * 0.18)
  const dLo = Math.max(0, Math.floor((lo - pad) * 2) / 2)
  const dHi = Math.min(10, Math.ceil((hi + pad) * 2) / 2)
  return dLo < dHi ? [dLo, dHi] : [0, 10]
}

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb),0.12)', borderRadius: '8px', padding: '6px 9px', fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--text-strong)' }}>
      {p.payload?.name}: {Number(p.value).toFixed(2)}
    </div>
  )
}

// ratings: [{ user_id, score }] for THIS film (already test-filtered).
// users:   [{ id, name, ... }]. onMember(id) optional.
export default function FilmScoreBars({ ratings = [], users = [], height, onMember }) {
  const userById = {}
  for (const u of users) userById[u.id] = u

  const data = ratings
    .filter(r => r.score != null && userById[r.user_id])
    .map(r => {
      const u = userById[r.user_id]
      return { id: u.id, name: firstLast(u.name), value: Number(r.score), fill: userColor(u) || 'var(--accent)' }
    })
    .sort((a, b) => b.value - a.value)

  if (data.length === 0) {
    return (
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center', padding: '18px 0', margin: 0 }}>
        No member scores yet.
      </p>
    )
  }

  const scores = data.map(d => d.value)
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length
  const sd = scores.length > 1
    ? Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length)
    : 0

  const domainVals = [...scores, mean]
  if (sd > 0) domainVals.push(mean - sd, mean + sd)
  const domain = niceScoreDomain(domainVals)
  const sdLo = sd > 0 ? Math.max(domain[0], mean - sd) : null
  const sdHi = sd > 0 ? Math.min(domain[1], mean + sd) : null

  const h = height || Math.max(130, data.length * 30 + 44)

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--fg-rgb),0.07)" horizontal={false} />
        <XAxis type="number" domain={domain} allowDecimals tickFormatter={(v) => Number(v).toFixed(1)} tick={{ fontSize: 9, fill: 'var(--text-faint)', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={104}
          tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ScoreTooltip />} cursor={false} />
        <Bar
          dataKey="value"
          name="Score"
          radius={[0, 3, 3, 0]}
          isAnimationActive={false}
          onClick={onMember ? (d) => d?.payload?.id && onMember(d.payload.id) : undefined}
          style={onMember ? { cursor: 'pointer' } : undefined}
        >
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
        {sdLo != null && (
          <>
            <ReferenceLine x={sdLo} stroke="var(--accent-light)" strokeWidth={6} strokeOpacity={0.18} />
            <ReferenceLine x={sdHi} stroke="var(--accent-light)" strokeWidth={6} strokeOpacity={0.18} />
            <ReferenceLine x={sdLo} stroke="var(--accent-light)" strokeWidth={1.8} strokeOpacity={0.95} />
            <ReferenceLine x={sdHi} stroke="var(--accent-light)" strokeWidth={1.8} strokeOpacity={0.95}
              label={{ value: `σ ${sd.toFixed(2)}`, position: 'bottom', fontSize: 9, fill: 'var(--accent-light)', fontFamily: 'DM Mono', fontWeight: 700 }} />
          </>
        )}
        <ReferenceLine x={mean} stroke="var(--text-strong)" strokeWidth={7} strokeOpacity={0.22} />
        <ReferenceLine x={mean} stroke="var(--text-strong)" strokeWidth={2.4}
          label={{ value: `μ ${mean.toFixed(2)}`, position: 'top', fontSize: 10, fill: 'var(--text-strong)', fontFamily: 'DM Mono', fontWeight: 700 }} />
      </BarChart>
    </ResponsiveContainer>
  )
}
