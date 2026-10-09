// Compact strip of the films this month has already finished, with club averages.

import { formatScore } from './thisMonthHelpers'
import { MONO, Poster, SANS, SectionLabel } from './thisMonthUi'

export default function MonthSoFar({ films = [], avgs = {}, onOpenFilm, title = 'This month so far' }) {
  return (
    <section aria-labelledby="v2-month-so-far">
      <SectionLabel id="v2-month-so-far">{title}</SectionLabel>
      {films.length === 0 ? (
        <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>
          No films finished yet this month.
        </p>
      ) : (
        <ol style={{
          listStyle: 'none', margin: 0, padding: '2px 0 6px', display: 'flex', gap: '12px',
          overflowX: 'auto', scrollSnapType: 'x proximity',
        }}>
          {films.map((f, i) => {
            const a = avgs[f.id]
            return (
              <li key={f.id} style={{ flex: '0 0 auto', width: '84px', scrollSnapAlign: 'start' }}>
                <button
                  type="button"
                  onClick={() => onOpenFilm?.(f)}
                  aria-label={`Film ${i + 1}: ${f.title}${a ? `, club average ${formatScore(a.avg)}` : ''}`}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Poster path={f.poster_url} title={f.title} width={84} />
                    {a && (
                      <span style={{
                        position: 'absolute', bottom: '5px', right: '5px', padding: '2px 6px', borderRadius: '6px',
                        background: 'rgba(0,0,0,0.72)', color: '#fff', fontFamily: MONO, fontSize: '10px',
                      }}>
                        <span aria-hidden="true">👥 </span>{formatScore(a.avg)}
                      </span>
                    )}
                  </div>
                  <span style={{ display: 'block', fontFamily: SANS, color: 'var(--text-dim)', fontSize: '11px', lineHeight: 1.3, marginTop: '5px', overflowWrap: 'anywhere' }}>
                    {f.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
