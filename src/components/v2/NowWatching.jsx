// WATCHING phase: the one film the club is watching right now. Submitting your score IS
// "I've watched it" (B4); the film reveals itself the moment the last member scores (B7).

import ProgressRoster from './ProgressRoster'
import { formatScore, genreText, providerGroups } from './thisMonthHelpers'
import { Button, Card, MONO, Poster, SANS, SectionLabel, DISPLAY } from './thisMonthUi'

/**
 * @param {object}   props
 * @param {object}   props.film          movies_safe row (state.currentFilm)
 * @param {number}   props.filmNumber    1-based position in the month (state.films order)
 * @param {object}   [props.myRating]    the viewer's ratings row (state.myRating)
 * @param {object[]} props.filmProgress  v2_film_progress rows
 * @param {(opts:{skipExcitement:boolean}) => void} props.onScore
 * @param {() => void} [props.onOpenFilm]
 */
export default function NowWatching({ film, filmNumber, myRating, filmProgress = [], users = [], profileId, onScore, onOpenFilm }) {
  const scored = myRating?.score != null
  const excitement = myRating?.pre_watch_excitement
  const { groups, link } = providerGroups(film.streaming_providers)
  const meta = [film.year_released, film.director, film.runtime_minutes ? `${film.runtime_minutes} min` : null].filter(Boolean)
  const genre = genreText(film.genre)
  const others = filmProgress.filter(p => p.user_id !== profileId && !p.absent)
  const othersLeft = others.filter(p => !p.has_scored).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <section aria-labelledby="v2-now-watching">
        <SectionLabel id="v2-now-watching">Now watching · Film {filmNumber} this month</SectionLabel>

        <Card style={{ overflow: 'hidden', padding: 0 }}>
          {/* Backdrop wash from the poster — decorative only */}
          <div style={{ position: 'relative', padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(160deg, rgba(var(--accent-rgb),0.16) 0%, rgba(var(--accent-rgb),0.02) 60%, transparent 100%)',
            }} />
            <button
              type="button"
              onClick={onOpenFilm}
              disabled={!onOpenFilm}
              aria-label={`Open ${film.title} — details and discussion`}
              style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: onOpenFilm ? 'pointer' : 'default', borderRadius: '12px' }}
            >
              <Poster path={film.poster_url} title={film.title} width={112} size="w342" style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }} />
            </button>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <h2 style={{ fontFamily: DISPLAY, color: 'var(--text-strong)', fontSize: '2rem', lineHeight: 0.95, letterSpacing: '0.02em', margin: '0 0 6px', overflowWrap: 'anywhere' }}>
                {film.title}
              </h2>
              {meta.length > 0 && (
                <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: '0 0 4px' }}>{meta.join(' · ')}</p>
              )}
              {genre && <p style={{ fontFamily: MONO, color: 'var(--hairline)', fontSize: '10px', margin: 0 }}>{genre}</p>}
            </div>
          </div>

          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {film.plot_summary && (
              <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{film.plot_summary}</p>
            )}

            {groups.length > 0 && (
              <div>
                <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px' }}>
                  Where to watch
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {groups.map(g => (
                    <div key={g.label} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', width: '42px' }}>{g.label}</span>
                      {g.names.map(n => {
                        const chip = { fontFamily: SANS, fontSize: '12px', color: 'var(--text)', padding: '3px 8px', borderRadius: '999px', background: 'rgba(var(--fg-rgb),0.06)', textDecoration: 'none' }
                        return link
                          ? <a key={n} href={link} target="_blank" rel="noopener noreferrer" style={chip}>{n}</a>
                          : <span key={n} style={chip}>{n}</span>
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scored ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.25)',
              }}>
                <div>
                  <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Your score</p>
                  <p style={{ fontFamily: DISPLAY, color: 'var(--accent-light)', fontSize: '2rem', lineHeight: 1, margin: '2px 0 0' }}>{formatScore(myRating.score)}</p>
                </div>
                <p style={{ flex: 1, fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                  {othersLeft > 0
                    ? `Thanks! Waiting on the others — ${othersLeft} still to score. Everything reveals the moment the last one's in.`
                    : 'Thanks! That should be everyone — the reveal is on its way.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Button size="lg" style={{ width: '100%' }} onClick={() => onScore({ skipExcitement: true })}>
                  I watched it — score it
                </Button>
                {excitement != null ? (
                  <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: 0, textAlign: 'center' }}>
                    Pre-watch excitement locked at {formatScore(excitement)}
                  </p>
                ) : (
                  <Button tone="ghost" size="sm" onClick={() => onScore({ skipExcitement: false })} style={{ alignSelf: 'center', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                    Haven't watched it yet? Rate your excitement
                  </Button>
                )}
              </div>
            )}

            {onOpenFilm && (
              <Button tone="secondary" size="sm" onClick={onOpenFilm} style={{ alignSelf: 'flex-start' }}>
                Details & discussion →
              </Button>
            )}
          </div>
        </Card>
      </section>

      <section aria-labelledby="v2-film-progress">
        <SectionLabel id="v2-film-progress">Who's watched it</SectionLabel>
        <ProgressRoster
          label="Watching progress"
          verb="scored"
          viewerId={profileId}
          users={users}
          entries={filmProgress.map(p => ({ user_id: p.user_id, name: p.name, done: !!p.has_scored, absent: !!p.absent }))}
        />
      </section>
    </div>
  )
}
