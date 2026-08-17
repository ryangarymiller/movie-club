import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Regression guard for a real production incident: the admin "Edit film" form
// wrote movies.overview and movies.runtime, but the table has plot_summary and
// runtime_minutes. Every save failed with
//   "Could not find the 'overview' column of 'movies' in the schema cache"
// This test scans the admin save path's column writes and asserts they all map
// to columns that actually exist on public.movies.
//
// COLUMN LIST is the authoritative public.movies schema, verified against the
// live database. If a migration adds/renames a movies column, update this set.
const MOVIES_COLUMNS = new Set([
  'id', 'month_id', 'title', 'tmdb_id', 'year_released', 'genre', 'director',
  'runtime_minutes', 'poster_url', 'plot_summary', 'streaming_providers',
  'picked_by_user_id', 'pick_justification', 'scores_revealed', 'picker_revealed',
  'scoring_deadline', 'historical_avg_score', 'created_at', 'tmdb_vote_average',
  'tmdb_vote_count', 'tmdb_popularity', 'tmdb_cast', 'tmdb_writers',
  'veto_resubmit_required',
])

// Vitest runs from the project root, so resolve the source relative to cwd
// (import.meta.url is not a file:// URL under Vite's transform).
const adminSrc = readFileSync(resolve(process.cwd(), 'src/pages/Admin.jsx'), 'utf8')

// Extract the body of a top-level `async function <name>(` up to the next
// top-level `async function` / `function ` declaration.
function functionBody(src, name) {
  const start = src.indexOf(`async function ${name}(`)
  if (start === -1) throw new Error(`function ${name} not found in Admin.jsx`)
  const after = src.slice(start + 10)
  const nextIdx = after.search(/\n\s*(async function|function )\s/)
  return nextIdx === -1 ? after : after.slice(0, nextIdx)
}

describe('admin film-edit save writes only real movies columns', () => {
  it('every `updates.<col>` in saveEdit is a real movies column', () => {
    const body = functionBody(adminSrc, 'saveEdit')
    const keys = [...body.matchAll(/\bupdates\.([a-zA-Z_]+)\s*=/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    const invalid = [...new Set(keys)].filter(k => !MOVIES_COLUMNS.has(k))
    expect(invalid).toEqual([])
  })

  it('the TMDB metadata backfill also writes only real movies columns', () => {
    const body = functionBody(adminSrc, 'backfillMetadata')
    const keys = [...body.matchAll(/\bupdates\.([a-zA-Z_]+)\s*=/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    const invalid = [...new Set(keys)].filter(k => !MOVIES_COLUMNS.has(k))
    expect(invalid).toEqual([])
  })

  it('never resurrects the removed overview / runtime column names for movies', () => {
    // The exact broken writes from the incident, guarded directly.
    expect(adminSrc).not.toMatch(/\bupdates\.overview\b/)
    expect(adminSrc).not.toMatch(/\bupdates\.runtime\s*=/)
    // And the correct columns must be present in the edit form's save path.
    expect(adminSrc).toMatch(/\bupdates\.plot_summary\b/)
    expect(adminSrc).toMatch(/\bupdates\.runtime_minutes\b/)
  })
})
