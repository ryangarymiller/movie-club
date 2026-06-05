import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import { useMemberStatsOverlay } from '../context/MemberStatsOverlayContext'
import { FilmDetailOverlay } from './Films'
import { userColor, CHART_NEUTRAL, CHART_CATEGORICAL, chartColorAt } from '../lib/colors'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from 'recharts'

// ─── Chart theming ────────────────────────────────────────────────────────────
// Charts render on a dark glass surface. We resolve --accent at runtime so the
// member's chosen accent color flows through. Everything else uses muted greys
// that read on both light and dark cards.

const CHART = {
  grid: 'rgba(var(--fg-rgb), 0.06)',
  axis: 'var(--text-faint)',
  axisLine: 'rgba(var(--fg-rgb), 0.08)',
  muted: 'rgba(var(--fg-rgb), 0.18)',
  excitement: '#fbbf24',
  // Theme-aware so the tooltip isn't a dark box on a light/sepia background.
  tooltipBg: 'var(--surface)',
  tooltipBorder: 'rgba(var(--fg-rgb), 0.12)',
}

function accentColor() {
  if (typeof window === 'undefined') return '#dc2626'
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#dc2626'
}

// A small palette for categorical charts (donuts/heatmaps). Derived from a fixed
// set so colours stay stable; accent is always first.
const CAT_PALETTE = [
  '#fbbf24', '#60a5fa', '#34d399', '#f472b6', '#a78bfa',
  '#fb923c', '#22d3ee', '#facc15', '#f87171', '#4ade80',
  '#c084fc', '#2dd4bf',
]

function ChartTooltip({ active, payload, label, suffix = '', labelKey }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: CHART.tooltipBg,
      border: `1px solid ${CHART.tooltipBorder}`,
      borderRadius: '8px',
      padding: '8px 10px',
      fontFamily: "'DM Sans',sans-serif",
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      {(labelKey ? payload[0]?.payload?.[labelKey] : label) != null && (
        <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-strong)', fontWeight: 600 }}>
          {labelKey ? payload[0].payload[labelKey] : label}
        </p>
      )}
      {payload.map((p, i) => {
        // For member-coloured single-series charts the datum carries its own
        // colour (_fill / fill); prefer it so the tooltip matches the bar/point.
        const rowColor = p?.payload?._fill || p?.payload?.fill || p.color || 'var(--text-muted)'
        return (
          <p key={i} style={{ margin: 0, fontSize: '11px', color: rowColor, fontFamily: "'DM Mono',monospace" }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{suffix}
          </p>
        )
      })}
    </div>
  )
}

// ─── Empty / placeholder for charts that need data not yet in the DB ─────────

function ChartPlaceholder({ children, height = 120 }) {
  return (
    <div style={{
      height: `${height}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '0 16px',
      fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px',
    }}>
      {children}
    </div>
  )
}

// ─── Reusable Recharts chart components ──────────────────────────────────────

// Score distribution histogram (0–10 buckets). data: [{ label, count }]
// `onSelect` + `selectedIndex` let a parent highlight a single tapped bar; the
// rest dim so the selection reads clearly (no whole-chart bounding box).
function ScoreHistogram({ data, height = 150, color, onSelect, selectedIndex = null, percent = false }) {
  const c = color || accentColor()
  const interval = data.length > 12 ? Math.ceil(data.length / 10) - 1 : 0
  // Percent mode: rescale counts to % of all scores so the y-axis reads as a
  // distribution rather than a raw count.
  const total = data.reduce((s, d) => s + (d.count || 0), 0)
  const chartData = percent && total ? data.map(d => ({ ...d, count: (d.count / total) * 100 })) : data
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: percent ? -10 : -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} interval={interval} />
        <YAxis allowDecimals={false} tickFormatter={percent ? (v) => `${Math.round(v)}%` : undefined} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={percent ? 34 : undefined} />
        <Tooltip content={<ChartTooltip suffix={percent ? '%' : ''} />} cursor={false} />
        <Bar
          dataKey="count"
          name={percent ? '% of scores' : 'Films'}
          fill={c}
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
          onClick={onSelect ? ((_, i) => onSelect(i)) : undefined}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={c}
              fillOpacity={selectedIndex == null || selectedIndex === i ? 1 : 0.32}
              stroke={selectedIndex === i ? 'var(--text-strong)' : 'none'}
              strokeWidth={selectedIndex === i ? 2 : 0}
              // Subtle glow so the selected bar is clearly distinguished.
              style={selectedIndex === i ? { filter: `drop-shadow(0 0 5px ${c})` } : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Tight axis domain for a set of scores so clustered values (e.g. everyone > 7)
// spread across the plot instead of wasting the full 0–10 range. Pads, snaps to
// 0.5, clamps to [0,10]. Falls back to [0,10] when there's nothing to fit.
// "#a855f7" -> "168, 85, 247" for rgba(); null for non-hex (e.g. a CSS var).
function hexToRgbStr(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return null
  const h = hex.slice(1)
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return [r, g, b].some(Number.isNaN) ? null : `${r}, ${g}, ${b}`
}

// Choose a "nice" tick step ≥ the ideal step, from a fixed ladder so ticks land on
// clean values (…0.25, 0.5, 1, 2…) and are always evenly spaced.
function chooseStep(range, targetCount) {
  const ladder = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500]
  const ideal = range / Math.max(1, targetCount)
  for (const s of ladder) if (s >= ideal - 1e-9) return s
  return ladder[ladder.length - 1]
}

// Smart axis scale: fits a tight domain to the data (so clustered values spread
// out instead of wasting a full 0–10 range) AND returns evenly-spaced nice ticks
// (snapped to the chosen step). Pass {min,max} to clamp (e.g. scores → [0,10]).
// Returns { domain:[lo,hi], ticks:[...] }.
function niceScale(values, { min = -Infinity, max = Infinity, targetCount = 5, padFrac = 0.12 } = {}) {
  const vs = values.filter(v => Number.isFinite(v))
  if (!vs.length) {
    const lo = Number.isFinite(min) ? min : 0
    const hi = Number.isFinite(max) ? max : 10
    const step = chooseStep(hi - lo, targetCount)
    const ticks = []
    for (let t = lo; t <= hi + step / 1000; t += step) ticks.push(Math.round(t * 1000) / 1000)
    return { domain: [lo, hi], ticks }
  }
  let lo = Math.min(...vs), hi = Math.max(...vs)
  if (hi - lo < 1e-6) { lo -= 0.5; hi += 0.5 }
  const pad = (hi - lo) * padFrac
  lo = Math.max(min, lo - pad)
  hi = Math.min(max, hi + pad)
  const step = chooseStep(hi - lo, targetCount)
  let dLo = Math.floor(lo / step) * step
  let dHi = Math.ceil(hi / step) * step
  // Clamp to [min,max] but keep BOTH edges on the step grid, so the domain edges
  // always coincide with a tick — otherwise the last tick lands short of the axis
  // edge and the 2nd-to-last↔last gap looks uneven.
  if (Number.isFinite(min)) dLo = Math.max(dLo, Math.ceil((min - 1e-9) / step) * step)
  if (Number.isFinite(max)) dHi = Math.min(dHi, Math.floor((max + 1e-9) / step) * step)
  if (dLo >= dHi) { dLo = Math.floor(lo / step) * step; dHi = dLo + step }
  const ticks = []
  for (let t = dLo; t <= dHi + step / 1000; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return { domain: [dLo, dHi], ticks }
}

// Per-member score bar chart for a single film, with mean + ±1 std-dev
// reference lines. data: [{ name, value, fill }]; mean/sd annotate the spread.
// Used when a film stat (highest / lowest / divisive / unanimous) is expanded,
// and on each film's overlay. The reference lines glow (a wide faint pass under
// a sharp pass) and use bright tokens so they pop over the colored bars; μ sits
// at the top and σ at the bottom so their labels never collide. The x-domain is
// fitted to the data so a tight cluster of scores still reads clearly.
function MemberScoreBars({ data, mean, sd, height, onMember }) {
  const accent = accentColor()
  const h = height || Math.max(130, data.length * 30 + 40)
  const memberTick = makeMemberTick(data.map(d => d.id), onMember)
  const domainVals = data.map(d => Number(d.value))
  if (mean != null) domainVals.push(mean)
  if (mean != null && sd != null && sd > 0) domainVals.push(mean - sd, mean + sd)
  const { domain, ticks } = niceScale(domainVals, { min: 0, max: 10, targetCount: 5 })
  const sdLo = (mean != null && sd != null && sd > 0) ? Math.max(domain[0], mean - sd) : null
  const sdHi = (mean != null && sd != null && sd > 0) ? Math.min(domain[1], mean + sd) : null
  return (
    <div>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 30, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" domain={domain} ticks={ticks} allowDecimals tickFormatter={(v) => Number(v).toFixed(domain[1] - domain[0] <= 3 ? 2 : 1)} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" interval={0} width={90} tick={memberTick || { fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={false} />
          <Bar dataKey="value" name="Score" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d._fill || d.fill || accent} />)}
          </Bar>
          {/* ±1 std-dev band (no inline labels — they collided with the axis; the
              values are in the caption below). Wide faint pass under a sharp pass. */}
          {sdLo != null && (
            <>
              <ReferenceLine x={sdLo} stroke="var(--accent-light)" strokeWidth={6} strokeOpacity={0.16} />
              <ReferenceLine x={sdHi} stroke="var(--accent-light)" strokeWidth={6} strokeOpacity={0.16} />
              <ReferenceLine x={sdLo} stroke="var(--accent-light)" strokeWidth={1.8} strokeOpacity={0.9} />
              <ReferenceLine x={sdHi} stroke="var(--accent-light)" strokeWidth={1.8} strokeOpacity={0.9} />
            </>
          )}
          {mean != null && (
            <>
              <ReferenceLine x={mean} stroke="var(--text-strong)" strokeWidth={7} strokeOpacity={0.2} />
              <ReferenceLine x={mean} stroke="var(--text-strong)" strokeWidth={2.4} />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
      {mean != null && (
        <p style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-dim)', margin: '2px 0 0' }}>
          <span style={{ color: 'var(--text-strong)' }}>μ {mean.toFixed(2)}</span>
          {sd != null && <span style={{ color: 'var(--accent-light)' }}> · σ {sd.toFixed(2)}</span>}
        </p>
      )}
    </div>
  )
}

// Line chart over months. data: [{ month, value, value2? }]
//
// For per-film series (one point per film) the raw film titles overlap badly on
// the x-axis. Pass `xKey="groupLabel"` plus `sparseTicks` and the chart will
// only render a tick the first time each group label (a month/season) appears,
// keeping the axis clean while every point stays hoverable. `tooltipLabelKey`
// chooses what the tooltip headline shows (e.g. the film title).
function MonthLineChart({
  data, height = 170, series, color,
  xKey = 'month', sparseTicks = false, tooltipLabelKey, xLabelKey, valueName = 'Avg',
}) {
  const c = color || accentColor()
  // For per-film score trends each point is a single score, not an average — pass
  // valueName="Score" so the tooltip doesn't mislabel it "Avg".
  const lines = series || [{ key: 'value', name: valueName, color: c }]
  // Legend interaction: click a series to highlight it (dim the rest); multi-
  // select; click again to clear. Empty set = default (all shown normally).
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const hasSel = selectedKeys.size > 0
  const toggleKey = (k) => {
    if (k == null) return
    setSelectedKeys(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }
  // The label shown under each tick. When `xLabelKey` is given the x-axis values
  // are unique (so each datum is distinct and clicks/tooltips map to the right
  // point), and the human-readable month label is recovered from xLabelKey.
  const labelKey = xLabelKey || xKey

  // When sparse, show the group label only at its first occurrence so each
  // month/season is labelled once instead of once per film. Keyed by the LABEL
  // (month), not the unique x value, so a month appears exactly once.
  // For sparse (per-film) trends we emit ONE tick per month — at its first film —
  // as the actual x-axis ticks (not a tick at every film with most blanked). With
  // only a handful of ticks, Recharts' minTickGap can then drop any that are still
  // too close, so month labels never overlap (the old interval={0} forced every
  // tick to render, which disabled that dropping → the overlap on the Me page).
  const sparse = useMemo(() => {
    if (!sparseTicks) return null
    const seen = new Set()
    const vals = []
    const labelByVal = new Map()
    data.forEach(d => {
      const k = d[labelKey]
      if (!seen.has(k)) { seen.add(k); vals.push(d[xKey]); labelByVal.set(d[xKey], k) }
    })
    return { vals, labelByVal }
  }, [data, labelKey, xKey, sparseTicks])

  const tickFormatter = sparseTicks
    ? (val) => (sparse?.labelByVal.get(val) ?? '')
    : undefined

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            type={xLabelKey ? 'number' : 'category'}
            domain={xLabelKey ? ['dataMin', 'dataMax'] : undefined}
            tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }}
            axisLine={{ stroke: CHART.axisLine }}
            tickLine={false}
            interval="preserveStartEnd"
            ticks={xLabelKey ? (sparseTicks ? sparse?.vals : data.map(d => d[xKey])) : undefined}
            tickFormatter={tickFormatter}
            minTickGap={sparseTicks ? 44 : 5}
            // Inset the plot so the first/last month labels aren't clipped at the edges.
            padding={{ left: 12, right: 12 }}
          />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={26} />
          <Tooltip content={<ChartTooltip labelKey={tooltipLabelKey} />} cursor={{ stroke: CHART.muted }} />
          {lines.map(l => {
            const emphasize = l.emphasize ?? (l.key === 'club')
            // A reference series (e.g. the TMDB community line) is a thin, neutral,
            // dotless overlay — present for comparison but kept visually quiet so it
            // never competes with the club average or the per-member lines.
            const isRef = !!l.reference
            // When the legend has an active selection, lines not in it are dimmed.
            const on = !hasSel || selectedKeys.has(l.key)
            return (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={!on ? 1.2 : (isRef ? 1.4 : (emphasize ? 3 : 1.6))}
                strokeDasharray={l.dashArray ?? (l.dashed ? '6 4' : undefined)}
                strokeOpacity={!on ? 0.1 : (isRef ? 0.9 : (lines.length > 1 && !emphasize ? 0.75 : 1))}
                dot={(isRef || !on) ? false : { r: emphasize ? 3 : 2, fill: l.color }}
                activeDot={isRef ? { r: 3 } : { r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Custom legend (replaces Recharts <Legend>) so tapping a series highlights
          it and dims BOTH the swatch and the label of the others. The dotted
          underline + caption signal that the items are tappable. */}
      {lines.length > 1 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', marginTop: '8px' }}>
            {lines.map(l => {
              const on = !hasSel || selectedKeys.has(l.key)
              return (
                <button
                  key={l.key}
                  onClick={() => toggleKey(l.key)}
                  title={`Highlight ${l.name}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                    fontFamily: "'DM Mono',monospace", fontSize: '10px',
                    color: on ? 'var(--text-muted)' : 'var(--text-faint)',
                    opacity: on ? 1 : 0.5,
                    textDecoration: 'underline', textDecorationStyle: 'dotted',
                    textDecorationColor: 'rgba(var(--fg-rgb),0.35)', textUnderlineOffset: '3px',
                  }}
                >
                  <span style={{
                    width: '11px', height: '11px', borderRadius: '2px', flexShrink: 0,
                    background: l.reference ? 'transparent' : l.color,
                    border: l.reference ? `1.5px dashed ${l.color}` : 'none',
                    opacity: on ? 1 : 0.3,
                  }} />
                  {l.name}
                </button>
              )
            })}
          </div>
          <p style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--text-faint)', margin: '4px 0 0', letterSpacing: '0.04em' }}>
            tap a series to highlight it
          </p>
        </>
      )}
    </div>
  )
}

// Excitement vs final scatter. data: [{ excitement, finalScore, title }]
function ExcitementScatter({ data, height = 220, color }) {
  const c = color || accentColor()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 14, left: 6, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis type="number" dataKey="excitement" name="Excitement" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
          label={{ value: 'Excitement', position: 'insideBottom', offset: -4, fontSize: 9, fill: CHART.axis }} />
        <YAxis type="number" dataKey="finalScore" name="Final" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={40}
          label={{ value: 'Final score', angle: -90, position: 'insideLeft', offset: 14, style: { textAnchor: 'middle', fontSize: 9, fill: CHART.axis } }} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 10, y: 10 }]} stroke={CHART.muted} strokeDasharray="4 4" />
        <Tooltip content={<ChartTooltip labelKey="title" />} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill={c} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// Factory for a clickable Recharts category-axis tick. `ids` is aligned with the
// chart data by index; clicking a member's name fires onMember(id). Rendered as
// an SVG <text> (Recharts ticks live inside the SVG, so no DOM button here).
function makeMemberTick(ids, onMember) {
  if (!onMember || !ids) return undefined
  const MemberTick = ({ x, y, payload }) => {
    const id = ids[payload?.index]
    return (
      <text
        x={x} y={y} dy={4} textAnchor="end"
        onClick={id ? (e) => { e.stopPropagation(); onMember(id) } : undefined}
        style={{
          fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans',
          cursor: id ? 'pointer' : 'default',
        }}
      >
        {payload?.value}
      </text>
    )
  }
  return MemberTick
}

// Horizontal/vertical comparison bar chart. data: [{ name, ...keys }]
// When `cellFill` is given and there is exactly one series, each bar is coloured
// per-datum from data[i][cellFill] (used to apply member colours).
// `domain` overrides the value-axis range (default [0,10]); pass a tight,
// data-driven domain so small-magnitude series (e.g. std dev) aren't flattened.
// `valueTickFormatter` formats the number-axis ticks; `memberIds` + `onMember`
// make the category-axis (name) ticks clickable into member profiles.
function ComparisonBar({ data, keys, height = 200, layout = 'vertical', labelKey = 'name', cellFill, domain = [0, 10], valueTickFormatter, memberIds, onMember, smartDomain = false, scoreClamp = true }) {
  const accent = accentColor()
  const resolved = keys.map((k, i) => ({ ...k, color: k.color || (i === 0 ? accent : CAT_PALETTE[i % CAT_PALETTE.length]) }))
  const perCell = cellFill && resolved.length === 1
  const memberTick = makeMemberTick(memberIds, onMember)
  // Fit a tight domain + evenly-spaced ticks to the data when asked, so clustered
  // values (e.g. everyone ~7) spread out instead of being flattened against 0–10.
  let vDomain = domain, vTicks
  if (smartDomain) {
    const vals = data.flatMap(d => resolved.map(k => Number(d[k.key])).filter(Number.isFinite))
    const s = niceScale(vals, scoreClamp ? { min: 0, max: 10, targetCount: 5 } : { min: 0, targetCount: 5 })
    vDomain = s.domain; vTicks = s.ticks
  }
  const fmtVal = valueTickFormatter || ((v) => Number(v).toFixed(vDomain[1] - vDomain[0] <= 3 ? 2 : 1))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 14, right: 14, left: layout === 'vertical' ? 4 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={layout === 'horizontal'} vertical={layout === 'vertical'} />
        {layout === 'vertical' ? (
          <>
            <XAxis type="number" domain={vDomain} ticks={vTicks} tickFormatter={fmtVal} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={labelKey} interval={0} width={104} tick={memberTick || { fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={labelKey} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} interval={0} />
            {/* Explicit, data-driven Y ticks so values are labelled and the
                domain isn't pinned to 0–10 (which flattens member differences). */}
            <YAxis domain={vDomain} ticks={vTicks} allowDecimals tickFormatter={fmtVal} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={34} />
          </>
        )}
        <Tooltip content={<ChartTooltip />} cursor={false} />
        {resolved.length > 1 && <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'DM Mono' }} />}
        {resolved.map(k => (
          <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={layout === 'vertical' ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
            {perCell && data.map((d, i) => <Cell key={i} fill={d[cellFill] || k.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Donut chart. data: [{ name, value }]. Clicking a slice SINGLE-selects it
// (dims the others + outlines it) and updates the info line below; clicking it
// again — or clicking empty chart space — clears. Selection is driven purely by
// `selectedIndex` (no Recharts activeShape/activeIndex, which kept a stale slice
// highlighted across versions). A hover Tooltip is kept for per-slice detail.
// The legend is custom-rendered so each genre links to the Films page filtered
// by that genre via `onLegendClick(name)`.
function DonutChart({ data, height = 200, onLegendClick }) {
  // selectedIndex is the single source of truth for which slice is highlighted,
  // so exactly one slice ever lights up and the info line always matches it.
  const [selectedIndex, setSelectedIndex] = useState(null)
  const total = useMemo(() => data.reduce((s, d) => s + (Number(d.value) || 0), 0), [data])
  const sel = selectedIndex != null ? data[selectedIndex] : null
  return (
    <div>
      {/* Click-away: a click NOT on a slice clears the selection. Keyed off the
          real DOM target (.recharts-sector) so it's robust regardless of event
          bubbling order — a slice click is left to the Pie's own onClick. */}
      <div onClick={(e) => { if (!e.target.closest('.recharts-sector')) setSelectedIndex(null) }} style={{ cursor: 'default' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
            onClick={(_, i) => setSelectedIndex(prev => (prev === i ? null : i))}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {data.map((_, i) => {
              const isSel = selectedIndex === i
              return (
                <Cell
                  key={i}
                  fill={chartColorAt(i)}
                  fillOpacity={selectedIndex == null || isSel ? 1 : 0.3}
                  stroke={isSel ? 'var(--surface)' : 'none'}
                  strokeWidth={isSel ? 3 : 0}
                  style={{ outline: 'none' }}
                />
              )
            })}
          </Pie>
          {/* No Recharts <Tooltip> here: it's hover/touch-driven and on mobile it
              stuck to the first-touched slice and never cleared. The selection info
              line below is driven purely by selectedIndex, so it always matches the
              tapped slice and clears on deselect. */}
        </PieChart>
      </ResponsiveContainer>
      </div>

      {/* Selected-slice info line — always reflects the current single selection. */}
      <p style={{
        textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '11px',
        color: sel ? 'var(--text-strong)' : 'var(--text-dim)', margin: '4px 0 10px', minHeight: '14px',
        transition: 'color 0.15s ease',
      }}>
        {sel
          ? `${sel.name}: ${sel.value} film${sel.value !== 1 ? 's' : ''}${total ? ` · ${Math.round((sel.value / total) * 100)}%` : ''}`
          : 'Tap a slice to see its share'}
      </p>

      {/* Custom legend — each genre links to the Films page filtered by genre. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center' }}>
        {data.map((d, i) => {
          const active = selectedIndex === i
          const linkable = !!onLegendClick
          return (
            <button
              key={d.name}
              onClick={linkable ? () => onLegendClick(d.name) : () => setSelectedIndex(prev => (prev === i ? null : i))}
              title={linkable ? `View ${d.name} films` : d.name}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: 'none', border: 'none', padding: '2px 0',
                cursor: 'pointer',
                fontFamily: "'DM Mono',monospace", fontSize: '10px',
                color: active ? 'var(--text-strong)' : 'var(--text-dim)',
              }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: chartColorAt(i), flexShrink: 0 }} />
              {d.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Whisker shape for BoxPlotChart. Hoisted to module scope so it isn't recreated
// on every render; the box color `c` is threaded in as an explicit prop while
// Recharts injects the geometry props (x, y, width, height, payload).
//
// The visible bar spans the FULL min→max range (so it's never zero-width unless a
// member's scores are all identical). That lets us recover the real pixel scale
// and place q1/q3/median at their true positions — fixing the bug where members
// whose q1===q3 collapsed and made every median appear to line up.
function BoxWhisker({ c, x, y, width, height: bh, payload }) {
  if (!payload) return null
  // Prefer the row's member colour when present (per-member spread chart).
  c = payload._color || c
  const span = payload.max - payload.min
  const cx = x + width / 2
  const cy = y + bh / 2
  // pixels-per-score-unit recovered from the full min→max bar geometry.
  const scaleX = span === 0 ? 0 : width / span
  const px = (val) => span === 0 ? cx : x + (val - payload.min) * scaleX
  const xMin = px(payload.min)
  const xMax = px(payload.max)
  const xQ1 = px(payload.q1)
  const xQ3 = px(payload.q3)
  const xMed = px(payload.median)
  const boxTop = y + 3
  const boxH = Math.max(2, bh - 6)
  return (
    <g>
      {/* whisker caps + connecting line */}
      <g stroke={c} strokeWidth={1.5} fill="none">
        <line x1={xMin} x2={xQ1} y1={cy} y2={cy} />
        <line x1={xQ3} x2={xMax} y1={cy} y2={cy} />
        <line x1={xMin} x2={xMin} y1={y + 4} y2={y + bh - 4} />
        <line x1={xMax} x2={xMax} y1={y + 4} y2={y + bh - 4} />
      </g>
      {/* interquartile box */}
      <rect
        x={Math.min(xQ1, xQ3)} y={boxTop}
        width={Math.max(1, Math.abs(xQ3 - xQ1))} height={boxH}
        fill={c} fillOpacity={0.28} stroke={c} strokeWidth={1.2} rx={2}
      />
      {/* median line — themed (was hardcoded white, invisible in light mode) */}
      <line x1={xMed} x2={xMed} y1={boxTop} y2={boxTop + boxH} strokeWidth={2.5} stroke="var(--text-strong)" />
    </g>
  )
}

// Box plot rendered with a floating-bar trick: an invisible base bar to `min`,
// then a transparent bar spanning min→max whose custom shape draws the IQR box,
// whiskers and median. data: [{ name, min, q1, median, q3, max }]
function BoxPlotChart({ data, height, color }) {
  const c = color || accentColor()
  const h = height || Math.max(120, data.length * 42 + 30)
  // Recharts can't natively box-plot; the visible bar spans min→max so the shape
  // always has a real scale to position quartiles within.
  const chartData = data.map(d => ({ ...d, base: d.min, span: d.max - d.min }))
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div style={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: '8px', padding: '8px 10px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-muted)' }}>
                <p style={{ margin: '0 0 4px', color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif", fontSize: '12px', fontWeight: 600 }}>{d.name}</p>
                <p style={{ margin: 0 }}>min {fmt(d.min)} · q1 {fmt(d.q1)}</p>
                <p style={{ margin: 0 }}>med {fmt(d.median)}</p>
                <p style={{ margin: 0 }}>q3 {fmt(d.q3)} · max {fmt(d.max)}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="span" stackId="a" fill="transparent" shape={<BoxWhisker c={c} />} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Member score correlation heatmap. Rendered as a CSS grid (Recharts has no
// native heatmap). data: { names: [..], matrix: [[r,..],..] } where r in [-1,1]
// or null.
function CorrelationHeatmap({ names, matrix }) {
  // Positive correlation scales with the member's accent (theme-aligned); negative
  // uses a single off-theme categorical hue so the two directions stay readable on
  // both light and dark without hardcoding red/green theme surfaces.
  const cellColor = (v) => {
    if (v == null) return 'rgba(var(--fg-rgb), 0.03)'
    if (v >= 0) {
      const a = Math.min(1, v) * 0.55 + 0.08
      return `rgba(var(--accent-rgb, 168,85,247), ${a.toFixed(3)})`
    }
    const a = Math.min(1, -v) * 0.5 + 0.06
    // CHART_CATEGORICAL[1] (#fb923c) as the negative-direction hue, alpha-blended.
    return `rgba(251,146,60,${a.toFixed(3)})`
  }
  const short = (n) => (n || '?').split(' ')[0]
  const cols = `64px repeat(${names.length}, minmax(0,1fr))`
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '3px', minWidth: `${64 + names.length * 44}px` }}>
        {/* header row */}
        <div />
        {names.map((n, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '8px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingBottom: '2px' }}>
            {short(n)}
          </div>
        ))}
        {names.map((rowName, r) => (
          <Fragment key={r}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '6px', fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {short(rowName)}
            </div>
            {names.map((_, c) => {
              const v = matrix[r][c]
              return (
                <div key={c} title={v == null ? 'n/a' : v.toFixed(2)} style={{
                  aspectRatio: '1', borderRadius: '4px', background: r === c ? 'rgba(var(--fg-rgb), 0.1)' : cellColor(v),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '8px', color: r === c ? 'var(--text-faint)' : 'rgba(var(--fg-rgb), 0.75)' }}>
                    {r === c ? '—' : (v == null ? '' : v.toFixed(2))}
                  </span>
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// Percentile chart: a horizontal bar per member showing their avg-score
// percentile rank vs the whole club. data: [{ name, value (0-100), avgScore }]
// memberIds (aligned with data) + onMember make the name ticks clickable.
function PercentileBar({ data, height, memberIds, onMember }) {
  const c = accentColor()
  const h = height || Math.max(120, data.length * 34 + 24)
  const memberTick = makeMemberTick(memberIds, onMember)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 36, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} unit="%" />
        <YAxis type="category" dataKey="name" width={90} tick={memberTick || { fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip suffix="%" />} cursor={false} />
        <Bar dataKey="value" name="Percentile" fill={c} radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d._fill || c} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// "First L." — first name + last initial. There are two Ryans, so a bare first
// name is ambiguous; this disambiguates them in every member-comparison label.
export function firstLast(name) {
  const parts = (name || '').split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

// Last name only (last whitespace-separated word) — used on member-comparison
// axes where a compact, unambiguous label reads best.
export function lastName(name) {
  const parts = (name || '').split(/\s+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : '?'
}

// First + last name in full (drops any middle names) — e.g. "Ryan Miller".
export function firstLastFull(name) {
  const parts = (name || '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1]}`
}

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr) {
  if (arr.length < 2) return null
  const mean = avg(arr)
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

// ─── Statistical helpers (box plots, correlation, percentile) ────────────────

// Quartiles for a box plot. Returns { min, q1, median, q3, max } (linear interp).
export function quartiles(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const q = (p) => {
    const idx = (s.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return s[lo]
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)
  }
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[s.length - 1] }
}

// Pearson correlation between two equal-length arrays. null if undefined.
export function pearson(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 2) return null
  const xa = a.slice(0, n), xb = b.slice(0, n)
  const ma = avg(xa), mb = avg(xb)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const dxa = xa[i] - ma, dxb = xb[i] - mb
    num += dxa * dxb
    da += dxa * dxa
    db += dxb * dxb
  }
  if (da === 0 || db === 0) return null
  return num / Math.sqrt(da * db)
}

// Percentile rank of `value` within `arr` (0–100).
export function percentileRank(arr, value) {
  if (!arr.length) return null
  const below = arr.filter(v => v < value).length
  const equal = arr.filter(v => v === value).length
  return ((below + equal / 2) / arr.length) * 100
}

// Choose a bin count for a histogram of N samples. Blends Sturges and the
// square-root rule, clamped to a sane range so the chart reads well as the
// dataset grows (few films → coarse bins; many → finer). Returns a count over
// the 0–10 score range; each bin spans 10 / binCount points.
export function dynamicBinCount(n) {
  if (!n || n < 2) return 5
  const sturges = Math.ceil(Math.log2(n) + 1)
  const sqrt = Math.ceil(Math.sqrt(n))
  const blended = Math.round((sturges + sqrt) / 2)
  return Math.max(5, Math.min(20, blended))
}

// Build histogram buckets over the 0–10 score range using a dynamic bin count.
// Returns [{ label, count, min, max }]. The final bin is inclusive of 10.
export function buildScoreBins(scores, binCount) {
  const bins = binCount || dynamicBinCount(scores.length)
  const width = 10 / bins
  return Array.from({ length: bins }, (_, i) => {
    const min = i * width
    const max = (i + 1) * width
    const isLast = i === bins - 1
    const label = `${min.toFixed(width < 1 ? 1 : 0)}–${max.toFixed(width < 1 ? 1 : 0)}`
    return {
      label,
      min,
      max,
      count: scores.filter(s => s >= min && (isLast ? s <= 10.01 : s < max)).length,
    }
  })
}

// The smallest increment a member actually uses across their scores. Detects the
// finest grid (1 / 0.5 / 0.25 / 0.1 / 0.01) every score lands on. Returns one of
// those step values, or null when there aren't enough scores to tell.
export function scoringGranularity(scores) {
  if (!scores || scores.length < 2) return null
  const steps = [1, 0.5, 0.25, 0.1, 0.01]
  // Work in integer hundredths to dodge float error.
  const cents = scores.map(s => Math.round(Number(s) * 100))
  for (const step of steps) {
    const stepC = Math.round(step * 100)
    if (cents.every(c => c % stepC === 0)) return step
  }
  return 0.01
}

// Release decade label for a 4-digit year. e.g. 1994 → "1990s".
export function decadeLabel(year) {
  const y = Number(year)
  if (!y || isNaN(y)) return null
  return `${Math.floor(y / 10) * 10}s`
}

// Quarterly season label for a YYYY-MM string. Winter Dec–Feb, Spring Mar–May,
// Summer Jun–Aug, Autumn Sep–Nov.
export function seasonForMonthYear(monthYear) {
  if (!monthYear) return null
  const [y, m] = monthYear.split('-').map(Number)
  if (!y || !m) return null
  if (m === 12) return { name: 'Winter', year: y + 1 }      // Dec rolls into next year's winter
  if (m <= 2) return { name: 'Winter', year: y }
  if (m <= 5) return { name: 'Spring', year: y }
  if (m <= 8) return { name: 'Summer', year: y }
  return { name: 'Autumn', year: y }
}

// Zack joined April 2026 — exclude him from Jan/Feb/Mar 2026 data entirely.
const ZACK_NAME = 'Zack'
export function isZackPreApril(userName, monthYear) {
  if (!userName || !monthYear) return false
  if (!userName.toLowerCase().startsWith(ZACK_NAME.toLowerCase())) return false
  return ['2026-01', '2026-02', '2026-03'].includes(monthYear)
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ style = {}, className = '' }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: '8px', ...style }}
    />
  )
}

// ─── Glass card ─────────────────────────────────────────────────────────────

function GlassCard({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }) : undefined}
      style={{
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        borderRadius: '14px',
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Section label ───────────────────────────────────────────────────────────

function SectionLabel({ children, style }) {
  return (
    <p style={{
      fontFamily: "'DM Mono',monospace",
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--hairline)',
      margin: '0 0 12px',
      ...style,
    }}>
      {children}
    </p>
  )
}

// ─── Info button ─────────────────────────────────────────────────────────────
// Small "?" affordance with a click-toggle popover explaining a chart. Themed
// (no hardcoded surfaces); closes on a second click. Used where a stat needs a
// definition (e.g. Given vs Received vs Club avg).
function InfoButton({ label = 'What do these mean?', children }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '18px', height: '18px', borderRadius: '50%',
          border: '1px solid rgba(var(--fg-rgb), 0.18)',
          background: open ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.05)',
          color: open ? 'var(--text-strong)' : 'var(--text-dim)',
          fontFamily: "'DM Mono',monospace", fontSize: '11px', lineHeight: 1,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, marginBottom: '12px',
        }}
      >
        ?
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '22px', right: 0, zIndex: 20,
          width: 'min(260px, 78vw)',
          background: 'var(--surface, #0d0e15)',
          border: '1px solid rgba(var(--fg-rgb), 0.12)',
          borderRadius: '10px', padding: '10px 12px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', lineHeight: 1.45,
          color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 'normal',
        }}>
          {children}
        </div>
      )}
    </span>
  )
}

// ─── Stat Card (small) ───────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <GlassCard style={{ padding: '14px 16px' }}>
      <p style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'var(--hairline)',
        margin: '0 0 6px',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.8rem',
        color: 'var(--text-strong)',
        letterSpacing: '0.04em',
        lineHeight: 1,
        margin: 0,
      }}>
        {value}
      </p>
    </GlassCard>
  )
}

// ─── Film row card ───────────────────────────────────────────────────────────

function FilmRowCard({ movie, label, sublabel, onClick, reserveRight = false }) {
  return (
    <GlassCard onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', paddingRight: reserveRight ? '44px' : '12px' }}>
      {/* Poster */}
      <div style={{
        flexShrink: 0, width: '48px', height: '68px',
        borderRadius: '7px', overflow: 'hidden',
        background: 'var(--surface-2)',
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${movie.poster_url}`}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '13px' }}>
              {initials(movie.title)}
            </span>
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans',sans-serif",
          color: 'var(--text-strong)', fontWeight: 500,
          fontSize: '14px', margin: '0 0 4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {movie.title}
        </p>
        <p style={{
          fontFamily: "'DM Mono',monospace",
          color: 'var(--text-dim)', fontSize: '11px', margin: 0,
        }}>
          {sublabel}
        </p>
      </div>
      {/* Label */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          color: 'var(--accent)',
          fontSize: '1.3rem',
          letterSpacing: '0.04em',
          margin: 0, lineHeight: 1,
        }}>
          {label}
        </p>
      </div>
    </GlassCard>
  )
}

// ─── Expandable film stat (row card + per-member breakdown chart) ────────────
// The row stays clickable into the film overlay; a separate chevron toggles an
// inline per-member score bar chart (with mean + std-dev annotation).

function ExpandableFilmStat({ movie, label, sublabel, onFilm, onMember, expanded, onToggle, chartData, caption }) {
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <FilmRowCard movie={movie} label={label} sublabel={sublabel} onClick={() => onFilm?.(movie)} reserveRight />
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          aria-label={expanded ? 'Hide breakdown' : 'Show per-member breakdown'}
          style={{
            position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', zIndex: 2,
            width: '26px', height: '26px', borderRadius: '8px',
            background: expanded ? 'rgba(var(--fg-rgb), 0.09)' : 'rgba(var(--fg-rgb), 0.04)',
            border: '1px solid rgba(var(--fg-rgb), 0.08)',
            color: 'var(--text-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Mono',monospace", fontSize: '11px',
            transition: 'transform 0.15s ease',
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <GlassCard style={{ marginTop: '8px', padding: '14px 12px' }}>
          {chartData && chartData.bars.length > 0 ? (
            <>
              <MemberScoreBars data={chartData.bars} mean={chartData.mean} sd={chartData.sd} onMember={onMember} />
              {caption && (
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
                  {caption}
                </p>
              )}
            </>
          ) : (
            <ChartPlaceholder height={90}>Individual member scores not available for this film yet.</ChartPlaceholder>
          )}
        </GlassCard>
      )}
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ movies, ratings, users, loading, onFilm, onMember }) {
  // Which film stat is expanded into a per-member chart (null = none).
  const [expanded, setExpanded] = useState(null)

  // Per-member score bars for a single film, sorted high→low. Returns
  // { bars: [{ name, value, fill }], mean, sd } or null.
  const memberBarsForMovie = useCallback((movieId) => {
    if (!movieId) return null
    const byUser = {}
    for (const u of users) byUser[u.id] = u
    const rows = ratings
      .filter(r => r.movie_id === movieId && r.score != null && byUser[r.user_id])
      .map(r => ({
        id: r.user_id,
        name: firstLast(byUser[r.user_id].name),
        value: Number(r.score),
        fill: userColor(byUser[r.user_id]),
      }))
      .sort((a, b) => b.value - a.value)
    if (rows.length === 0) return null
    const vals = rows.map(r => r.value)
    return { bars: rows, mean: avg(vals), sd: stddev(vals) }
  }, [ratings, users])

  const stats = useMemo(() => {
    if (!movies.length) return null

    const revealed = movies.filter(m => m._canSee)
    const allScores = ratings.filter(r => r.score != null).map(r => Number(r.score))
    const clubAvg = avg(allScores)

    // Build per-movie score arrays
    const movieScores = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!movieScores[r.movie_id]) movieScores[r.movie_id] = []
      movieScores[r.movie_id].push(Number(r.score))
    }

    // Displayed average for a film. historical_avg_score is the authoritative,
    // COMPLETE average for imported historical films; the individual ratings rows
    // are an incomplete backfill (April/May still pending), so prefer it when set.
    // Only compute from individual scores for live films that have no historical avg.
    const movieAvg = (m) => {
      // Authoritative imported average only once revealed (never leaks an active
      // film's full average to a viewer who hasn't scored it); else the computed
      // average from the RLS-gated visible scores.
      if (m.scores_revealed && m.historical_avg_score != null) return Number(m.historical_avg_score)
      const sc = movieScores[m.id]
      if (sc && sc.length >= 1) return avg(sc)
      return null
    }

    // Vault films (avg >= 8.5)
    const vault = revealed.filter(m => {
      const a = movieAvg(m)
      return a != null && a >= 8.5
    }).map(m => ({ ...m, _avg: movieAvg(m) }))
      .sort((a, b) => b._avg - a._avg)

    // Films with enough scores for statistical calculations
    const scoredFilms = revealed.filter(m => (movieScores[m.id] || []).length >= 3)

    // Most divisive (highest stddev)
    let mostDivisive = null
    let maxSd = -1
    for (const m of scoredFilms) {
      const sd = stddev(movieScores[m.id])
      if (sd != null && sd > maxSd) { maxSd = sd; mostDivisive = m }
    }

    // Most unanimous (lowest stddev)
    let mostUnanimous = null
    let minSd = Infinity
    for (const m of scoredFilms) {
      const sd = stddev(movieScores[m.id])
      if (sd != null && sd < minSd) { minSd = sd; mostUnanimous = m }
    }

    // Highest rated
    const ratedFilms = revealed.filter(m => movieAvg(m) != null)
    let highest = null, lowest = null
    let maxA = -Infinity, minA = Infinity
    for (const m of ratedFilms) {
      const a = movieAvg(m)
      if (a > maxA) { maxA = a; highest = m }
      // lowest: need at least 2 scores
      const sc = movieScores[m.id] || []
      if (sc.length >= 2 && a < minA) { minA = a; lowest = m }
    }

    // Member averages
    const memberScores = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!memberScores[r.user_id]) memberScores[r.user_id] = []
      memberScores[r.user_id].push(Number(r.score))
    }
    const memberAvgs = users
      .filter(u => u.is_active !== false)
      .map(u => ({
        ...u,
        avgScore: avg(memberScores[u.id] || []),
        count: (memberScores[u.id] || []).length,
      }))
      .filter(u => u.avgScore != null)
      .sort((a, b) => b.avgScore - a.avgScore)

    // All-time score distribution buckets (0–10)
    const distBuckets = Array.from({ length: 10 }, (_, i) => ({
      label: `${i}–${i + 1}`,
      count: allScores.filter(s => s >= i && (i === 9 ? s <= 10.01 : s < i + 1)).length,
    }))

    return {
      totalFilms: revealed.length,
      totalScores: allScores.length,
      clubAvg,
      distBuckets,
      vault,
      mostDivisive: mostDivisive ? {
        movie: mostDivisive,
        sd: maxSd,
        low: Math.min(...movieScores[mostDivisive.id]),
        high: Math.max(...movieScores[mostDivisive.id]),
        avgScore: movieAvg(mostDivisive),
      } : null,
      mostUnanimous: mostUnanimous ? {
        movie: mostUnanimous,
        sd: minSd,
        low: Math.min(...movieScores[mostUnanimous.id]),
        high: Math.max(...movieScores[mostUnanimous.id]),
        avgScore: movieAvg(mostUnanimous),
      } : null,
      highest: highest ? { movie: highest, avgScore: maxA } : null,
      lowest: lowest ? { movie: lowest, avgScore: minA } : null,
      memberAvgs,
      movieScores,
      movieAvg,
    }
  }, [movies, ratings, users])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Stat cards skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Skeleton style={{ height: '72px' }} />
          <Skeleton style={{ height: '72px' }} />
          <Skeleton style={{ gridColumn: '1 / -1', height: '72px' }} />
        </div>
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
        No data yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Top stat cards — tight 2×2 grid (no wasted full-width row) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <StatCard label="Total Films" value={stats.totalFilms} />
        <StatCard label="Scores Cast" value={stats.totalScores} />
        <StatCard label="Club Average" value={fmt(stats.clubAvg)} />
        <StatCard label="In the Vault" value={stats.vault.length} />
      </div>

      {/* All-time Score Distribution (mini) */}
      <div>
        <SectionLabel>All-Time Score Distribution</SectionLabel>
        <GlassCard style={{ padding: '14px 10px' }}>
          <ScoreHistogram data={stats.distBuckets} height={130} percent />
        </GlassCard>
      </div>

      {/* Member comparison (mini) */}
      {stats.memberAvgs.length > 0 && (
        <div>
          <SectionLabel>Member Averages</SectionLabel>
          <GlassCard style={{ padding: '14px 10px' }}>
            <ComparisonBar
              data={stats.memberAvgs.map(u => ({ name: firstLastFull(u.name), value: u.avgScore, _fill: userColor(u) }))}
              keys={[{ key: 'value', name: 'Avg' }]}
              layout="vertical"
              smartDomain
              height={Math.max(120, stats.memberAvgs.length * 30 + 20)}
              cellFill="_fill"
              memberIds={stats.memberAvgs.map(u => u.id)}
              onMember={onMember}
            />
          </GlassCard>
        </div>
      )}

      {/* The Vault */}
      <div>
        <SectionLabel>The Vault — avg ≥ 8.5</SectionLabel>
        {stats.vault.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
            No films have reached the Vault yet.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {stats.vault.map(m => (
              <div
                key={m.id}
                onClick={() => onFilm?.(m)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilm?.(m) } }}
                style={{ flexShrink: 0, width: '112px', cursor: 'pointer' }}
              >
                <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface-2)', aspectRatio: '2/3' }}>
                  {m.poster_url ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${m.poster_url}`}
                      alt={m.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '16px' }}>
                        {initials(m.title)}
                      </span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
                    <span style={{
                      background: 'var(--accent)',
                      fontFamily: "'DM Mono',monospace",
                      fontSize: '10px',
                      color: 'var(--text-strong)',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      fontWeight: 500,
                    }}>
                      {fmt(m._avg)}
                    </span>
                  </div>
                </div>
                <p style={{
                  marginTop: '6px',
                  fontFamily: "'DM Sans',sans-serif",
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {m.title}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Most Divisive */}
      <div>
        <SectionLabel>Most Divisive Film</SectionLabel>
        {stats.mostDivisive ? (
          <ExpandableFilmStat
            movie={stats.mostDivisive.movie}
            label={`${fmt(stats.mostDivisive.avgScore)}`}
            sublabel={`Std dev: ${fmt(stats.mostDivisive.sd)} · Low: ${fmt(stats.mostDivisive.low)} · High: ${fmt(stats.mostDivisive.high)}`}
            onFilm={onFilm}
            onMember={onMember}
            expanded={expanded === 'divisive'}
            onToggle={() => setExpanded(e => e === 'divisive' ? null : 'divisive')}
            chartData={memberBarsForMovie(stats.mostDivisive.movie.id)}
            caption="Each member's score · solid line = club mean (μ) · accent lines = ±1 std-dev (σ, high spread)"
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
            Need at least 3 scores per film.
          </p>
        )}
      </div>

      {/* Most Unanimous */}
      <div>
        <SectionLabel>Most Unanimous Film</SectionLabel>
        {stats.mostUnanimous ? (
          <ExpandableFilmStat
            movie={stats.mostUnanimous.movie}
            label={`${fmt(stats.mostUnanimous.avgScore)}`}
            sublabel={`Std dev: ${fmt(stats.mostUnanimous.sd)} · Low: ${fmt(stats.mostUnanimous.low)} · High: ${fmt(stats.mostUnanimous.high)}`}
            onFilm={onFilm}
            onMember={onMember}
            expanded={expanded === 'unanimous'}
            onToggle={() => setExpanded(e => e === 'unanimous' ? null : 'unanimous')}
            chartData={memberBarsForMovie(stats.mostUnanimous.movie.id)}
            caption="Each member's score · solid line = club mean (μ) · accent lines = ±1 std-dev (σ, tight spread)"
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
            Need at least 3 scores per film.
          </p>
        )}
      </div>

      {/* Highest Rated */}
      <div>
        <SectionLabel>Highest Rated Film</SectionLabel>
        {stats.highest ? (
          <ExpandableFilmStat
            movie={stats.highest.movie}
            label={fmt(stats.highest.avgScore)}
            sublabel={`Avg of ${(stats.movieScores[stats.highest.movie.id] || []).length} score(s)`}
            onFilm={onFilm}
            onMember={onMember}
            expanded={expanded === 'highest'}
            onToggle={() => setExpanded(e => e === 'highest' ? null : 'highest')}
            chartData={memberBarsForMovie(stats.highest.movie.id)}
            caption="Per-member score · μ = club mean"
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>No data.</p>
        )}
      </div>

      {/* Lowest Rated */}
      <div>
        <SectionLabel>Lowest Rated Film</SectionLabel>
        {stats.lowest ? (
          <ExpandableFilmStat
            movie={stats.lowest.movie}
            label={fmt(stats.lowest.avgScore)}
            sublabel={`Avg of ${(stats.movieScores[stats.lowest.movie.id] || []).length} score(s)`}
            onFilm={onFilm}
            onMember={onMember}
            expanded={expanded === 'lowest'}
            onToggle={() => setExpanded(e => e === 'lowest' ? null : 'lowest')}
            chartData={memberBarsForMovie(stats.lowest.movie.id)}
            caption="Per-member score · μ = club mean"
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>Need at least 2 scores per film.</p>
        )}
      </div>

      {/* Member Averages */}
      <div>
        <SectionLabel>Member Avg Scores</SectionLabel>
        {stats.memberAvgs.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>No ratings yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {stats.memberAvgs.map(u => {
              const ring = userColor(u) || 'var(--accent)'
              return (
              <GlassCard key={u.id} onClick={() => onMember?.(u.id)} style={{ flexShrink: 0, padding: '14px 16px', textAlign: 'center', minWidth: '90px' }}>
                {/* Avatar */}
                <div style={{
                  width: '40px', height: '40px',
                  borderRadius: '50%',
                  border: `2px solid ${ring}`,
                  background: 'rgba(var(--fg-rgb), 0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 8px',
                }}>
                  <span style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    color: ring,
                    fontSize: '14px',
                    letterSpacing: '0.04em',
                  }}>
                    {initials(u.name)}
                  </span>
                </div>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif",
                  color: 'var(--text-muted)', fontSize: '11px',
                  margin: '0 0 4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '80px',
                }}>
                  {firstLast(u.name)}
                </p>
                <p style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  color: 'var(--text-strong)', fontSize: '1.3rem',
                  letterSpacing: '0.04em', lineHeight: 1,
                  margin: 0,
                }}>
                  {fmt(u.avgScore)}
                </p>
              </GlassCard>
            )})}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Me Tab ───────────────────────────────────────────────────────────────────

export function MeTab({ movies, ratings, allRatings = [], guesses = [], loading, monthsById = {}, onFilm, onGenre, subject = { name: 'You', possessive: 'Your' } }) {
  // Your guess-the-picker accuracy across resolved (picker-revealed) films.
  const guessAcc = useMemo(() => {
    const movieById = {}
    movies.forEach(m => { movieById[m.id] = m })
    let correct = 0, total = 0
    guesses.forEach(g => {
      const m = movieById[g.movie_id]
      if (!m || !m.picker_revealed || !m.picked_by_user_id) return
      total += 1
      if (g.guessed_user_id === m.picked_by_user_id) correct += 1
    })
    return total > 0 ? { correct, total, pct: (correct / total) * 100 } : null
  }, [movies, guesses])

  const [showAll, setShowAll] = useState(false)
  // Which histogram bar the user tapped (null = none) — highlights just that bar.
  const [histBin, setHistBin] = useState(null)

  const stats = useMemo(() => {
    if (!movies.length && !ratings.length) return null

    // Build movie lookup
    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    const scored = ratings.filter(r => r.score != null)
    const scores = scored.map(r => Number(r.score))
    const excitements = ratings
      .filter(r => r.pre_watch_excitement != null)
      .map(r => Number(r.pre_watch_excitement))
    const recommendations = ratings.filter(r => r.recommend_outside_club != null)
    const wouldRecommend = recommendations.filter(r => r.recommend_outside_club === true)

    // Score distribution buckets. A fixed, finer granularity (1.0-wide → 10 bins
    // across 0–10) reads far better than the coarse auto bin count, which can
    // collapse a small score set into just 2–5 buckets.
    const bucketCounts = buildScoreBins(scores, 10)

    // Top 5 and bottom 5
    const scoredWithMovies = scored
      .map(r => ({ ...r, movie: movieMap[r.movie_id] }))
      .filter(r => r.movie)
      .sort((a, b) => Number(b.score) - Number(a.score))
    const top5 = scoredWithMovies.slice(0, 5)
    const bottom5 = [...scoredWithMovies].sort((a, b) => Number(a.score) - Number(b.score)).slice(0, 5)

    // Excitement vs final
    const excVsFinal = scored
      .map(r => ({
        ...r,
        movie: movieMap[r.movie_id],
        excitement: r.pre_watch_excitement != null ? Number(r.pre_watch_excitement) : null,
        finalScore: Number(r.score),
      }))
      .filter(r => r.movie)
      .sort((a, b) => b.finalScore - a.finalScore)

    // Scatter data (only films where excitement is present)
    const scatter = excVsFinal
      .filter(r => r.excitement != null)
      .map(r => ({ excitement: r.excitement, finalScore: r.finalScore, title: r.movie.title }))

    // Scoring trend: avg of my scores per month, oldest→newest, x = month name
    const byMonth = {}
    for (const r of scored) {
      const mv = movieMap[r.movie_id]
      if (!mv || !mv.month_id) continue
      if (!byMonth[mv.month_id]) byMonth[mv.month_id] = []
      byMonth[mv.month_id].push(Number(r.score))
    }
    const monthOrder = orderMonths(Object.keys(byMonth), monthsById)
    const trend = monthOrder.map(mid => ({
      month: monthsById[mid]?.month_year ? formatMonthLabel(monthsById[mid].month_year) : 'm',
      value: avg(byMonth[mid]),
    }))

    // Individual scores over time (chronological by submission). Each point is a
    // film; the x-axis labels by MONTH (groupLabel) so it stays clean, while the
    // tooltip shows the actual film title.
    const scoresOverTime = scored
      .map(r => ({ ...r, movie: movieMap[r.movie_id] }))
      .filter(r => r.movie)
      .sort((a, b) => {
        // Order by the film's MONTH first — bulk-imported historical scores share
        // (or scramble) submitted_at, which made e.g. May appear before April.
        const ma = a.movie.month_id ? (monthsById[a.movie.month_id]?.month_year ?? '') : ''
        const mb = b.movie.month_id ? (monthsById[b.movie.month_id]?.month_year ?? '') : ''
        if (ma !== mb) return ma.localeCompare(mb)
        const ta = a.submitted_at ? Date.parse(a.submitted_at) : 0
        const tb = b.submitted_at ? Date.parse(b.submitted_at) : 0
        return ta - tb
      })
      .map((r, i) => {
        const my = r.movie.month_id ? monthsById[r.movie.month_id]?.month_year : null
        return {
          // Unique numeric x so same-month films stay distinct points (else the
          // tooltip repeats one film across adjacent points). groupLabel is the
          // SHORT month label (e.g. "Apr '26") so adjacent months don't overlap.
          idx: i,
          groupLabel: my ? formatMonthShort(my) : '—',
          title: r.movie.title,
          value: Number(r.score),
        }
      })

    // Me vs club average (comparison bar)
    const clubScores = allRatings.filter(r => r.score != null).map(r => Number(r.score))
    const myVsClub = [
      { name: 'You', value: avg(scores) },
      { name: 'Club', value: avg(clubScores) },
    ]

    // Percentile rank of my avg score among all members' avg scores
    const clubByUser = {}
    for (const r of allRatings) {
      if (r.score == null) continue
      if (!clubByUser[r.user_id]) clubByUser[r.user_id] = []
      clubByUser[r.user_id].push(Number(r.score))
    }
    const memberAvgList = Object.values(clubByUser).map(arr => avg(arr)).filter(v => v != null)
    const myAvg = avg(scores)
    const myPercentile = (myAvg != null && memberAvgList.length) ? percentileRank(memberAvgList, myAvg) : null

    // Favourite genres (mine) — only films I scored that have a genre.
    // Handle genre as text[] (array) or comma-separated string.
    const myGenreStrings = scored
      .map(r => {
        const g = movieMap[r.movie_id]?.genre
        if (!g) return null
        if (Array.isArray(g)) return g.join(', ')
        return String(g)
      })
      .filter(Boolean)
    const myGenreCounts = calcGenreBreakdown(myGenreStrings)
    const myGenreDonut = Object.entries(myGenreCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, value]) => ({ name, value }))

    // Personal season & year rankings (quarterly seasons). Rank my films within
    // each season/year by my score.
    const filmsWithSeason = scored.map(r => {
      const mv = movieMap[r.movie_id]
      const my = mv?.month_id ? monthsById[mv.month_id]?.month_year : null
      const season = seasonForMonthYear(my)
      // Carry the full movie object so ranking rows can open the film overlay.
      return { title: mv?.title, movie: mv, score: Number(r.score), season, year: my ? Number(my.split('-')[0]) : null }
    }).filter(x => x.title)

    const seasonGroups = {}
    for (const f of filmsWithSeason) {
      if (!f.season) continue
      const key = `${f.season.name} ${f.season.year}`
      ;(seasonGroups[key] ||= []).push(f)
    }
    const seasonRankings = Object.entries(seasonGroups).map(([label, films]) => ({
      label,
      films: [...films].sort((a, b) => b.score - a.score),
    }))

    const yearGroups = {}
    for (const f of filmsWithSeason) {
      if (f.year == null) continue
      ;(yearGroups[f.year] ||= []).push(f)
    }
    const yearRankings = Object.entries(yearGroups).sort((a, b) => b[0] - a[0]).map(([label, films]) => ({
      label,
      films: [...films].sort((a, b) => b.score - a.score),
    }))

    return {
      filmCount: scored.length,
      avgScore: myAvg,
      stdDev: stddev(scores),
      granularity: scoringGranularity(scores),
      excitementAvg: avg(excitements),
      recommendPct: recommendations.length > 0 ? (wouldRecommend.length / recommendations.length) * 100 : null,
      bucketCounts,
      top5,
      bottom5,
      excVsFinal,
      scatter,
      trend,
      scoresOverTime,
      myVsClub,
      myPercentile,
      myGenreDonut,
      seasonRankings,
      yearRankings,
    }
  }, [movies, ratings, allRatings, monthsById])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: '72px' }} />)}
        </div>
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '200px' }} />
        <Skeleton style={{ height: '200px' }} />
      </div>
    )
  }

  if (!stats || stats.filmCount === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
        You haven't scored any films yet.
      </div>
    )
  }

  const visibleExcVsFinal = showAll ? stats.excVsFinal : stats.excVsFinal.slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Header row — mini stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <StatCard label="Films Scored" value={stats.filmCount} />
        <StatCard label="Avg Score" value={fmt(stats.avgScore)} />
        <StatCard label="Excitement Avg" value={stats.excitementAvg != null ? fmt(stats.excitementAvg) : '—'} />
        <StatCard
          label="Would Recommend"
          value={stats.recommendPct != null ? `${Math.round(stats.recommendPct)}%` : '—'}
        />
        <StatCard label="Std Dev" value={stats.stdDev != null ? fmt(stats.stdDev) : '—'} />
        <StatCard label="Granularity" value={stats.granularity != null ? stats.granularity.toFixed(2) : '—'} />
      </div>

      {/* Score Distribution Bar Chart — tap a bar to see its detail */}
      <div>
        <SectionLabel>Score Distribution</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          <ScoreHistogram
            data={stats.bucketCounts}
            height={160}
            selectedIndex={histBin}
            onSelect={(i) => setHistBin(prev => (prev === i ? null : i))}
          />
          {histBin != null && stats.bucketCounts[histBin] && (
            <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-dim)', margin: '8px 0 0', textAlign: 'center' }}>
              {stats.bucketCounts[histBin].label}: {stats.bucketCounts[histBin].count} film{stats.bucketCounts[histBin].count !== 1 ? 's' : ''}
              {' · '}
              <button
                onClick={() => setHistBin(null)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: "'DM Mono',monospace", fontSize: '10px', padding: 0 }}
              >
                clear
              </button>
            </p>
          )}
        </GlassCard>
      </div>

      {/* You vs Club average */}
      <div>
        <SectionLabel>{subject.name} vs. Club Average</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          <ComparisonBar
            data={stats.myVsClub}
            keys={[{ key: 'value', name: 'Avg Score' }]}
            layout="vertical"
            smartDomain
            height={110}
          />
        </GlassCard>
      </div>

      {/* Scoring Trend (avg per month) */}
      <div>
        <SectionLabel>Scoring Trend · Avg Per Month</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.trend.length >= 2 ? (
            <MonthLineChart data={stats.trend} height={180} />
          ) : (
            <ChartPlaceholder>Not enough months scored yet for a trend.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Scores Over Time (each individual score, chronological) */}
      <div>
        <SectionLabel>{subject.possessive} Scores Over Time</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.scoresOverTime.length >= 2 ? (
            <MonthLineChart
              data={stats.scoresOverTime}
              height={190}
              xKey="idx"
              xLabelKey="groupLabel"
              sparseTicks
              tooltipLabelKey="title"
              valueName="Score"
            />
          ) : (
            <ChartPlaceholder>Score a few films to see your scoring sequence.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Excitement vs Final scatter */}
      <div>
        <SectionLabel>Excitement vs. Final (Scatter)</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.scatter.length >= 2 ? (
            <ExcitementScatter data={stats.scatter} height={230} />
          ) : (
            <ChartPlaceholder>Not enough excitement scores recorded yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Percentile */}
      <div>
        <SectionLabel>{subject.possessive} Generosity Percentile</SectionLabel>
        <GlassCard style={{ padding: '18px 20px', textAlign: 'center' }}>
          {stats.myPercentile != null ? (
            <>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '3rem', lineHeight: 1, letterSpacing: '0.04em', margin: 0 }}>
                {Math.round(stats.myPercentile)}<span style={{ fontSize: '1.4rem' }}>%</span>
              </p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)', fontSize: '12px', margin: '8px 0 0' }}>
                {subject.possessive} average score is higher than {Math.round(stats.myPercentile)}% of members.
              </p>
            </>
          ) : (
            <ChartPlaceholder height={60}>No comparison data yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Guess-the-picker accuracy — how often you guessed the picker right */}
      <div>
        <SectionLabel>Guess-the-Picker Accuracy</SectionLabel>
        <GlassCard style={{ padding: '18px 20px', textAlign: 'center' }}>
          {guessAcc ? (
            <>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '3rem', lineHeight: 1, letterSpacing: '0.04em', margin: 0 }}>
                {Math.round(guessAcc.pct)}<span style={{ fontSize: '1.4rem' }}>%</span>
              </p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)', fontSize: '12px', margin: '8px 0 0' }}>
                You guessed the picker correctly on {guessAcc.correct} of {guessAcc.total} revealed film{guessAcc.total !== 1 ? 's' : ''}.
              </p>
            </>
          ) : (
            <ChartPlaceholder height={60}>No guesses yet — guess the picker on this month's films.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Favourite Genres */}
      <div>
        <SectionLabel>Favourite Genres</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.myGenreDonut.length > 0 ? (
            <DonutChart data={stats.myGenreDonut} height={220} onLegendClick={onGenre} />
          ) : (
            /* TODO: needs genre data on movies */
            <ChartPlaceholder>Genre data not yet available.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Personal Season Rankings */}
      <div>
        <SectionLabel>{subject.possessive} Season Rankings</SectionLabel>
        {stats.seasonRankings.length === 0 ? (
          <ChartPlaceholder>No season data yet.</ChartPlaceholder>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {stats.seasonRankings.map(s => (
              <RankingList key={s.label} title={s.label} films={s.films} onFilm={onFilm} />
            ))}
          </div>
        )}
      </div>

      {/* Personal Year Rankings */}
      <div>
        <SectionLabel>{subject.possessive} Year Rankings</SectionLabel>
        {stats.yearRankings.length === 0 ? (
          <ChartPlaceholder>No yearly data yet.</ChartPlaceholder>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {stats.yearRankings.map(y => (
              <RankingList key={y.label} title={y.label} films={y.films} onFilm={onFilm} />
            ))}
          </div>
        )}
      </div>

      {/* Top 5 */}
      <div>
        <SectionLabel>Top 5 Films</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.top5.map(r => (
            <MiniFilmCard key={r.id} movie={r.movie} score={r.score} onClick={() => onFilm?.(r.movie)} />
          ))}
        </div>
      </div>

      {/* Bottom 5 */}
      <div>
        <SectionLabel>Bottom 5 Films</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.bottom5.map(r => (
            <MiniFilmCard key={r.id} movie={r.movie} score={r.score} onClick={() => onFilm?.(r.movie)} />
          ))}
        </div>
      </div>

      {/* Excitement vs Final */}
      <div>
        <SectionLabel>Excitement vs. Final Score</SectionLabel>
        <GlassCard style={{ padding: '4px 0' }}>
          {visibleExcVsFinal.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              borderBottom: i < visibleExcVsFinal.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.04)' : 'none',
            }}>
              <p
                onClick={r.movie ? () => onFilm?.(r.movie) : undefined}
                onKeyDown={r.movie ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilm?.(r.movie) } } : undefined}
                role={r.movie ? 'button' : undefined}
                tabIndex={r.movie ? 0 : undefined}
                style={{
                  flex: 1, minWidth: 0,
                  fontFamily: "'DM Sans',sans-serif",
                  color: 'var(--text)', fontSize: '13px',
                  margin: 0, cursor: r.movie ? 'pointer' : 'default',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                {r.movie.title}
              </p>
              {r.excitement != null && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '1rem',
                  letterSpacing: '0.04em',
                  color: '#fbbf24',
                  minWidth: '36px',
                  textAlign: 'right',
                }}>
                  {fmt(r.excitement)}
                </span>
              )}
              {r.excitement == null && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  color: 'var(--hairline)',
                  minWidth: '36px',
                  textAlign: 'right',
                }}>
                  —
                </span>
              )}
              <span style={{
                flexShrink: 0,
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '1.2rem',
                letterSpacing: '0.04em',
                color: 'var(--accent)',
                minWidth: '40px',
                textAlign: 'right',
              }}>
                {fmt(r.finalScore)}
              </span>
            </div>
          ))}
        </GlassCard>
        {stats.excVsFinal.length > 6 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid rgba(var(--fg-rgb), 0.08)',
              background: 'transparent',
              color: 'var(--text-dim)',
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {showAll ? 'Show less' : `Show all ${stats.excVsFinal.length} films`}
          </button>
        )}
        {stats.excVsFinal.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-dim)' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#fbbf24' }} />
              Excitement
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-dim)' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent)' }} />
              Final
            </span>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Mini Film Card (for Top/Bottom 5) ───────────────────────────────────────

function MiniFilmCard({ movie, score, onClick }) {
  return (
    <GlassCard onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
      <div style={{
        flexShrink: 0, width: '40px', height: '56px',
        borderRadius: '6px', overflow: 'hidden',
        background: 'var(--surface-2)',
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '11px' }}>
              {initials(movie.title)}
            </span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans',sans-serif",
          color: 'var(--text-strong)', fontWeight: 500,
          fontSize: '13px', margin: '0 0 3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {movie.title}
        </p>
        <p style={{
          fontFamily: "'DM Mono',monospace",
          color: 'var(--text-faint)', fontSize: '11px', margin: 0,
        }}>
          {movie.year_released ?? ''}
        </p>
      </div>
      <span style={{
        flexShrink: 0,
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.4rem',
        letterSpacing: '0.04em',
        color: 'var(--accent)',
        lineHeight: 1,
      }}>
        {fmt(score)}
      </span>
    </GlassCard>
  )
}

// ─── Ranking list (season/year personal rankings) ───────────────────────────

// Collapsible ranked film list. Shows the first `collapseAt` rows; "Show all (N)"
// reveals the rest. Film titles open the film overlay via onFilm.
function RankingList({ title, films, onFilm, collapseAt = 6 }) {
  const [expanded, setExpanded] = useState(false)
  const canCollapse = films.length > collapseAt
  const visible = expanded || !canCollapse ? films : films.slice(0, collapseAt)
  return (
    <GlassCard style={{ padding: '12px 14px' }}>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-dim)', margin: '0 0 10px' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {visible.map((f, i) => {
          const clickable = !!(onFilm && f.movie)
          return (
            <div
              key={i}
              onClick={clickable ? () => onFilm(f.movie) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilm(f.movie) } } : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: clickable ? 'pointer' : 'default' }}
            >
              <span style={{ flexShrink: 0, width: '18px', fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-faint)', fontSize: '1rem', textAlign: 'right' }}>
                {i + 1}
              </span>
              <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.title}
              </p>
              <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                {fmt(f.score)}
              </span>
            </div>
          )
        })}
      </div>
      {canCollapse && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ marginTop: '10px', width: '100%', padding: '7px', borderRadius: '8px', border: '1px solid rgba(var(--fg-rgb), 0.08)', background: 'transparent', color: 'var(--text-dim)', fontFamily: "'DM Sans',sans-serif", fontSize: '12px', cursor: 'pointer' }}
        >
          {expanded ? 'Show less' : `Show all (${films.length})`}
        </button>
      )}
    </GlassCard>
  )
}

// ─── Pure calculation helpers (also used by tests) ──────────────────────────

// agreementScore: avg absolute difference between two score arrays aligned by film
// ratingsA and ratingsB are arrays of { movie_id, score }
export function calcAgreementScore(ratingsA, ratingsB) {
  const mapB = {}
  for (const r of ratingsB) {
    if (r.score != null) mapB[r.movie_id] = Number(r.score)
  }
  const diffs = []
  for (const r of ratingsA) {
    if (r.score == null) continue
    if (mapB[r.movie_id] == null) continue
    diffs.push(Math.abs(Number(r.score) - mapB[r.movie_id]))
  }
  return { avg: avg(diffs), count: diffs.length }
}

// genreBreakdown: count films per genre from an array of genre strings
// each entry may be a comma-separated list like "Drama, Thriller"
export function calcGenreBreakdown(genres) {
  const counts = {}
  for (const g of genres) {
    if (!g) continue
    const parts = String(g).split(',').map(s => s.trim()).filter(Boolean)
    for (const p of parts) {
      counts[p] = (counts[p] || 0) + 1
    }
  }
  return counts
}

// scoringStreaks: for each member, count consecutive months (most recent first)
// in which they scored at least one film.
// monthOrder: sorted array of month_ids oldest→newest
// ratingsByUser: { userId: Set<month_id> }  (months in which they have a score)
export function calcScoringStreaks(userIds, monthOrder, ratingsByUser) {
  const result = {}
  for (const uid of userIds) {
    const scoredMonths = ratingsByUser[uid] || new Set()
    let streak = 0
    // Walk backwards through months (newest first)
    for (let i = monthOrder.length - 1; i >= 0; i--) {
      if (scoredMonths.has(monthOrder[i])) {
        streak++
      } else {
        break
      }
    }
    result[uid] = streak
  }
  return result
}

// headToHeadRecord: for each film both users scored, determine who won
// ratingsA and ratingsB are arrays of { movie_id, score }
export function calcHeadToHeadRecord(ratingsA, ratingsB) {
  const mapB = {}
  for (const r of ratingsB) {
    if (r.score != null) mapB[r.movie_id] = Number(r.score)
  }
  let winsA = 0, winsB = 0, ties = 0
  const films = []
  for (const r of ratingsA) {
    if (r.score == null) continue
    if (mapB[r.movie_id] == null) continue
    const sA = Number(r.score)
    const sB = mapB[r.movie_id]
    const diff = Math.abs(sA - sB)
    films.push({ movie_id: r.movie_id, scoreA: sA, scoreB: sB, diff })
    if (Math.abs(sA - sB) < 0.005) ties++
    else if (sA > sB) winsA++
    else winsB++
  }
  films.sort((a, b) => a.diff - b.diff)
  return { winsA, winsB, ties, films }
}

// Order month_ids oldest→newest using their month_year (YYYY-MM) where known,
// falling back to id string sort. Returns array of month_ids.
export function orderMonths(monthIds, monthsById) {
  return [...new Set(monthIds)].sort((a, b) => {
    const ya = monthsById[a]?.month_year
    const yb = monthsById[b]?.month_year
    if (ya && yb) return ya < yb ? -1 : ya > yb ? 1 : 0
    return String(a) < String(b) ? -1 : 1
  })
}

// scoreGivenVsReceived: for a user, avg score they GIVE and avg score their
// PICKED films RECEIVE from the club. moviesByPicker keyed by user_id.
// Returns { given, received }. received is null when picker data unavailable.
export function calcGivenVsReceived(userId, ratings, moviePickedBy, scoresByMovie) {
  const given = avg(ratings.filter(r => r.user_id === userId && r.score != null).map(r => Number(r.score)))
  const myFilms = Object.keys(moviePickedBy).filter(mid => moviePickedBy[mid] === userId)
  const recScores = []
  for (const mid of myFilms) recScores.push(...(scoresByMovie[mid] || []))
  return { given, received: recScores.length ? avg(recScores) : null }
}

// ─── Members Tab ─────────────────────────────────────────────────────────────

function MembersTab({ movies, ratings, users, loading, monthsById = {}, onMember, onFilm, onFullStats, focusMemberId = null, onFocusConsumed }) {
  // Which member's card is expanded into its detailed plots (null = none).
  const [expandedId, setExpandedId] = useState(null)
  // Refs to each member card so a deep link (?memberId=) can scroll it into view.
  const cardRefs = useRef({})

  const stats = useMemo(() => {
    if (!users.length) return null

    // Build movie lookup
    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    // Group ratings by user
    const byUser = {}
    for (const r of ratings) {
      if (!byUser[r.user_id]) byUser[r.user_id] = []
      byUser[r.user_id].push(r)
    }

    return users
      .filter(u => u.is_active !== false)
      .map(u => {
        const userRatings = byUser[u.id] || []
        const scored = userRatings.filter(r => r.score != null)
        const scores = scored.map(r => Number(r.score))
        const avgScore = avg(scores)

        // Sort by score desc for highest/lowest
        const scoredWithMovies = scored
          .map(r => ({ ...r, movie: movieMap[r.movie_id] }))
          .filter(r => r.movie)
          .sort((a, b) => Number(b.score) - Number(a.score))

        const highest = scoredWithMovies[0] || null
        const lowest = scoredWithMovies[scoredWithMovies.length - 1] || null

        // Recommend %
        const recAnswered = userRatings.filter(r => r.recommend_outside_club != null)
        const recYes = recAnswered.filter(r => r.recommend_outside_club === true)
        const recommendPct = recAnswered.length > 0
          ? (recYes.length / recAnswered.length) * 100
          : null

        // Avg excitement
        const excitements = userRatings
          .filter(r => r.pre_watch_excitement != null)
          .map(r => Number(r.pre_watch_excitement))
        const avgExcitement = avg(excitements)

        // Richer per-member stats for the expandable card.
        const sd = stddev(scores)
        const granularity = scoringGranularity(scores)
        const distBins = scores.length ? buildScoreBins(scores) : []

        // This member's scores over time (chronological), as a line. Points are
        // films but the x-axis labels by month (groupLabel) for a clean axis; the
        // tooltip shows the film title.
        const overTime = scoredWithMovies
          .slice()
          .sort((a, b) => {
            // By month first (imported submitted_at is unreliable → May-before-April).
            const ma = a.movie.month_id ? (monthsById[a.movie.month_id]?.month_year ?? '') : ''
            const mb = b.movie.month_id ? (monthsById[b.movie.month_id]?.month_year ?? '') : ''
            if (ma !== mb) return ma.localeCompare(mb)
            const ta = a.submitted_at ? Date.parse(a.submitted_at) : 0
            const tb = b.submitted_at ? Date.parse(b.submitted_at) : 0
            return ta - tb
          })
          .map((r, i) => {
            const my = r.movie.month_id ? monthsById[r.movie.month_id]?.month_year : null
            return {
              // Unique numeric x so same-month films stay distinct points.
              idx: i,
              groupLabel: my ? formatMonthShort(my) : '—',
              title: r.movie.title,
              value: Number(r.score),
            }
          })

        return {
          ...u,
          filmCount: scored.length,
          avgScore,
          highest,
          lowest,
          recommendPct,
          avgExcitement,
          sd,
          granularity,
          distBins,
          overTime,
          color: userColor(u) || 'var(--accent)',
        }
      })
      .filter(u => u.avgScore != null)
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [movies, ratings, users, monthsById])

  // Deep-link focus: when arriving via ?memberId=, expand that member's card and
  // scroll it into view once the data (and thus the card) is present. One-shot —
  // we clear the focus via onFocusConsumed so it doesn't re-fire on re-renders.
  useEffect(() => {
    if (loading || !focusMemberId || !stats) return
    const exists = stats.some(u => u.id === focusMemberId)
    if (!exists) { onFocusConsumed?.(); return }
    setExpandedId(focusMemberId)
    // Defer the scroll so the (now-expanded) card has laid out.
    const el = cardRefs.current[focusMemberId]
    if (el && typeof el.scrollIntoView === 'function') {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
    onFocusConsumed?.()
  }, [loading, focusMemberId, stats, onFocusConsumed])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[...Array(5)].map((_, i) => <Skeleton key={i} style={{ height: '160px' }} />)}
      </div>
    )
  }

  if (!stats || stats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
        No member data yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {stats.map(u => (
        <div key={u.id} ref={el => { cardRefs.current[u.id] = el }}>
        <GlassCard style={{ padding: '18px' }}>
          {/* Header row — click avatar/name to open the member's profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <div
              onClick={() => onMember?.(u.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMember?.(u.id) } }}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
            {/* Initials avatar */}
            <div style={{
              flexShrink: 0,
              width: '44px', height: '44px',
              borderRadius: '50%',
              border: `2px solid ${u.color}`,
              background: 'rgba(var(--fg-rgb), 0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: "'Bebas Neue',sans-serif",
                color: u.color,
                fontSize: '15px',
                letterSpacing: '0.04em',
              }}>
                {initials(u.name)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 700,
                color: 'var(--text-strong)',
                fontSize: '15px',
                margin: '0 0 2px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u.name}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace",
                color: 'var(--text-faint)',
                fontSize: '11px',
                margin: 0,
              }}>
                {u.filmCount} film{u.filmCount !== 1 ? 's' : ''} scored
              </p>
            </div>
            </div>
            {/* Big avg score */}
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <p style={{
                fontFamily: "'DM Mono',monospace",
                color: 'var(--text-faint)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                margin: '0 0 2px',
              }}>
                Avg
              </p>
              <p style={{
                fontFamily: "'Bebas Neue',sans-serif",
                color: 'var(--accent)',
                fontSize: '2rem',
                letterSpacing: '0.04em',
                lineHeight: 1,
                margin: 0,
              }}>
                {fmt(u.avgScore)}
              </p>
            </div>
            {/* Expand toggle — reveals detailed per-member plots */}
            <button
              onClick={() => setExpandedId(id => id === u.id ? null : u.id)}
              aria-label={expandedId === u.id ? 'Hide details' : 'Show details'}
              style={{
                flexShrink: 0, width: '30px', height: '30px', borderRadius: '9px',
                background: expandedId === u.id ? 'rgba(var(--fg-rgb), 0.09)' : 'rgba(var(--fg-rgb), 0.04)',
                border: '1px solid rgba(var(--fg-rgb), 0.08)',
                color: 'var(--text-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'DM Mono',monospace", fontSize: '12px',
              }}
            >
              {expandedId === u.id ? '▾' : '▸'}
            </button>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              background: 'rgba(var(--fg-rgb), 0.03)',
              borderRadius: '9px',
              padding: '10px 12px',
            }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px' }}>
                Excitement Avg
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {u.avgExcitement != null ? fmt(u.avgExcitement) : '—'}
              </p>
            </div>
            <div style={{
              background: 'rgba(var(--fg-rgb), 0.03)',
              borderRadius: '9px',
              padding: '10px 12px',
            }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px' }}>
                Would Recommend
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {u.recommendPct != null ? `${Math.round(u.recommendPct)}%` : '—'}
              </p>
            </div>
          </div>

          {/* Highest / Lowest */}
          {u.highest && (
            <div style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.05)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {u.highest && (
                <div onClick={() => onFilm?.(u.highest.movie)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hairline)', flexShrink: 0, width: '52px' }}>
                    Highest
                  </span>
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.highest.movie.title}
                  </p>
                  <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {fmt(u.highest.score)}
                  </span>
                </div>
              )}
              {u.lowest && u.lowest.id !== u.highest?.id && (
                <div onClick={() => onFilm?.(u.lowest.movie)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hairline)', flexShrink: 0, width: '52px' }}>
                    Lowest
                  </span>
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.lowest.movie.title}
                  </p>
                  <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-dim)', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {fmt(u.lowest.score)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Expandable detailed plots — keeps the page uncluttered by default */}
          {expandedId === u.id && (
            <div style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.05)', marginTop: '14px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Full-stats popup (their complete Me-tab breakdown, in their colour) */}
              {onFullStats && (
                <button
                  onClick={() => onFullStats(u.id)}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '11px',
                    background: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.22)',
                    color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', fontWeight: 500,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  View full stats <span style={{ fontSize: '15px', lineHeight: 1 }}>→</span>
                </button>
              )}
              {/* Secondary stat chips: std dev + granularity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', borderRadius: '9px', padding: '10px 12px' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px' }}>
                    Std Dev (spread)
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {u.sd != null ? fmt(u.sd) : '—'}
                  </p>
                </div>
                <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', borderRadius: '9px', padding: '10px 12px' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px' }}>
                    Granularity
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {u.granularity != null ? u.granularity.toFixed(2) : '—'}
                  </p>
                </div>
              </div>

              {/* Score distribution */}
              <div>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--hairline)', margin: '0 0 8px' }}>
                  Score Distribution
                </p>
                {u.distBins.length > 0 ? (
                  <ScoreHistogram data={u.distBins} height={130} color={u.color} percent />
                ) : (
                  <ChartPlaceholder height={80}>No scores yet.</ChartPlaceholder>
                )}
              </div>

              {/* Scores over time */}
              <div>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--hairline)', margin: '0 0 8px' }}>
                  Scores Over Time
                </p>
                {u.overTime.length >= 2 ? (
                  <MonthLineChart
                    data={u.overTime}
                    height={170}
                    color={u.color}
                    xKey="idx"
                    xLabelKey="groupLabel"
                    sparseTicks
                    tooltipLabelKey="title"
                    valueName="Score"
                  />
                ) : (
                  <ChartPlaceholder height={80}>Need 2+ scored films.</ChartPlaceholder>
                )}
              </div>
            </div>
          )}
        </GlassCard>
        </div>
      ))}
    </div>
  )
}

// ─── Club Tab ─────────────────────────────────────────────────────────────────

function formatMonthLabel(monthYear) {
  if (!monthYear) return monthYear
  // Local noon, not UTC midnight — avoids the previous-month rollover in ET/PT.
  const d = new Date(monthYear + '-01T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Even shorter label (e.g. "Apr '26") for dense trend axes where adjacent months
// would otherwise overlap.
function formatMonthShort(monthYear) {
  if (!monthYear) return monthYear
  const d = new Date(monthYear + '-01T12:00:00')
  return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(monthYear).slice(2, 4)}`
}

// Score-over-time trend (club avg + per-member) with a TMDB community reference
// line layered on top. The TMDB values are fetched live per tmdb_id from the
// TMDB API (client-safe read token) — the SAME source the Club-vs-TMDB scatter
// uses — and merged into the trend rows under a `tmdb` key.
//
//   mode='month' : each row carries `tmdbIds` (the month's films); the TMDB value
//                  is the average of those films' vote_averages (nulls skipped).
//   mode='film'  : each row carries `tmdbId`; the TMDB value is that one film's
//                  vote_average.
//
// Points with no TMDB data get `tmdb: undefined` so the dotted line SKIPS them
// (connectNulls) rather than dropping to 0. Degrades gracefully: if the token is
// missing or every fetch fails, the chart simply renders without the TMDB line.
function ClubTrendChart({ data, series, mode, ...rest }) {
  // tmdb_id -> vote_average (number), once loaded. null = not yet loaded.
  const [voteById, setVoteById] = useState(null)

  // All distinct tmdb_ids referenced by the current dataset.
  const ids = useMemo(() => {
    const set = new Set()
    for (const row of data) {
      if (mode === 'month') {
        for (const id of (row.tmdbIds || [])) if (id) set.add(id)
      } else if (row.tmdbId) {
        set.add(row.tmdbId)
      }
    }
    return [...set]
  }, [data, mode])

  const sig = useMemo(() => [...ids].sort((a, b) => a - b).join(','), [ids])

  useEffect(() => {
    const token = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
    if (!token || ids.length === 0) { setVoteById({}); return }
    let cancelled = false
    ;(async () => {
      setVoteById(null)
      try {
        const subset = ids.slice(0, 60)
        const results = await Promise.all(subset.map(async (id) => {
          try {
            const resp = await fetch(`https://api.themoviedb.org/3/movie/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!resp.ok) return [id, null]
            const j = await resp.json()
            const va = typeof j?.vote_average === 'number' ? j.vote_average : null
            return [id, va == null || va === 0 ? null : va]
          } catch { return [id, null] }
        }))
        if (cancelled) return
        const map = {}
        for (const [id, va] of results) if (va != null) map[id] = va
        setVoteById(map)
      } catch {
        if (!cancelled) setVoteById({})
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  // Merge the resolved TMDB value into each row under `tmdb`. Undefined (not 0)
  // for points without data so the line skips them.
  const mergedData = useMemo(() => {
    const map = voteById || {}
    return data.map(row => {
      let tmdb
      if (mode === 'month') {
        const vals = (row.tmdbIds || []).map(id => map[id]).filter(v => v != null)
        tmdb = vals.length ? Number((avg(vals)).toFixed(2)) : undefined
      } else {
        const v = row.tmdbId != null ? map[row.tmdbId] : null
        tmdb = v != null ? Number(v.toFixed(2)) : undefined
      }
      return { ...row, tmdb }
    })
  }, [data, voteById, mode])

  // Only include the TMDB series once at least one point resolved — avoids an
  // empty legend entry when TMDB is unavailable.
  const hasTmdb = useMemo(() => mergedData.some(r => r.tmdb != null), [mergedData])
  const effectiveSeries = useMemo(
    () => (hasTmdb ? series : series.filter(s => s.key !== 'tmdb')),
    [series, hasTmdb],
  )

  return <MonthLineChart data={mergedData} series={effectiveSeries} {...rest} />
}

// Club average vs TMDB community vote_average. Fetches vote_average per film from
// TMDB (client-safe read token). Degrades gracefully: if the token is missing or
// requests fail, renders a placeholder rather than erroring. candidates:
// [{ id, tmdb_id, title, clubAvg }].
function ClubVsTmdbChart({ candidates }) {
  const [rows, setRows] = useState(null) // null = loading, [] = none, [...] = data
  const [failed, setFailed] = useState(false)

  // Stable signature so the effect re-runs only when the candidate set changes.
  const sig = useMemo(
    () => candidates.map(c => c.tmdb_id).sort((a, b) => a - b).join(','),
    [candidates],
  )

  useEffect(() => {
    const token = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
    if (!token || candidates.length === 0) { setRows([]); return }
    let cancelled = false
    ;(async () => {
      setRows(null)
      setFailed(false)
      try {
        // Cap requests to keep this light; most-recent / first N candidates.
        const subset = candidates.slice(0, 40)
        const results = await Promise.all(subset.map(async (c) => {
          try {
            const resp = await fetch(`https://api.themoviedb.org/3/movie/${c.tmdb_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!resp.ok) return null
            const j = await resp.json()
            const va = typeof j?.vote_average === 'number' ? j.vote_average : null
            if (va == null || va === 0) return null
            return {
              name: c.title.length > 16 ? c.title.slice(0, 15) + '…' : c.title,
              club: Number(c.clubAvg.toFixed(2)),
              tmdb: Number(va.toFixed(2)),
            }
          } catch { return null }
        }))
        if (cancelled) return
        const clean = results.filter(Boolean)
        setRows(clean)
        if (clean.length === 0) setFailed(true)
      } catch {
        if (!cancelled) { setRows([]); setFailed(true) }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  if (rows === null) return <ChartPlaceholder>Loading TMDB ratings…</ChartPlaceholder>
  if (failed || rows.length === 0) {
    return <ChartPlaceholder>TMDB ratings unavailable.</ChartPlaceholder>
  }
  // Scatter: x = TMDB vote, y = club avg. The y = x reference line makes it
  // obvious which films we rate above vs below the wider community — far cleaner
  // than a forest of side-by-side bars with overlapping film labels (those now
  // live only in the tooltip). Points above the line = we liked it more.
  const above = rows.filter(r => r.club > r.tmdb).length
  // Auto-scale BOTH axes to the data (with padding) so films spread out instead
  // of bunching in a 0–10 box. A SHARED domain across x and y keeps the y=x
  // reference line a true diagonal and within the visible window.
  const allVals = rows.flatMap(r => [r.club, r.tmdb])
  const { domain: axisDomain, ticks: axisTicks } = niceScale(allVals, { min: 0, max: 10, targetCount: 5 })
  const fmt = (v) => Number(v).toFixed(axisDomain[1] - axisDomain[0] <= 3 ? 2 : 1)
  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
          <XAxis
            type="number" dataKey="tmdb" name="TMDB" domain={axisDomain} ticks={axisTicks} allowDecimals
            tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            tickFormatter={fmt}
          />
          <YAxis
            type="number" dataKey="club" name="Club" domain={axisDomain} ticks={axisTicks} allowDecimals
            tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }}
            axisLine={false} tickLine={false} width={30}
            tickFormatter={fmt}
          />
          <ReferenceLine segment={[{ x: axisDomain[0], y: axisDomain[0] }, { x: axisDomain[1], y: axisDomain[1] }]} stroke={CHART.muted} strokeDasharray="4 4" ifOverflow="hidden" />
          <Tooltip content={<ChartTooltip labelKey="name" />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={rows} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.club >= r.tmdb ? CHART_CATEGORICAL[0] : CHART_CATEGORICAL[1]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
        x = TMDB community vote · y = club average · above the dashed line = we rated it higher ({above}/{rows.length}) · hover for titles
      </p>
    </>
  )
}

// Genre Blindspot heatmap. rows: [{ id, name, counts:[n,...] }] aligned to
// `genres`. Each cell shows how many films of that genre the member has RATED.
// Zero cells are tinted faint-red (a blindspot); non-zero cells fill the accent
// at an opacity that scales with the count vs `max`. Horizontally scrollable so
// it stays readable on narrow screens; member labels open the member overlay.
function GenreBlindspotGrid({ genres, rows, max, onMember }) {
  const denom = max > 0 ? max : 1
  const labelW = 86
  const cellMin = 30
  // grid template: a fixed label column + one min-sized column per genre.
  const gridTemplate = `${labelW}px repeat(${genres.length}, minmax(${cellMin}px, 1fr))`
  return (
    <div>
    {/* Legend OUTSIDE the horizontal scroll area so it's fully readable. */}
    <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>
      Films each member has picked, per genre · faint red = never picked (a blindspot) · brighter = more picks
    </p>
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: `${labelW + genres.length * cellMin}px` }}>
        {/* Header row — genre labels rotated vertical so the full name fits each
            narrow column instead of truncating to "acti…". */}
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '3px', marginBottom: '4px', alignItems: 'end' }}>
          <div />
          {genres.map(g => (
            <div
              key={g}
              title={g}
              style={{ height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'visible' }}
            >
              <span style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontFamily: "'DM Mono',monospace",
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {g}
              </span>
            </div>
          ))}
        </div>

        {/* Member rows */}
        {rows.map(r => {
          const rowRgb = hexToRgbStr(r._color) || 'var(--accent-rgb, 168,85,247)'
          return (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '3px', marginBottom: '3px' }}>
            <div
              onClick={onMember ? () => onMember(r.id) : undefined}
              onKeyDown={onMember ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMember(r.id) } } : undefined}
              role={onMember ? 'button' : undefined}
              tabIndex={onMember ? 0 : undefined}
              title={r.name}
              style={{
                display: 'flex', alignItems: 'center',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: onMember ? 'pointer' : 'default',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                paddingRight: '4px',
              }}
            >
              {firstLast(r.name)}
            </div>
            {r.counts.map((c, i) => {
              const isBlind = c === 0
              // Non-zero: accent fill, opacity ramps 0.22 → 1.0 with the count.
              const intensity = 0.22 + 0.78 * (c / denom)
              const bg = isBlind
                ? 'rgba(220, 38, 38, 0.12)'
                : `rgba(${rowRgb}, ${intensity.toFixed(3)})`
              return (
                <div
                  key={i}
                  title={`${firstLast(r.name)} · ${genres[i]}: ${c} picked`}
                  style={{
                    height: '26px',
                    borderRadius: '5px',
                    background: bg,
                    border: isBlind ? '1px solid rgba(220, 38, 38, 0.28)' : '1px solid rgba(var(--fg-rgb), 0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '10px',
                    color: isBlind
                      ? 'rgba(220, 38, 38, 0.85)'
                      : (intensity > 0.6 ? 'var(--bg)' : 'var(--text-strong)'),
                  }}
                >
                  {c}
                </div>
              )
            })}
          </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}

// ─── Connection Web · 6 Degrees ──────────────────────────────────────────────
// A custom node-link "constellation": every film the club has watched, laid out
// on a ring, with edges drawn between films that share a top-billed actor or a
// director. Hover/tap a film to light up its threads and read who links them.
// Built as raw SVG (no Recharts) — the graph shape is bespoke. Pure theme tokens
// so it reads on both light and dark.

// Shorten a film title for the ring labels: drop trailing subtitle clauses after
// a colon, then a comma, and hard-cap the length so labels never collide.
function shortFilmTitle(title) {
  if (!title) return ''
  let t = String(title).split(':')[0].split(',')[0].trim()
  if (t.length > 17) t = t.slice(0, 16).trimEnd() + '…'
  return t
}

function buildConnectionGraph(movies) {
  // Index people → film ids. Actors are exact, case-sensitive matches on the
  // tmdb_cast array; a shared non-null director (dir.) and each screenwriter
  // (wr., from tmdb_writers) are also bridges (labelled by role).
  const personFilms = new Map() // personLabel -> Set(movieId)
  const add = (label, id) => {
    if (!personFilms.has(label)) personFilms.set(label, new Set())
    personFilms.get(label).add(id)
  }
  for (const m of movies) {
    if (Array.isArray(m.tmdb_cast)) {
      for (const name of m.tmdb_cast) {
        if (typeof name === 'string' && name.trim()) add(name, m.id)
      }
    }
    if (typeof m.director === 'string' && m.director.trim()) {
      add(`dir. ${m.director.trim()}`, m.id)
    }
    // Screenwriters are bridges too (e.g. Charlie Kaufman links Adaptation,
    // Being John Malkovich, and Eternal Sunshine). Labelled distinctly from a
    // same-named director so the caption reads "wr. X" vs "dir. X".
    if (Array.isArray(m.tmdb_writers)) {
      for (const name of m.tmdb_writers) {
        if (typeof name === 'string' && name.trim()) add(`wr. ${name.trim()}`, m.id)
      }
    }
  }

  // For each bridge person (in ≥2 films), connect every pair of their films.
  // Edge key is the sorted id pair; we accumulate the people on each edge.
  const movieById = new Map(movies.map(m => [m.id, m]))
  const edgeMap = new Map() // "a|b" -> { a, b, people:Set }
  const connectedIds = new Set()
  for (const [label, set] of personFilms) {
    if (set.size < 2) continue
    const ids = [...set]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j]
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!edgeMap.has(key)) edgeMap.set(key, { a: key.split('|')[0], b: key.split('|')[1], people: new Set() })
        edgeMap.get(key).people.add(label)
        connectedIds.add(a); connectedIds.add(b)
      }
    }
  }

  const edges = [...edgeMap.values()].map(e => ({
    a: e.a, b: e.b, people: [...e.people].sort(),
  }))

  // Degree = number of distinct neighbour films (drives node size / hub glow).
  const degree = new Map()
  for (const id of connectedIds) degree.set(id, 0)
  const neighbours = new Map()
  for (const id of connectedIds) neighbours.set(id, new Set())
  for (const e of edges) {
    neighbours.get(e.a).add(e.b)
    neighbours.get(e.b).add(e.a)
  }
  for (const id of connectedIds) degree.set(id, neighbours.get(id).size)

  // Order nodes so hubs sit opposite-ish and labels breathe: sort by degree desc
  // then title — keeps the busiest films from clustering on one arc.
  const nodes = [...connectedIds]
    .map(id => movieById.get(id))
    .filter(Boolean)
    .sort((x, y) => (degree.get(y.id) - degree.get(x.id)) || String(x.title).localeCompare(String(y.title)))
    .map(m => ({ id: m.id, movie: m, title: m.title, degree: degree.get(m.id) || 0 }))

  return { nodes, edges, neighbours }
}

function ConnectionWeb({ movies = [], onFilm }) {
  const accent = accentColor()
  const [active, setActive] = useState(null)         // selected node (film) id
  const [activeEdge, setActiveEdge] = useState(null) // selected edge index (a single line)

  const graph = useMemo(() => buildConnectionGraph(movies), [movies])
  const { nodes, edges } = graph

  // Radial layout in a fixed viewBox; the SVG scales to its container width.
  const VB = 460
  // Horizontal padding added to the viewBox so left/right node labels (e.g.
  // "Kingdom of Heaven") aren't clipped off the edge of the box.
  const LABEL_PAD = 70
  const cx = VB / 2
  const cy = VB / 2
  const R = VB * 0.34 // ring radius — leaves room for outside labels
  const pos = useMemo(() => {
    const map = new Map()
    const n = nodes.length || 1
    nodes.forEach((node, i) => {
      // Start at the top (−90°) and go clockwise.
      const ang = (-Math.PI / 2) + (i / n) * Math.PI * 2
      map.set(node.id, {
        x: cx + R * Math.cos(ang),
        y: cy + R * Math.sin(ang),
        ang,
      })
    })
    return map
  }, [nodes, cx, cy, R])

  const selectedEdge = activeEdge != null ? (edges[activeEdge] || null) : null
  const anySelection = active != null || selectedEdge != null

  // Which nodes are lit. An edge selection lights ONLY that line's two endpoints;
  // a node selection lights the node and every film it shares a person with.
  const litNodeIds = useMemo(() => {
    if (selectedEdge) return new Set([selectedEdge.a, selectedEdge.b])
    if (active == null) return null
    const s = new Set([active])
    for (const e of edges) {
      if (e.a === active) s.add(e.b)
      if (e.b === active) s.add(e.a)
    }
    return s
  }, [active, selectedEdge, edges])

  // Edges feeding the caption: just the one line when an edge is selected, else
  // every line touching the selected node.
  const activeEdges = useMemo(() => {
    if (selectedEdge) return [selectedEdge]
    if (active == null) return []
    return edges.filter(e => e.a === active || e.b === active)
  }, [active, selectedEdge, edges])

  // Caption: people linking the active film to its neighbours (deduped).
  const linkPeople = useMemo(() => {
    const set = new Set()
    for (const e of activeEdges) for (const p of e.people) set.add(p)
    return [...set]
  }, [activeEdges])

  const activeMovie = active != null ? nodes.find(n => n.id === active)?.movie : null
  const edgeFilms = selectedEdge
    ? [nodes.find(n => n.id === selectedEdge.a)?.movie, nodes.find(n => n.id === selectedEdge.b)?.movie].filter(Boolean)
    : []

  if (nodes.length === 0) {
    return (
      <div>
        <ConnectionWebHeading />
        <GlassCard style={{ padding: '28px 20px' }}>
          <ChartPlaceholder height={90}>
            No shared actors or directors yet — connections appear as the club watches more films.
          </ChartPlaceholder>
        </GlassCard>
      </div>
    )
  }

  // Build a gentle quadratic curve between two points, bowing toward centre.
  const curve = (p1, p2) => {
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2
    // Pull the control point a fraction of the way toward the hub for an arc.
    const qx = mx + (cx - mx) * 0.22
    const qy = my + (cy - my) * 0.22
    return `M ${p1.x} ${p1.y} Q ${qx} ${qy} ${p2.x} ${p2.y}`
  }

  const clear = () => { setActive(null); setActiveEdge(null) }

  return (
    <div>
      <ConnectionWebHeading />
      <GlassCard style={{ padding: '14px 10px 18px', overflow: 'hidden' }}>
        <svg
          viewBox={`${-LABEL_PAD} 0 ${VB + 2 * LABEL_PAD} ${VB}`}
          width="100%"
          role="img"
          aria-label="Connection web of films linked by shared actors or directors"
          style={{ display: 'block', maxWidth: '520px', margin: '0 auto', touchAction: 'manipulation', outline: 'none' }}
          onClick={(e) => { if (e.target === e.currentTarget) clear() }}
        >
          {/* faint backing ring for depth */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(var(--fg-rgb),0.05)" strokeWidth="1" />

          {/* EDGES — drawn under nodes. Click a line to isolate that single
              connection. A fat transparent path gives the thin line a tap target. */}
          <g>
            {edges.map((e, i) => {
              const p1 = pos.get(e.a)
              const p2 = pos.get(e.b)
              if (!p1 || !p2) return null
              const lit = selectedEdge ? i === activeEdge : (active != null && (e.a === active || e.b === active))
              const dim = anySelection && !lit
              const d = curve(p1, p2)
              return (
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'pointer', outline: 'none' }}
                    onClick={(ev) => { ev.stopPropagation(); setActive(null); setActiveEdge(prev => (prev === i ? null : i)) }}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={lit ? accent : 'rgba(var(--fg-rgb),0.16)'}
                    strokeWidth={lit ? 2 : 1}
                    strokeLinecap="round"
                    pointerEvents="none"
                    style={{
                      opacity: dim ? 0.1 : lit ? 0.95 : 0.6,
                      transition: 'opacity 0.25s ease, stroke 0.25s ease, stroke-width 0.25s ease',
                    }}
                  />
                </g>
              )
            })}
          </g>

          {/* NODES */}
          <g>
            {nodes.map((node) => {
              const p = pos.get(node.id)
              if (!p) return null
              const isActive = active === node.id
              const lit = litNodeIds == null || litNodeIds.has(node.id)
              const dim = litNodeIds != null && !litNodeIds.has(node.id)
              // Hubs read a touch bigger.
              const r = 6 + Math.min(node.degree, 4) * 1.6
              // Label sits just outside the ring; anchor by side to avoid overlap.
              const out = 1 + (r + 9) / R
              const lx = cx + (p.x - cx) * out
              const ly = cy + (p.y - cy) * out
              const cosA = Math.cos(p.ang)
              const anchor = Math.abs(cosA) < 0.3 ? 'middle' : cosA > 0 ? 'start' : 'end'
              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer', outline: 'none', transition: 'opacity 0.25s ease', opacity: dim ? 0.32 : 1 }}
                  // First tap selects the film (traces its connections); a second
                  // tap on the already-selected film opens its page.
                  onClick={(e) => {
                    e.stopPropagation()
                    if (active === node.id) onFilm?.(node.movie)
                    else { setActiveEdge(null); setActive(node.id) }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.title} — tap to trace connections, tap again to open`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (active === node.id) onFilm?.(node.movie)
                      else { setActiveEdge(null); setActive(node.id) }
                    }
                  }}
                >
                  {/* glow halo for the highlighted node(s) — the selected node,
                      or either endpoint of a selected line. */}
                  {(isActive || (lit && anySelection)) && (
                    <circle cx={p.x} cy={p.y} r={r + 5} fill={accent} opacity={isActive ? 0.22 : 0.12} />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={lit && anySelection ? accent : 'var(--surface)'}
                    stroke={lit && anySelection ? accent : 'rgba(var(--fg-rgb),0.4)'}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    style={{ transition: 'fill 0.25s ease, stroke 0.25s ease' }}
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontFamily="'DM Sans',sans-serif"
                    fontSize="11"
                    fontWeight={isActive ? 700 : 500}
                    fill={dim ? 'var(--text-faint)' : isActive ? 'var(--text-strong)' : 'var(--text-muted)'}
                    style={{ transition: 'fill 0.25s ease', pointerEvents: 'none' }}
                  >
                    {shortFilmTitle(node.title)}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Caption / tooltip area — live updates with the active film. Reserve a
            fixed height so the layout doesn't jump as it appears. */}
        <div style={{ minHeight: '44px', marginTop: '8px', padding: '0 10px', textAlign: 'center' }}>
          {activeMovie ? (
            <>
              <p style={{
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: '0.04em',
                fontSize: '1.05rem', color: 'var(--text-strong)', margin: '0 0 2px',
              }}>
                {activeMovie.title}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: '10.5px', color: 'var(--text-dim)',
                margin: 0, lineHeight: 1.5,
              }}>
                {linkPeople.length > 0
                  ? <>linked by <span style={{ color: 'var(--accent)' }}>{linkPeople.join(' · ')}</span></>
                  : 'no shared links'}
              </p>
            </>
          ) : selectedEdge ? (
            <>
              <p style={{
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: '0.04em',
                fontSize: '1.05rem', color: 'var(--text-strong)', margin: '0 0 2px',
              }}>
                {edgeFilms.map(m => m.title).join('  ↔  ')}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: '10.5px', color: 'var(--text-dim)',
                margin: 0, lineHeight: 1.5,
              }}>
                {linkPeople.length > 0
                  ? <>linked by <span style={{ color: 'var(--accent)' }}>{linkPeople.join(' · ')}</span></>
                  : 'shared link'}
              </p>
            </>
          ) : (
            <p style={{
              fontFamily: "'DM Mono',monospace", fontSize: '10.5px', color: 'var(--text-faint)',
              margin: '12px 0 0',
            }}>
              Tap a film to trace its connections, tap again to open it · tap a line to isolate one connection
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  )
}

function ConnectionWebHeading() {
  return (
    <div style={{ marginBottom: '12px' }}>
      <h3 style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.5rem',
        letterSpacing: '0.04em',
        color: 'var(--text-strong)',
        margin: '0 0 2px',
        lineHeight: 1.05,
      }}>
        Connection Web · 6 Degrees
      </h3>
      <p style={{
        fontFamily: "'DM Sans',sans-serif",
        fontSize: '12px',
        color: 'var(--text-dim)',
        margin: 0,
      }}>
        Films your club has watched, linked by a shared actor, writer, or director.
      </p>
    </div>
  )
}

function ClubTab({ movies, ratings, users, loading, monthsById = {}, onFilm, onMember, onGenre }) {
  // Trend x-axis mode: per-film (chronological watch order) vs monthly average.
  // Default to per-film — it's the more granular, requested-first view.
  const [trendMode, setTrendMode] = useState('film')
  // Collapse the (potentially long) per-film spread list to a few rows by default.
  const [spreadShowAll, setSpreadShowAll] = useState(false)
  // Connection web is existence-based — show films whose pick is public (active or
  // revealed), never UPCOMING picks (e.g. June's Gattaca).
  const connectionMovies = useMemo(() => movies.filter(m => m._exists), [movies])
  const stats = useMemo(() => {
    if (!movies.length) return null

    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    // Build month lookup from movies (month_id)
    const monthSet = []
    const monthMovies = {}
    for (const m of movies) {
      if (!m.month_id) continue
      if (!monthMovies[m.month_id]) {
        monthMovies[m.month_id] = []
        monthSet.push(m.month_id)
      }
      monthMovies[m.month_id].push(m)
    }
    // Sort months chronologically using month_year via the canonical helper
    const sortedMonths = orderMonths([...new Set(monthSet)], monthsById)

    // Score over time: avg score per month
    const ratingsByMovie = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!ratingsByMovie[r.movie_id]) ratingsByMovie[r.movie_id] = []
      ratingsByMovie[r.movie_id].push(Number(r.score))
    }

    const monthAvgs = sortedMonths.map(mid => {
      const films = monthMovies[mid] || []
      // Average each film's authoritative average (historical_avg_score when set —
      // it reflects the complete score set; individual rows are an incomplete backfill).
      const filmAvgs = []
      for (const m of films) {
        const sc = ratingsByMovie[m.id] || []
        const a = (m.scores_revealed && m.historical_avg_score != null) ? Number(m.historical_avg_score) : (sc.length ? avg(sc) : null)
        if (a != null) filmAvgs.push(a)
      }
      const monthYear = monthsById[mid]?.month_year ?? null
      return { month_id: mid, month_year: monthYear, avgScore: avg(filmAvgs), films }
    }).filter(x => x.avgScore != null)

    // Most active scorer
    const scoreCounts = {}
    for (const r of ratings) {
      if (r.score == null) continue
      scoreCounts[r.user_id] = (scoreCounts[r.user_id] || 0) + 1
    }
    let mostActiveUser = null
    let mostActiveCount = 0
    for (const u of users) {
      const c = scoreCounts[u.id] || 0
      if (c > mostActiveCount) { mostActiveCount = c; mostActiveUser = u }
    }

    // Scoring streaks — months a user scored at least one film
    const ratingsByUser = {}
    for (const r of ratings) {
      if (r.score == null) continue
      const movie = movieMap[r.movie_id]
      if (!movie || !movie.month_id) continue
      if (!ratingsByUser[r.user_id]) ratingsByUser[r.user_id] = new Set()
      ratingsByUser[r.user_id].add(movie.month_id)
    }
    const activeUsers = users.filter(u => u.is_active !== false)
    const streaks = calcScoringStreaks(
      activeUsers.map(u => u.id),
      sortedMonths,
      ratingsByUser,
    )

    // Genre breakdown — existence-only (genre doesn't depend on scores), so include
    // every film whose pick is public (active or revealed months), not upcoming.
    const revealedMovies = movies.filter(m => m._exists)
    const genreStrings = revealedMovies
      .map(m => {
        if (!m.genre) return null
        if (Array.isArray(m.genre)) return m.genre.join(', ')
        return String(m.genre)
      })
      .filter(Boolean)
    const genreCounts = calcGenreBreakdown(genreStrings)
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const totalFilmsForGenre = revealedMovies.length
    // Are there any movies with genre data at all?
    const hasAnyGenreData = revealedMovies.some(m => m.genre && (Array.isArray(m.genre) ? m.genre.length > 0 : String(m.genre).trim() !== ''))

    // ── Genre Blindspot Grid ──────────────────────────────────────────────────
    // For each active member × each genre, count how many films of that genre the
    // member has PICKED (their curation). A zero cell is a genre the member has
    // never picked from — their blindspot as a curator. (Counting picks, not
    // ratings: everyone rates every film, so "rated" carried little signal — this
    // shows each member's taste. The Favourite Genres chart covers club-wide mix.)
    // We constrain to the genres that appear (top by overall film count) so the
    // grid stays readable, and to films that carry genre data.
    const genreFilmIds = {} // genre -> Set<movie_id> (movies tagged with that genre)
    for (const m of movies) {
      if (!m._exists) continue // existence-based: exclude upcoming picks
      if (!m.genre) continue
      const parts = (Array.isArray(m.genre) ? m.genre : String(m.genre).split(','))
        .map(s => String(s).trim()).filter(Boolean)
      for (const g of parts) {
        if (!genreFilmIds[g]) genreFilmIds[g] = new Set()
        genreFilmIds[g].add(m.id)
      }
    }
    // Order genres by how many films carry them (most common first), cap to keep
    // the grid mobile-friendly.
    const blindspotGenres = Object.entries(genreFilmIds)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 12)
      .map(([g]) => g)

    // Which films each member PICKED (revealed picks carry picked_by_user_id).
    const pickedFilmsByUser = {} // userId -> Set<movie_id>
    for (const m of movies) {
      if (!m.picked_by_user_id) continue
      if (!pickedFilmsByUser[m.picked_by_user_id]) pickedFilmsByUser[m.picked_by_user_id] = new Set()
      pickedFilmsByUser[m.picked_by_user_id].add(m.id)
    }

    // Build the matrix: rows = active members, cols = genres, cell = # PICKED in genre.
    let blindspotMax = 0
    const blindspotRows = activeUsers.map(u => {
      const picked = pickedFilmsByUser[u.id] || new Set()
      const counts = blindspotGenres.map(g => {
        const filmsInGenre = genreFilmIds[g] || new Set()
        let c = 0
        for (const fid of filmsInGenre) if (picked.has(fid)) c++
        if (c > blindspotMax) blindspotMax = c
        return c
      })
      return { id: u.id, name: u.name, _color: userColor(u), counts }
    })
    const hasBlindspotData = blindspotGenres.length > 0 && blindspotRows.length > 0

    // Excitement vs Reality
    const excitements = ratings
      .filter(r => r.pre_watch_excitement != null)
      .map(r => Number(r.pre_watch_excitement))
    const finalScores = ratings
      .filter(r => r.score != null)
      .map(r => Number(r.score))
    const avgExcitement = avg(excitements)
    const avgFinal = avg(finalScores)

    // ── Trend overlay: club avg + each member's monthly avg over months ──
    // Per-member, per-month average of their own scores. Keyed by month_id so it
    // aligns with the monthAvgs ordering.
    const memberMonthScores = {} // userId -> { monthId -> [scores] }
    for (const r of ratings) {
      if (r.score == null) continue
      const mv = movieMap[r.movie_id]
      if (!mv || !mv.month_id) continue
      ;(memberMonthScores[r.user_id] ||= {})
      ;(memberMonthScores[r.user_id][mv.month_id] ||= []).push(Number(r.score))
    }
    const trendMembers = users.filter(u => u.is_active !== false && memberMonthScores[u.id])
    // Each row is one month; columns are clubAvg + one key per member (u_<id>).
    const trendData = monthAvgs.map(m => {
      const row = {
        month: m.month_year ? formatMonthLabel(m.month_year) : 'm',
        club: m.avgScore,
        // tmdb_ids of this month's films — the TMDB community line is the average
        // of these films' vote_averages (fetched live, same source as the scatter).
        tmdbIds: (m.films || []).map(f => f.tmdb_id).filter(Boolean),
      }
      for (const u of trendMembers) {
        const arr = memberMonthScores[u.id]?.[m.month_id]
        row[`u_${u.id}`] = arr && arr.length ? avg(arr) : null
      }
      return row
    })
    // Club line is the neutral aggregate — thick + solid so it's unmistakable
    // regardless of theme/accent, and can't be confused with any member colour.
    const trendSeries = [
      { key: 'club', name: 'Club avg', color: CHART_NEUTRAL, emphasize: true },
      ...trendMembers.map((u, i) => ({ key: `u_${u.id}`, name: firstLast(u.name), color: userColor(u) || chartColorAt(i) })),
      // Neutral grey dotted reference line for the wider TMDB community rating.
      // Distinct from the (strong, solid, thick) club line and the saturated
      // per-member colours; rendered thin + dotless via the `reference` flag.
      { key: 'tmdb', name: 'TMDB', color: 'rgba(var(--fg-rgb), 0.45)', reference: true, dashArray: '3 3' },
    ]

    // ── By-FILM trend variant: x-axis = films in chronological watch order ──
    // One row per revealed film (ordered by month then watch order = id ASC),
    // with the film's club avg + each member's score on that film. Lets users see
    // per-film club-vs-member detail, not just the monthly average.
    const orderedFilms = []
    for (const mid of sortedMonths) {
      const films = [...(monthMovies[mid] || [])]
        .filter(m => m._canSee)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      for (const m of films) orderedFilms.push({ movie: m, month_id: mid })
    }
    const filmTrendData = orderedFilms.map(({ movie: m, month_id }, i) => {
      const sc = ratingsByMovie[m.id] || []
      const clubAvg = (m.scores_revealed && m.historical_avg_score != null) ? Number(m.historical_avg_score) : (sc.length ? avg(sc) : null)
      const my = monthsById[month_id]?.month_year ?? null
      const row = {
        // `idx` is a UNIQUE per-film x value. Using the month label as the x-axis
        // key collapsed multiple films in the same month onto one x position, so
        // clicks resolved to the wrong film. A unique numeric x keeps every point
        // distinct; the month label is recovered for the tick via `xLabel`.
        idx: i,
        movieId: m.id,
        tmdbId: m.tmdb_id || null,
        xLabel: my ? formatMonthLabel(my) : '—',
        groupLabel: my ? formatMonthLabel(my) : '—',
        title: m.title,
        club: clubAvg,
      }
      for (const u of trendMembers) {
        const r = ratings.find(rr => rr.movie_id === m.id && rr.user_id === u.id && rr.score != null)
        row[`u_${u.id}`] = r ? Number(r.score) : null
      }
      return row
    }).filter(r => r.club != null)

    // ── All-time score distribution histogram (0–10 buckets) ──
    const allScores = ratings.filter(r => r.score != null).map(r => Number(r.score))
    const distBuckets = Array.from({ length: 10 }, (_, i) => ({
      label: i === 9 ? '9–10' : `${i}–${i + 1}`,
      count: allScores.filter(s => s >= i && (i === 9 ? s <= 10.01 : s < i + 1)).length,
    }))

    // ── Per-member score spread box plot + avg given vs received bars ──
    const scoresByUser = {}
    for (const r of ratings) {
      if (r.score == null) continue
      ;(scoresByUser[r.user_id] ||= []).push(Number(r.score))
    }
    const moviePickedBy = {}
    for (const m of movies) {
      if (m.picked_by_user_id && m.picker_revealed) moviePickedBy[m.id] = m.picked_by_user_id
    }
    const havePickerData = Object.keys(moviePickedBy).length > 0

    const memberBox = users
      .filter(u => u.is_active !== false && (scoresByUser[u.id] || []).length >= 2)
      .map(u => ({ name: firstLast(u.name), _color: userColor(u), ...quartiles(scoresByUser[u.id]) }))

    const clubAvgAll = avg(allScores)
    const givenReceived = users
      .filter(u => u.is_active !== false && (scoresByUser[u.id] || []).length >= 1)
      .map(u => {
        const gr = calcGivenVsReceived(u.id, ratings, moviePickedBy, ratingsByMovie)
        return {
          name: firstLast(u.name),
          given: gr.given,
          received: gr.received,
          club: clubAvgAll,
        }
      })

    // ── Picker power rankings: avg score of films each member picked ──
    let pickerRankings = []
    if (havePickerData) {
      const byPicker = {}
      for (const m of movies) {
        const pid = moviePickedBy[m.id]
        if (!pid) continue
        const sc = ratingsByMovie[m.id] || []
        const a = (m.scores_revealed && m.historical_avg_score != null) ? Number(m.historical_avg_score) : (sc.length ? avg(sc) : null)
        if (a == null) continue
        ;(byPicker[pid] ||= []).push(a)
      }
      pickerRankings = users
        .filter(u => byPicker[u.id]?.length)
        .map(u => ({ id: u.id, name: u.name, _color: userColor(u), avg: avg(byPicker[u.id]), count: byPicker[u.id].length }))
        .sort((a, b) => b.avg - a.avg)
    }

    // ── Member score correlation heatmap (pairwise pearson over shared films) ──
    const corrMembers = users.filter(u => u.is_active !== false && (scoresByUser[u.id] || []).length >= 2)
    const userRatingMap = {}
    for (const u of corrMembers) {
      const map = {}
      for (const r of ratings) {
        if (r.user_id === u.id && r.score != null) map[r.movie_id] = Number(r.score)
      }
      userRatingMap[u.id] = map
    }
    const corrNames = corrMembers.map(u => firstLast(u.name))
    const corrMatrix = corrMembers.map((ua) =>
      corrMembers.map((ub) => {
        if (ua.id === ub.id) return 1
        const a = [], b = []
        for (const mid of Object.keys(userRatingMap[ua.id])) {
          if (userRatingMap[ub.id][mid] != null) {
            a.push(userRatingMap[ua.id][mid])
            b.push(userRatingMap[ub.id][mid])
          }
        }
        return a.length >= 3 ? pearson(a, b) : null
      })
    )

    // ── All-time score percentile chart (member avg → percentile rank) ──
    const memberAvgArr = corrMembers.map(u => avg(scoresByUser[u.id]))
    const percentileData = corrMembers
      .map(u => {
        const a = avg(scoresByUser[u.id])
        return { id: u.id, name: firstLast(u.name), value: percentileRank(memberAvgArr, a), avgScore: a, _fill: userColor(u) }
      })
      .sort((a, b) => b.value - a.value)


    // ── Average score per release DECADE ──
    // Group films by release decade; average each film's authoritative average.
    const decadeBuckets = {} // "1990s" -> [filmAvg, ...]
    for (const m of movies) {
      if (!m._canSee) continue
      const dl = decadeLabel(m.year_released)
      if (!dl) continue
      const sc = ratingsByMovie[m.id] || []
      const a = (m.scores_revealed && m.historical_avg_score != null) ? Number(m.historical_avg_score) : (sc.length ? avg(sc) : null)
      if (a == null) continue
      ;(decadeBuckets[dl] ||= []).push(a)
    }
    const decadeData = Object.entries(decadeBuckets)
      .map(([decade, arr]) => ({ decade, value: avg(arr), count: arr.length }))
      .sort((a, b) => (a.decade < b.decade ? -1 : 1))

    // ── Per-user scoring GRANULARITY (smallest increment they use) ──
    const granularityData = users
      .filter(u => u.is_active !== false && (scoresByUser[u.id] || []).length >= 2)
      .map(u => ({
        id: u.id,
        name: firstLast(u.name),
        granularity: scoringGranularity(scoresByUser[u.id]),
        color: userColor(u) || accentColor(),
      }))
      .filter(d => d.granularity != null)
      .sort((a, b) => a.granularity - b.granularity)

    // ── Per-user STD DEV (scoring variation) ──
    const stdDevData = users
      .filter(u => u.is_active !== false && (scoresByUser[u.id] || []).length >= 2)
      .map(u => ({
        id: u.id,
        name: firstLast(u.name),
        value: stddev(scoresByUser[u.id]),
        _fill: userColor(u) || accentColor(),
      }))
      .filter(d => d.value != null)
      .sort((a, b) => b.value - a.value)

    // ── Per-MOVIE stats: each member's avg + spread, plus film stddev ──
    // One row per revealed film with ≥2 scores: club avg + score stddev across
    // members. Most-divergent first; capped so the chart stays readable.
    const perMovieStats = movies
      .filter(m => m._canSee && (ratingsByMovie[m.id] || []).length >= 2)
      .map(m => {
        const sc = ratingsByMovie[m.id]
        return { id: m.id, title: m.title, movie: m, mean: avg(sc), sd: stddev(sc), count: sc.length }
      })
      .sort((a, b) => (b.sd ?? 0) - (a.sd ?? 0))

    // ── Club vs TMDB: films with a tmdb_id, paired club avg vs TMDB vote_average.
    // The actual vote_average is fetched client-side (see component) since the DB
    // doesn't store it. Here we just expose the candidate films + club avgs.
    const tmdbCandidates = movies
      .filter(m => m._canSee && m.tmdb_id)
      .map(m => {
        const sc = ratingsByMovie[m.id] || []
        const clubAvg = (m.scores_revealed && m.historical_avg_score != null) ? Number(m.historical_avg_score) : (sc.length ? avg(sc) : null)
        return clubAvg != null ? { id: m.id, tmdb_id: m.tmdb_id, title: m.title, clubAvg } : null
      })
      .filter(Boolean)

    return {
      monthAvgs,
      trendData,
      filmTrendData,
      trendSeries,
      decadeData,
      granularityData,
      stdDevData,
      perMovieStats,
      tmdbCandidates,
      mostActiveUser,
      mostActiveCount,
      streaks,
      activeUsers,
      topGenres,
      hasAnyGenreData,
      totalFilmsForGenre,
      blindspotGenres,
      blindspotRows,
      blindspotMax,
      hasBlindspotData,
      avgExcitement,
      avgFinal,
      distBuckets,
      memberBox,
      givenReceived,
      pickerRankings,
      havePickerData,
      corrNames,
      corrMatrix,
      percentileData,
    }
  }, [movies, ratings, users, monthsById])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton style={{ height: '220px' }} />
        <Skeleton style={{ height: '80px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '120px' }} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
        No club data yet.
      </div>
    )
  }

  const maxGenreCount = stats.topGenres.length > 0 ? stats.topGenres[0][1] : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Score Over Time — TREND overlay (club avg + each member) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <SectionLabel>Score Over Time · Club vs Members</SectionLabel>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: '8px', padding: '3px', marginBottom: '12px', flexShrink: 0 }}>
            {['film', 'month'].map(mode => (
              <button
                key={mode}
                onClick={() => setTrendMode(mode)}
                style={{
                  padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: trendMode === mode ? 'rgba(var(--fg-rgb), 0.1)' : 'transparent',
                  color: trendMode === mode ? 'var(--text-strong)' : 'var(--text-faint)',
                  fontFamily: "'DM Mono',monospace", fontSize: '10px', textTransform: 'capitalize',
                  fontWeight: trendMode === mode ? 600 : 400,
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <GlassCard style={{ padding: '16px 12px' }}>
          {trendMode === 'month' ? (
            stats.trendData.length >= 2 ? (
              <>
                <ClubTrendChart data={stats.trendData} series={stats.trendSeries} mode="month" height={230} />
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
                  Thick solid line = club average · grey dotted = TMDB community · others = each member's monthly average
                </p>
              </>
            ) : stats.trendData.length === 1 ? (
              <ChartPlaceholder>Only one month of data — need 2+ for a trend.</ChartPlaceholder>
            ) : (
              <ChartPlaceholder>No monthly data yet.</ChartPlaceholder>
            )
          ) : (
            stats.filmTrendData.length >= 2 ? (
              <>
                <ClubTrendChart
                  data={stats.filmTrendData}
                  series={stats.trendSeries}
                  mode="film"
                  height={230}
                  xKey="idx"
                  xLabelKey="xLabel"
                  sparseTicks
                  tooltipLabelKey="title"
                />
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
                  Per film, in watch order · thick solid line = club average · grey dotted = TMDB community · others = each member
                </p>
              </>
            ) : (
              <ChartPlaceholder>Need 2+ revealed films for a per-film trend.</ChartPlaceholder>
            )
          )}
        </GlassCard>
      </div>

      {/* All-time Score Distribution */}
      <div>
        <SectionLabel>All-Time Score Distribution</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          <ScoreHistogram data={stats.distBuckets} height={170} percent />
        </GlassCard>
      </div>

      {/* Club vs TMDB community rating */}
      <div>
        <SectionLabel>Club vs TMDB</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.tmdbCandidates.length > 0 ? (
            <ClubVsTmdbChart candidates={stats.tmdbCandidates} />
          ) : (
            <ChartPlaceholder>No films with a TMDB id yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Average Score by Release Decade */}
      <div>
        <SectionLabel>Average Score by Decade</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.decadeData.length > 0 ? (
            <>
              <ComparisonBar
                data={stats.decadeData.map(d => ({ name: d.decade, value: d.value }))}
                keys={[{ key: 'value', name: 'Avg' }]}
                layout="horizontal"
                labelKey="name"
                smartDomain
                height={Math.max(160, stats.decadeData.length * 26 + 50)}
              />
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
                {stats.decadeData.map(d => `${d.decade}: ${d.count}`).join(' · ')} films
              </p>
            </>
          ) : (
            <ChartPlaceholder>No release-year data yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Per-member scoring granularity (smallest increment used) */}
      <div>
        <SectionLabel>Scoring Granularity</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          {stats.granularityData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stats.granularityData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    onClick={d.id ? () => onMember?.(d.id) : undefined}
                    onKeyDown={d.id ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMember?.(d.id) } } : undefined}
                    role={d.id ? 'button' : undefined}
                    tabIndex={d.id ? 0 : undefined}
                    style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text-muted)', fontSize: '13px', cursor: d.id ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name}
                  </span>
                  <span style={{
                    flexShrink: 0, fontFamily: "'DM Mono',monospace", fontSize: '12px',
                    color: d.color, background: 'rgba(var(--fg-rgb), 0.05)',
                    border: '1px solid rgba(var(--fg-rgb), 0.08)',
                    padding: '3px 10px', borderRadius: '999px',
                  }}>
                    {d.granularity.toFixed(2)}
                  </span>
                </div>
              ))}
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '4px 0 0' }}>
                Smallest score increment each member actually lands on (1 / 0.5 / 0.25 / 0.1 / 0.01).
              </p>
            </div>
          ) : (
            <ChartPlaceholder>Need at least 2 scores per member.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Per-member scoring variation (std dev) */}
      <div>
        <SectionLabel>Scoring Variation · Std Dev</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.stdDevData.length > 0 ? (
            <ComparisonBar
              data={stats.stdDevData}
              keys={[{ key: 'value', name: 'Std dev' }]}
              layout="vertical"
              cellFill="_fill"
              /* Auto-scale to the data so member differences are visible — a fixed
                 0–10 axis flattens std devs that are usually well under 2. */
              domain={[0, Math.max(0.5, Math.max(...stats.stdDevData.map(d => d.value)) * 1.2)]}
              /* Round the long std-dev x-axis labels to 2 decimals. */
              valueTickFormatter={(v) => Number(v).toFixed(2)}
              memberIds={stats.stdDevData.map(d => d.id)}
              onMember={onMember}
              height={Math.max(120, stats.stdDevData.length * 30 + 20)}
            />
          ) : (
            <ChartPlaceholder>Need at least 2 scores per member.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Per-movie score spread (stddev across members) */}
      <div>
        <SectionLabel>Per-Film Score Spread</SectionLabel>
        <GlassCard style={{ padding: '4px 0' }}>
          {stats.perMovieStats.length > 0 ? (
            (() => {
              const list = spreadShowAll ? stats.perMovieStats : stats.perMovieStats.slice(0, 8)
              // σ colour is a continuous green→red gradient fitted to the actual
              // min/max spread across all films (green = most unanimous, red = most
              // divisive) — replaces the old fixed 0.6/1.5 buckets.
              const sds = stats.perMovieStats.map(m => m.sd).filter(v => v != null)
              const sdMin = sds.length ? Math.min(...sds) : 0
              const sdMax = sds.length ? Math.max(...sds) : 1
              const sdRange = (sdMax - sdMin) || 1
              const spreadColor = (sd) => {
                if (sd == null) return 'var(--text-dim)'
                const t = Math.max(0, Math.min(1, (sd - sdMin) / sdRange))
                return `hsl(${Math.round(130 * (1 - t))}, 70%, 58%)` // 130°=green → 0°=red
              }
              return list.map((m, i) => (
                <div
                  key={m.id}
                  onClick={m.movie ? () => onFilm?.(m.movie) : undefined}
                  onKeyDown={m.movie ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilm?.(m.movie) } } : undefined}
                  role={m.movie ? 'button' : undefined}
                  tabIndex={m.movie ? 0 : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 16px', cursor: m.movie ? 'pointer' : 'default',
                    borderBottom: i < list.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.04)' : 'none',
                  }}>
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                  </p>
                  <span style={{ flexShrink: 0, fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)' }}>
                    μ {fmt(m.mean)}
                  </span>
                  {/* σ colour: green→red gradient fitted to the film set's min/max spread. */}
                  <span style={{
                    flexShrink: 0, fontFamily: "'DM Mono',monospace", fontSize: '11px',
                    color: spreadColor(m.sd),
                    minWidth: '52px', textAlign: 'right',
                  }}>
                    σ {fmt(m.sd)}
                  </span>
                </div>
              ))
            })()
          ) : (
            <div style={{ padding: '16px' }}>
              <ChartPlaceholder height={70}>Need at least 2 member scores on a film.</ChartPlaceholder>
            </div>
          )}
        </GlassCard>
        {stats.perMovieStats.length > 0 && (
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '6px 2px 0' }}>
            σ = score spread across members · green = most unanimous → red = most divisive
          </p>
        )}
        {stats.perMovieStats.length > 8 && (
          <button
            onClick={() => setSpreadShowAll(v => !v)}
            style={{
              marginTop: '10px', width: '100%', padding: '10px', borderRadius: '10px',
              border: '1px solid rgba(var(--fg-rgb), 0.08)', background: 'transparent',
              color: 'var(--text-dim)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', cursor: 'pointer',
            }}
          >
            {spreadShowAll ? 'Show less' : `Show all ${stats.perMovieStats.length} films`}
          </button>
        )}
      </div>

      {/* Picker Power Rankings */}
      <div>
        <SectionLabel>Picker Power Rankings</SectionLabel>
        {stats.havePickerData && stats.pickerRankings.length > 0 ? (
          <GlassCard style={{ padding: '4px 0' }}>
            {stats.pickerRankings.map((p, i) => {
              const col = p._color || 'var(--accent)'
              return (
              <div
                key={p.id}
                onClick={p.id ? () => onMember?.(p.id) : undefined}
                onKeyDown={p.id ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMember?.(p.id) } } : undefined}
                role={p.id ? 'button' : undefined}
                tabIndex={p.id ? 0 : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '11px 16px', cursor: p.id ? 'pointer' : 'default',
                  borderBottom: i < stats.pickerRankings.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.04)' : 'none',
                }}>
                <span style={{ flexShrink: 0, width: '20px', textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", color: i === 0 ? col : 'var(--text-faint)', fontSize: '1.3rem' }}>
                  {i + 1}
                </span>
                <div style={{
                  flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%',
                  border: `1.5px solid ${col}`, background: 'rgba(var(--fg-rgb), 0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: col, fontSize: '12px', letterSpacing: '0.04em' }}>
                    {initials(p.name)}
                  </span>
                </div>
                <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name} <span style={{ color: 'var(--text-faint)', fontFamily: "'DM Mono',monospace", fontSize: '10px' }}>· {p.count} pick{p.count !== 1 ? 's' : ''}</span>
                </p>
                <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.4rem', letterSpacing: '0.04em' }}>
                  {fmt(p.avg)}
                </span>
              </div>
              )
            })}
          </GlassCard>
        ) : (
          <GlassCard style={{ padding: '16px' }}>
            {/* TODO: needs picked_by_user_id (revealed) to attribute films to pickers */}
            <ChartPlaceholder>Picker data not yet available.</ChartPlaceholder>
          </GlassCard>
        )}
      </div>

      {/* Avg Given vs Received vs Club */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <SectionLabel>Given vs. Received vs. Club Avg</SectionLabel>
          <InfoButton label="What do Given, Received and Club avg mean?">
            <strong style={{ color: 'var(--text-strong)' }}>Given</strong> = avg score this member gives others' films.<br />
            <strong style={{ color: 'var(--text-strong)' }}>Received</strong> = avg score this member's own picks get from everyone.<br />
            <strong style={{ color: 'var(--text-strong)' }}>Club avg</strong> = overall baseline across all scores.
          </InfoButton>
        </div>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.givenReceived.length > 0 ? (
            <ComparisonBar
              data={stats.givenReceived}
              keys={stats.havePickerData
                ? [
                    { key: 'given', name: 'Given', color: CHART_CATEGORICAL[0] },
                    { key: 'received', name: 'Received', color: CHART_CATEGORICAL[1] },
                    { key: 'club', name: 'Club avg', color: CHART_NEUTRAL },
                  ]
                : [
                    { key: 'given', name: 'Given', color: CHART_CATEGORICAL[0] },
                    { key: 'club', name: 'Club avg', color: CHART_NEUTRAL },
                  ]}
              layout="horizontal"
              labelKey="name"
              smartDomain
              height={210}
            />
          ) : (
            <ChartPlaceholder>No scores yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Per-member Score Spread box plot */}
      <div>
        <SectionLabel>Per-Member Score Spread</SectionLabel>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.memberBox.length > 0 ? (
            <BoxPlotChart data={stats.memberBox} />
          ) : (
            <ChartPlaceholder>Need at least 2 scores per member.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* All-time Score Percentile */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <SectionLabel>Score Percentile (Generosity)</SectionLabel>
          <InfoButton label="How is the generosity percentile calculated?">
            For each member we take their <strong style={{ color: 'var(--text-strong)' }}>average score</strong>, then rank those averages against each other. The percentile is where a member's average sits in that ranking — <strong style={{ color: 'var(--text-strong)' }}>100% = the most generous</strong> (highest average), <strong style={{ color: 'var(--text-strong)' }}>0% = the harshest</strong>. It answers "relative to the rest of the club, how high does this person score?"
          </InfoButton>
        </div>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.percentileData.length > 0 ? (
            <PercentileBar data={stats.percentileData} memberIds={stats.percentileData.map(d => d.id)} onMember={onMember} />
          ) : (
            <ChartPlaceholder>Not enough data yet.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Member Score Correlation Heatmap */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <SectionLabel>Taste Correlation</SectionLabel>
          <InfoButton label="How is taste correlation calculated?">
            For every pair of members we look at the films they've <strong style={{ color: 'var(--text-strong)' }}>both scored</strong> and compute the <strong style={{ color: 'var(--text-strong)' }}>Pearson correlation</strong> of their scores. <strong style={{ color: 'var(--text-strong)' }}>+1</strong> = identical taste (they move together), <strong style={{ color: 'var(--text-strong)' }}>0</strong> = unrelated, <strong style={{ color: 'var(--text-strong)' }}>−1</strong> = opposite taste. Brighter cells = stronger agreement.
          </InfoButton>
        </div>
        <GlassCard style={{ padding: '16px 12px' }}>
          {stats.corrNames.length >= 2 ? (
            <CorrelationHeatmap names={stats.corrNames} matrix={stats.corrMatrix} />
          ) : (
            <ChartPlaceholder>Need at least 2 members with overlapping scores.</ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Genre Blindspot Grid — members × genres heatmap of films each member
          PICKED per genre (their curation). Faint/red cells (0 picked) are a
          member's blindspot; intensity scales with picks in that genre. */}
      <div>
        <SectionLabel>Genre Blindspot Grid</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          {stats.hasBlindspotData ? (
            <GenreBlindspotGrid
              genres={stats.blindspotGenres}
              rows={stats.blindspotRows}
              max={stats.blindspotMax}
              onMember={onMember}
            />
          ) : (
            <ChartPlaceholder>
              {stats.hasAnyGenreData === false ? 'Run genre backfill in Admin to see this chart.' : 'No genre data yet.'}
            </ChartPlaceholder>
          )}
        </GlassCard>
      </div>

      {/* Most Active Scorer */}
      <div>
        <SectionLabel>Most Active Scorer</SectionLabel>
        {stats.mostActiveUser ? (
          <GlassCard
            onClick={() => onMember?.(stats.mostActiveUser.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', cursor: 'pointer' }}
          >
            <div style={{
              flexShrink: 0,
              width: '44px', height: '44px',
              borderRadius: '50%',
              border: `2px solid ${userColor(stats.mostActiveUser) || 'var(--accent)'}`,
              background: 'rgba(var(--fg-rgb), 0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: userColor(stats.mostActiveUser) || 'var(--accent)', fontSize: '15px', letterSpacing: '0.04em' }}>
                {initials(stats.mostActiveUser.name)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, color: 'var(--text-strong)', fontSize: '15px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stats.mostActiveUser.name}
              </p>
              <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '11px', margin: 0 }}>
                most scores submitted
              </p>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: userColor(stats.mostActiveUser) || 'var(--accent)', fontSize: '2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.mostActiveCount}
              </p>
              <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '2px 0 0' }}>
                scores
              </p>
            </div>
          </GlassCard>
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>No scores yet.</p>
        )}
      </div>

      {/* Scoring Streaks */}
      <div>
        <SectionLabel>Scoring Streaks</SectionLabel>
        <GlassCard style={{ padding: '4px 0' }}>
          {stats.activeUsers.map((u, i) => {
            const streak = stats.streaks[u.id] || 0
            const col = userColor(u) || 'var(--accent)'
            return (
              <div
                key={u.id}
                onClick={() => onMember?.(u.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMember?.(u.id) } }}
                role="button"
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '11px 16px', cursor: 'pointer',
                  borderBottom: i < stats.activeUsers.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.04)' : 'none',
                }}>
                <div style={{
                  flexShrink: 0,
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  border: `1.5px solid ${col}`,
                  background: 'rgba(var(--fg-rgb), 0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: col, fontSize: '12px', letterSpacing: '0.04em' }}>
                    {initials(u.name)}
                  </span>
                </div>
                <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name}
                </p>
                <div style={{
                  flexShrink: 0,
                  background: streak > 0 ? 'rgba(var(--accent-rgb,220,38,38),0.15)' : 'rgba(var(--fg-rgb), 0.04)',
                  border: streak > 0 ? '1px solid rgba(var(--fg-rgb), 0.12)' : '1px solid transparent',
                  borderRadius: '999px',
                  padding: '3px 10px',
                }}>
                  <span style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: streak > 0 ? 'var(--accent)' : 'var(--hairline)',
                    fontWeight: 500,
                  }}>
                    {streak} mo
                  </span>
                </div>
              </div>
            )
          })}
        </GlassCard>
      </div>

      {/* Genres — single genre visualization (Genre Breakdown duplicate removed) */}
      <div>
        <SectionLabel>Genres</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          {stats.topGenres.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
              {stats.hasAnyGenreData === false ? 'Run genre backfill in Admin to see this chart.' : 'No genre data yet.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stats.topGenres.map(([genre, count]) => {
                const pct = (count / maxGenreCount) * 100
                return (
                  <div
                    key={genre}
                    onClick={onGenre ? () => onGenre(genre) : undefined}
                    onKeyDown={onGenre ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGenre(genre) } } : undefined}
                    role={onGenre ? 'button' : undefined}
                    tabIndex={onGenre ? 0 : undefined}
                    title={onGenre ? `View ${genre} films` : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: onGenre ? 'pointer' : 'default' }}
                  >
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      width: '90px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {genre}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, height: '14px', background: 'rgba(var(--fg-rgb), 0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                        opacity: 0.75,
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'DM Mono',monospace",
                      fontSize: '10px',
                      color: 'var(--text-dim)',
                      flexShrink: 0,
                      width: '24px',
                      textAlign: 'right',
                    }}>
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Excitement vs Reality */}
      <div>
        <SectionLabel>Excitement vs. Reality</SectionLabel>
        <GlassCard style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#fbbf24', margin: '0 0 6px' }}>
                Avg Excitement
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: '#fbbf24', fontSize: '2.8rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.avgExcitement != null ? fmt(stats.avgExcitement) : '—'}
              </p>
            </div>
            <div style={{ width: '1px', background: 'rgba(var(--fg-rgb), 0.07)', flexShrink: 0 }} />
            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', margin: '0 0 6px' }}>
                Avg Final Score
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.8rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.avgFinal != null ? fmt(stats.avgFinal) : '—'}
              </p>
            </div>
          </div>
          {stats.avgExcitement != null && stats.avgFinal != null && (
            <p style={{
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '12px',
              color: 'var(--text-dim)',
              textAlign: 'center',
              margin: '14px 0 0',
            }}>
              {stats.avgExcitement > stats.avgFinal
                ? 'We tend to over-hype films before watching.'
                : stats.avgExcitement < stats.avgFinal
                  ? 'Films tend to exceed expectations.'
                  : 'Excitement and scores are perfectly aligned.'}
            </p>
          )}
        </GlassCard>
      </div>

      {/* Connection Web · 6 Degrees — films linked by a shared actor/director */}
      <ConnectionWeb movies={connectionMovies} onFilm={onFilm} />

    </div>
  )
}

// ─── Head to Head Tab ────────────────────────────────────────────────────────

// Member selector for the Head-to-Head tab. Hoisted to module scope so it isn't
// recreated on each render (which would lose the <select> focus). The member
// list it previously closed over is now threaded in as the `activeUsers` prop.
function MemberPill({ activeUsers, selected, onSelect, exclude }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <select
        value={selected?.id ?? ''}
        onChange={e => {
          const u = activeUsers.find(u => u.id === e.target.value)
          if (u) onSelect(u)
        }}
        style={{
          width: '100%',
          appearance: 'none',
          background: 'rgba(var(--fg-rgb), 0.06)',
          border: '1px solid rgba(var(--fg-rgb), 0.1)',
          borderRadius: '10px',
          padding: '10px 36px 10px 14px',
          fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--text-strong)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {activeUsers
          .filter(u => u.id !== exclude?.id)
          .map(u => (
            <option key={u.id} value={u.id} style={{ background: 'var(--bg-2)', color: 'var(--text-strong)' }}>
              {u.name}
            </option>
          ))}
      </select>
      <span style={{
        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-dim)', pointerEvents: 'none', fontSize: '11px',
      }}>
        ▾
      </span>
    </div>
  )
}

function HeadToHeadTab({ movies, ratings, users, loading, onFilm }) {
  const activeUsers = useMemo(
    () => users.filter(u => u.is_active !== false),
    [users],
  )

  // Default to first two admins (Ryan Miller + Ryan Bey)
  const defaultA = useMemo(() => {
    const admins = activeUsers.filter(u => u.role === 'admin')
    return admins[0] ?? activeUsers[0] ?? null
  }, [activeUsers])

  const defaultB = useMemo(() => {
    const admins = activeUsers.filter(u => u.role === 'admin')
    return admins[1] ?? activeUsers[1] ?? null
  }, [activeUsers])

  const [userA, setUserA] = useState(null)
  const [userB, setUserB] = useState(null)
  const [showRecordHelp, setShowRecordHelp] = useState(false)

  // Set defaults once users load
  useEffect(() => {
    if (defaultA && !userA) setUserA(defaultA)
  }, [defaultA])
  useEffect(() => {
    if (defaultB && !userB) setUserB(defaultB)
  }, [defaultB])

  const movieMap = useMemo(() => {
    const map = {}
    for (const m of movies) map[m.id] = m
    return map
  }, [movies])

  const h2h = useMemo(() => {
    if (!userA || !userB) return null
    const ratingsA = ratings.filter(r => r.user_id === userA.id && r.score != null)
    const ratingsB = ratings.filter(r => r.user_id === userB.id && r.score != null)
    const { avg: agreementAvg, count } = calcAgreementScore(ratingsA, ratingsB)
    const record = calcHeadToHeadRecord(ratingsA, ratingsB)

    const avgA = avg(ratingsA.map(r => Number(r.score)))
    const avgB = avg(ratingsB.map(r => Number(r.score)))

    // Films sorted by diff
    const filmsWithMovies = record.films
      .map(f => ({ ...f, movie: movieMap[f.movie_id] }))
      .filter(f => f.movie)

    const mostAgreed = filmsWithMovies.slice(0, 3)
    const mostDisagreed = [...filmsWithMovies].sort((a, b) => b.diff - a.diff).slice(0, 3)

    // Per-film signed delta (A − B) for the delta chart. Sorted by movie title
    // truncated; show up to 18 most-divergent so the chart stays readable.
    const deltaData = [...filmsWithMovies]
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 18)
      .map(f => ({
        name: f.movie.title.length > 18 ? f.movie.title.slice(0, 17) + '…' : f.movie.title,
        delta: Number((f.scoreA - f.scoreB).toFixed(2)),
      }))

    // Pearson correlation of their shared scores.
    const corrA = [], corrB = []
    for (const f of record.films) { corrA.push(f.scoreA); corrB.push(f.scoreB) }
    const correlation = corrA.length >= 3 ? pearson(corrA, corrB) : null

    return {
      agreementAvg,
      sharedCount: count,
      record,
      avgA,
      avgB,
      mostAgreed,
      mostDisagreed,
      deltaData,
      correlation,
    }
  }, [userA, userB, ratings, movieMap])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton style={{ height: '56px' }} />
        <Skeleton style={{ height: '100px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '80px' }} />
      </div>
    )
  }

  if (activeUsers.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
        Need at least 2 members.
      </div>
    )
  }

  // Disambiguated labels — there are two Ryans, so a bare first name ("Ryan vs
  // Ryan") is ambiguous. firstLast() → "Ryan M." / "Ryan B." everywhere.
  const nameA = userA ? firstLast(userA.name) : '—'
  const nameB = userB ? firstLast(userB.name) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Member selectors — the middle button swaps left/right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MemberPill activeUsers={activeUsers} selected={userA} onSelect={setUserA} exclude={userB} />
        <button
          type="button"
          onClick={() => { const a = userA; setUserA(userB); setUserB(a) }}
          title="Swap sides"
          aria-label="Swap the two members"
          style={{
            flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%',
            border: '1px solid rgba(var(--fg-rgb),0.14)', background: 'rgba(var(--fg-rgb),0.04)',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ⇄
        </button>
        <MemberPill activeUsers={activeUsers} selected={userB} onSelect={setUserB} exclude={userA} />
      </div>

      {(!h2h || h2h.sharedCount < 3) ? (
        <GlassCard style={{ padding: '28px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px', margin: 0 }}>
            {h2h && h2h.sharedCount > 0
              ? `Only ${h2h.sharedCount} shared score${h2h.sharedCount !== 1 ? 's' : ''} — not enough yet.`
              : 'Not enough shared scores yet.'}
          </p>
        </GlassCard>
      ) : (
        <>
          {/* Agreement score */}
          <div>
            <SectionLabel>Avg Disagreement</SectionLabel>
            <GlassCard style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 2px' }}>
                  Avg |score A − score B| across {h2h.sharedCount} shared films
                </p>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--hairline)', margin: 0 }}>
                  Lower = more aligned
                </p>
              </div>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0, flexShrink: 0 }}>
                {fmt(h2h.agreementAvg)}
              </p>
            </GlassCard>
          </div>

          {/* Who scores higher */}
          <div>
            <SectionLabel>Scoring Comparison</SectionLabel>
            <GlassCard style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameA}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {fmt(h2h.avgA)}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'center', paddingBottom: '4px' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--hairline)' }}>avg</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hairline)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameB}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {fmt(h2h.avgB)}
                  </p>
                </div>
              </div>
              {h2h.avgA != null && h2h.avgB != null && (
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: 'var(--text-dim)', margin: 0, textAlign: 'center' }}>
                  {Math.abs(h2h.avgA - h2h.avgB) < 0.005
                    ? 'Identical average scores.'
                    : h2h.avgA > h2h.avgB
                      ? `${nameA} scores higher on average.`
                      : `${nameB} scores higher on average.`}
                </p>
              )}
            </GlassCard>
          </div>

          {/* Head to head record */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
              <SectionLabel style={{ margin: 0 }}>Head to Head Record</SectionLabel>
              <button
                onClick={() => setShowRecordHelp(v => !v)}
                aria-label="What does this mean?"
                aria-expanded={showRecordHelp}
                style={{
                  flexShrink: 0, width: '16px', height: '16px', borderRadius: '50%',
                  border: '1px solid rgba(var(--fg-rgb),0.25)', background: showRecordHelp ? 'var(--accent)' : 'transparent',
                  color: showRecordHelp ? 'var(--text-strong)' : 'var(--text-dim)',
                  fontFamily: "'DM Mono',monospace", fontSize: '10px', lineHeight: 1, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                ?
              </button>
            </div>
            {showRecordHelp && (
              <div style={{
                marginBottom: '10px', padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)',
              }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Across the <strong>{h2h.record.films.length}</strong> film{h2h.record.films.length === 1 ? '' : 's'} {nameA} and {nameB} have both scored, this counts who scored each film higher.
                  Each name's number is how many films they rated above the other; <strong>Ties</strong> are films they scored within 0.01 of each other.
                  It's a head-to-head tally of whose score was higher film-by-film — not a sum of points.
                </p>
              </div>
            )}
            <GlassCard style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hairline)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameA}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.winsA}
                  </p>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hairline)', margin: '0 0 4px' }}>
                    Ties
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-dim)', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.ties}
                  </p>
                </div>
                <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hairline)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameB}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.winsB}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Score correlation */}
          {h2h.correlation != null && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <SectionLabel>Taste Correlation</SectionLabel>
                <InfoButton label="What is the Pearson correlation?">
                  Of the films <strong style={{ color: 'var(--text-strong)' }}>both</strong> {nameA} and {nameB} scored, this is the <strong style={{ color: 'var(--text-strong)' }}>Pearson correlation</strong> of their scores: do they tend to rate the same films high and low? <strong style={{ color: 'var(--text-strong)' }}>+1.00</strong> = move in perfect lockstep, <strong style={{ color: 'var(--text-strong)' }}>0</strong> = no relationship, <strong style={{ color: 'var(--text-strong)' }}>−1.00</strong> = perfectly opposite. It measures the <em>pattern</em> of agreement, not whether one scores higher overall.
                </InfoButton>
              </div>
              <GlassCard style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                  Pearson correlation over {h2h.sharedCount} shared films
                </p>
                <p style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  color: h2h.correlation >= 0 ? '#34d399' : '#f87171',
                  fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0, flexShrink: 0,
                }}>
                  {h2h.correlation >= 0 ? '+' : ''}{fmt(h2h.correlation)}
                </p>
              </GlassCard>
            </div>
          )}

          {/* Per-film score delta */}
          <div>
            <SectionLabel>Score Delta Per Film ({nameA} − {nameB})</SectionLabel>
            <GlassCard style={{ padding: '16px 12px' }}>
              <ResponsiveContainer width="100%" height={Math.max(160, h2h.deltaData.length * 22 + 30)}>
                <BarChart data={h2h.deltaData} layout="vertical" margin={{ top: 6, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" domain={[-10, 10]} tick={{ fontSize: 9, fill: CHART.axis, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <ReferenceLine x={0} stroke={CHART.muted} />
                  <Bar dataKey="delta" name="Δ" radius={[0, 3, 3, 0]}>
                    {h2h.deltaData.map((d, i) => (
                      <Cell key={i} fill={d.delta >= 0 ? accentColor() : 'var(--text-dim)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--hairline)', margin: '8px 0 0', textAlign: 'center' }}>
                Bars right = {nameA} scored higher · left = {nameB} scored higher
              </p>
            </GlassCard>
          </div>

          {/* Most agreed on */}
          <div>
            <SectionLabel>Most Agreed On</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {h2h.mostAgreed.map(f => (
                <GlassCard key={f.movie_id} onClick={() => onFilm?.(f.movie)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)', fontWeight: 500, fontSize: '13px', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.movie.title}
                    </p>
                    <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', margin: 0 }}>
                      {fmt(f.scoreA)} vs {fmt(f.scoreB)}
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.1)',
                    padding: '3px 8px',
                    borderRadius: '999px',
                  }}>
                    Δ {fmt(f.diff)}
                  </span>
                </GlassCard>
              ))}
            </div>
          </div>

          {/* Most disagreed on */}
          <div>
            <SectionLabel>Most Disagreed On</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {h2h.mostDisagreed.map(f => (
                <GlassCard key={f.movie_id} onClick={() => onFilm?.(f.movie)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)', fontWeight: 500, fontSize: '13px', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.movie.title}
                    </p>
                    <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', margin: 0 }}>
                      {fmt(f.scoreA)} vs {fmt(f.scoreB)}
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: '#f87171',
                    background: 'rgba(248,113,113,0.1)',
                    padding: '3px 8px',
                    borderRadius: '999px',
                  }}>
                    Δ {fmt(f.diff)}
                  </span>
                </GlassCard>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Overview', 'Me', 'Members', 'Club', 'Head to Head']

export default function Stats() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Deep-link query params (matched case-insensitively):
  //   ?tab=<name>                 → open that tab (e.g. Home's "all caught up")
  //   ?tab=members&memberId=<id>  → Members tab focused on a member (legacy)
  //   ?member=<id>                → that member's full Me-style stats breakdown
  const parseQuery = (search) => {
    const q = new URLSearchParams(search)
    const t = q.get('tab')
    const tab = TABS.find(x => x.toLowerCase() === (t ?? '').toLowerCase()) ?? 'Overview'
    const memberId = q.get('memberId')
    const member = q.get('member')
    return { tab: memberId ? 'Members' : tab, memberId: memberId || null, member: member || null }
  }
  const initialQuery = parseQuery(window.location.search)
  const [activeTab, setActiveTab] = useState(initialQuery.tab)
  // One-shot focus target consumed by MembersTab (expand + scroll), then cleared.
  const [focusMemberId, setFocusMemberId] = useState(initialQuery.memberId)
  // When set (and not the signed-in user), Stats shows that member's full
  // Me-tab-style breakdown in place of the tab bar.
  const [viewMemberId, setViewMemberId] = useState(initialQuery.member)
  const [viewMemberGuesses, setViewMemberGuesses] = useState([])
  const [selectedMovie, setSelectedMovie] = useState(null)

  // Re-sync from the URL on every navigation so the links work even when Stats
  // is already mounted (React Router updates location.search without remounting,
  // which the old mount-only read missed → "stays on the last location").
  useEffect(() => {
    const q = parseQuery(location.search)
    setViewMemberId(q.member)
    if (!q.member) {
      if (q.memberId) { setActiveTab('Members'); setFocusMemberId(q.memberId) }
      else setActiveTab(q.tab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  // Load the viewed member's picker guesses (for their guess-accuracy stat).
  // RLS may scope this to revealed films; an empty result degrades cleanly.
  useEffect(() => {
    if (!viewMemberId || viewMemberId === profile?.id) { setViewMemberGuesses([]); return }
    let cancelled = false
    supabase
      .from('picker_guesses')
      .select('movie_id, guessed_user_id')
      .eq('guessing_user_id', viewMemberId)
      .then(({ data }) => { if (!cancelled) setViewMemberGuesses(data ?? []) })
    return () => { cancelled = true }
  }, [viewMemberId, profile?.id])

  // Spec: films are clickable everywhere in Stats (open the film overlay) and
  // member names navigate to that member's profile.
  const onFilm = useCallback((movie) => { if (movie) setSelectedMovie(movie) }, [])
  const { openMember } = useMemberOverlay()
  const { openStats: onFullStats } = useMemberStatsOverlay()
  const onMember = useCallback((userId) => { if (userId) openMember(userId) }, [openMember])
  // Genre deep-link → Films page filtered by that genre.
  const onGenre = useCallback((g) => {
    if (g) navigate('/films?tab=All Films&genre=' + encodeURIComponent(g))
  }, [navigate])

  const TEST_USER_EMAIL = 'i.am.ryan.the.miller@gmail.com'

  // Shared data
  const [movies, setMovies] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [users, setUsers] = useState([])
  const [myRatings, setMyRatings] = useState([])
  const [myGuesses, setMyGuesses] = useState([]) // current user's picker_guesses
  const [monthsById, setMonthsById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      setLoading(true)
      const [
        { data: moviesData },
        { data: ratingsData },
        { data: usersData },
        { data: myRatingsData },
        { data: monthsData },
        { data: myGuessesData },
      ] = await Promise.all([
        supabase
          .from('movies_safe')
          .select('id, month_id, title, tmdb_id, poster_url, year_released, director, tmdb_cast, tmdb_writers, genre, scores_revealed, picker_revealed, picked_by_user_id, historical_avg_score, runtime_minutes'),
        supabase
          .from('ratings')
          .select('id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at'),
        supabase
          .from('users')
          .select('id, name, email, role, joined_at, is_active, user_color')
          .eq('is_active', true),
        supabase
          .from('ratings')
          .select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
          .eq('user_id', profile.id),
        supabase
          .from('months')
          .select('id, month_year, status'),
        supabase
          .from('picker_guesses')
          .select('movie_id, guessed_user_id')
          .eq('guessing_user_id', profile.id),
      ])

      // Build month lookup
      const mById = {}
      for (const m of (monthsData ?? [])) mById[m.id] = m

      // Exclude test user
      const filteredUsers = (usersData ?? []).filter(u => u.email !== TEST_USER_EMAIL)
      const testUserId = (usersData ?? []).find(u => u.email === TEST_USER_EMAIL)?.id ?? null

      // Lookups for the Zack pre-April exclusion: movie -> month_year, user -> name
      const movieMonthYear = {}
      for (const m of (moviesData ?? [])) {
        movieMonthYear[m.id] = mById[m.month_id]?.month_year ?? null
      }
      const userName = {}
      for (const u of (usersData ?? [])) userName[u.id] = u.name

      // Filter shared ratings: drop the test account everywhere, and drop Zack's
      // scores on Jan/Feb/Mar 2026 films (he joined April 2026).
      const cleanRatings = (ratingsData ?? []).filter(r => {
        if (testUserId && r.user_id === testUserId) return false
        if (isZackPreApril(userName[r.user_id], movieMonthYear[r.movie_id])) return false
        return true
      })

      setMovies(moviesData ?? [])
      setAllRatings(cleanRatings)
      setUsers(filteredUsers)
      setMyRatings(myRatingsData ?? [])
      setMyGuesses(myGuessesData ?? [])
      setMonthsById(mById)
      setLoading(false)
    }
    load()
  }, [profile])

  // The viewed member's own ratings, sliced from the shared (already test/Zack-
  // filtered) set — no extra fetch needed since allRatings carries user_id.
  const viewedRatings = useMemo(
    () => (viewMemberId && profile && viewMemberId !== profile.id)
      ? allRatings.filter(r => r.user_id === viewMemberId)
      : [],
    [viewMemberId, profile, allRatings],
  )

  // Rolling visibility: the signed-in viewer's set of films they've scored. Score
  // stats only ever include films they can SEE (revealed, or scored by them); the
  // existence-only visuals (genre mix, connection web) use _exists (not upcoming).
  const myScoredIds = useMemo(
    () => new Set(myRatings.filter(r => r.score != null).map(r => r.movie_id)),
    [myRatings],
  )
  const viewMovies = useMemo(
    () => movies.map(m => ({
      ...m,
      _canSee: !!(m.scores_revealed || myScoredIds.has(m.id)),
      _exists: (monthsById[m.month_id]?.status ?? 'upcoming') !== 'upcoming',
    })),
    [movies, myScoredIds, monthsById],
  )
  // Any active-month film the viewer hasn't scored yet → stats are still partial.
  const hasUnseenActive = useMemo(
    () => viewMovies.some(m => m._exists && !m.scores_revealed && !myScoredIds.has(m.id)),
    [viewMovies, myScoredIds],
  )

  // Plain (non-hook) derivations for render.
  const isViewingOther = !!viewMemberId && !!profile && viewMemberId !== profile.id
  const viewedMember = isViewingOther ? users.find(u => u.id === viewMemberId) : null
  const viewedFirstName = viewedMember?.name?.split(' ')[0] || ''

  return (
    <div style={{
      background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
      fontFamily: "'DM Sans',sans-serif",
      minHeight: '100vh',
      paddingBottom: '6rem',
      width: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', animation: 'fadeUp 0.45s ease both' }}>
          <p style={{
            fontFamily: "'DM Mono',monospace",
            color: 'var(--hairline)',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            margin: '0 0 4px',
          }}>
            Movie Club
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: '2.6rem',
            color: 'var(--text-strong)',
            lineHeight: 1,
            margin: 0,
            letterSpacing: '0.03em',
          }}>
            Stats
          </h1>
        </div>

        {isViewingOther ? (
          <div style={{ animation: 'fadeUp 0.3s ease both' }}>
            {/* Viewing-member banner + back affordance. Renders that member's full
                Me-tab breakdown (not the limited Members card). */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '12px', marginBottom: '20px', padding: '12px 14px',
              borderRadius: '12px', background: 'rgba(var(--fg-rgb), 0.04)',
              border: '1px solid rgba(var(--fg-rgb), 0.07)',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--hairline)', margin: '0 0 3px' }}>
                  Viewing member
                </p>
                <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.5rem', letterSpacing: '0.03em', color: 'var(--text-strong)', margin: 0, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewedMember ? `${viewedFirstName}'s Stats` : 'Member Stats'}
                </p>
              </div>
              <button
                onClick={() => navigate('/stats?tab=me')}
                style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '9px', border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'transparent', color: 'var(--text-muted)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ← Back to my stats
              </button>
            </div>
            <MeTab
              movies={viewMovies}
              ratings={viewedRatings}
              allRatings={allRatings}
              guesses={viewMemberGuesses}
              loading={loading}
              monthsById={monthsById}
              onFilm={onFilm}
              onGenre={onGenre}
              subject={{ name: viewedFirstName || 'They', possessive: viewedFirstName ? `${viewedFirstName}'s` : 'Their' }}
            />
          </div>
        ) : (
        <>
        {/* Tab Bar */}
        <div style={{
          display: 'flex', gap: '4px',
          background: 'rgba(var(--fg-rgb), 0.04)',
          border: '1px solid rgba(var(--fg-rgb), 0.07)',
          borderRadius: '12px', padding: '4px',
          marginBottom: '24px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              // Push the tab into the URL so Back returns to the previous tab; the
              // location-sync effect mirrors it back into activeTab.
              onClick={() => { setActiveTab(tab); navigate('/stats?tab=' + encodeURIComponent(tab)) }}
              style={{
                flexShrink: 0,
                padding: '8px 12px',
                borderRadius: '9px', border: 'none',
                background: activeTab === tab ? 'rgba(var(--fg-rgb), 0.09)' : 'transparent',
                color: activeTab === tab ? 'var(--text-strong)' : 'var(--text-faint)',
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Stats are personalised: they only include films you can see scores for.
            Flag it while this month's films are still partially unscored by you. */}
        {!loading && hasUnseenActive && !isViewingOther && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 12px', marginBottom: '16px', borderRadius: '10px',
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)',
            fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <span style={{ fontSize: '13px' }}>👁</span>
            <span>Stats are based on the scores visible to you — score the remaining films this month to update them.</span>
          </div>
        )}

        {/* Tab content */}
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          {activeTab === 'Overview' && (
            <OverviewTab
              movies={viewMovies}
              ratings={allRatings}
              users={users}
              loading={loading}
              onFilm={onFilm}
              onMember={onMember}
            />
          )}
          {activeTab === 'Me' && (
            <MeTab
              movies={viewMovies}
              ratings={myRatings}
              allRatings={allRatings}
              guesses={myGuesses}
              loading={loading}
              monthsById={monthsById}
              onFilm={onFilm}
              onGenre={onGenre}
            />
          )}
          {activeTab === 'Members' && (
            <MembersTab
              movies={viewMovies}
              ratings={allRatings}
              users={users}
              loading={loading}
              monthsById={monthsById}
              onMember={onMember}
              onFilm={onFilm}
              onFullStats={onFullStats}
              focusMemberId={focusMemberId}
              onFocusConsumed={() => setFocusMemberId(null)}
            />
          )}
          {activeTab === 'Club' && (
            <ClubTab
              movies={viewMovies}
              ratings={allRatings}
              users={users}
              loading={loading}
              monthsById={monthsById}
              onFilm={onFilm}
              onMember={onMember}
              onGenre={onGenre}
            />
          )}
          {activeTab === 'Head to Head' && (
            <HeadToHeadTab
              movies={viewMovies}
              ratings={allRatings}
              users={users}
              loading={loading}
              monthsById={monthsById}
              onFilm={onFilm}
            />
          )}
        </div>
        </>
        )}
      </div>

      {/* Film detail overlay — opened by clicking any film card in Stats */}
      <FilmDetailOverlay movie={selectedMovie} onClose={() => setSelectedMovie(null)} />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        /* Kill the stray "bounding box" Recharts draws on hover/keyboard-focus:
           the SVG surface, its wrappers, and individual sectors/bars/dots all
           receive a browser focus outline that reads as a rectangle around the
           whole graph. We never want that — only the hovered datum should react. */
        .recharts-wrapper:focus,
        .recharts-wrapper *:focus,
        .recharts-surface:focus,
        .recharts-surface *:focus,
        .recharts-sector:focus,
        .recharts-layer:focus,
        .recharts-bar-rectangle:focus,
        .recharts-dot:focus,
        .recharts-pie *:focus {
          outline: none !important;
        }
        .recharts-wrapper, .recharts-surface { outline: none !important; }
      `}</style>
    </div>
  )
}
