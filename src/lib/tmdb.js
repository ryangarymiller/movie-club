// Shared TMDB helpers. The pick (1.0) and submission (2.0) flows both enrich a film at
// selection time so it arrives in `movies` with Cast & Crew / Connection Web data already
// populated — `activate_month` (1.0) and `v2_materialize_submission` (2.0) copy this exact
// metadata shape into the movies row.

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

export async function tmdbFetch(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

export async function searchMovies(query) {
  const q = query.trim()
  if (!q) return []
  const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(q)}&include_adult=false`)
  return data?.results ?? []
}

/**
 * Full enrichment for one film. Returns the "selected" shape the pick flow uses
 * (tmdb_id, title, poster_path, year, director, runtime_minutes, genre, plot_summary,
 * streaming_providers, tmdb_cast, tmdb_writers, tmdb_vote_*) — degrading to the search
 * result's basics if TMDB detail calls fail.
 */
export async function enrichFilm(result) {
  try {
    const [detail, providersData] = await Promise.all([
      tmdbFetch(`/movie/${result.id}?append_to_response=credits`),
      tmdbFetch(`/movie/${result.id}/watch/providers`),
    ])
    const us = providersData?.results?.US ?? {}
    return {
      tmdb_id: detail.id,
      title: detail.title,
      poster_path: detail.poster_path,
      year: detail.release_date ? detail.release_date.slice(0, 4) : null,
      director: detail.credits?.crew?.find(c => c.job === 'Director')?.name ?? null,
      runtime_minutes: detail.runtime ?? null,
      genre: detail.genres?.map(g => g.name).join(', ') ?? null,
      plot_summary: detail.overview ?? null,
      streaming_providers: { flatrate: us.flatrate ?? [], rent: us.rent ?? [], buy: us.buy ?? [], link: us.link ?? null },
      tmdb_cast: (detail.credits?.cast ?? []).map(c => c.name).filter(Boolean),
      tmdb_writers: [...new Set((detail.credits?.crew ?? []).filter(c => c.department === 'Writing').map(c => c.name).filter(Boolean))],
      tmdb_vote_average: detail.vote_average ?? null,
      tmdb_vote_count: detail.vote_count ?? null,
      tmdb_popularity: detail.popularity ?? null,
    }
  } catch {
    return {
      tmdb_id: result.id,
      title: result.title,
      poster_path: result.poster_path,
      year: result.release_date ? result.release_date.slice(0, 4) : null,
      director: null, runtime_minutes: null, genre: null,
      plot_summary: result.overview ?? null, streaming_providers: null,
    }
  }
}

/** The metadata jsonb stored on upcoming_picks / submissions. */
export function metadataFor(selected, justification = null) {
  return {
    year: selected.year,
    director: selected.director,
    runtime_minutes: selected.runtime_minutes,
    genre: selected.genre,
    plot_summary: selected.plot_summary,
    streaming_providers: selected.streaming_providers,
    justification: justification?.trim() || null,
    tmdb_cast: selected.tmdb_cast ?? null,
    tmdb_writers: selected.tmdb_writers ?? null,
    tmdb_vote_average: selected.tmdb_vote_average ?? null,
    tmdb_vote_count: selected.tmdb_vote_count ?? null,
    tmdb_popularity: selected.tmdb_popularity ?? null,
  }
}

export const posterUrl = (path, size = 'w342') =>
  !path ? null : path.startsWith('http') ? path : `https://image.tmdb.org/t/p/${size}${path}`
