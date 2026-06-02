# streaming-fallback (Supabase Edge Function)

Fallback US streaming-availability lookup, used **only when TMDB returns no
providers** for a film. It calls the Anthropic Claude API server-side with the
**web search tool** to find where a film is currently streaming/rentable/buyable
in the US, and returns JSON in the same shape as TMDB's `/watch/providers` US
object so the existing client renderer (`StreamingSection` in
`src/pages/Films.jsx`) works unchanged.

## Security

- `ANTHROPIC_API_KEY` is read from `Deno.env.get("ANTHROPIC_API_KEY")` and lives
  **only** in this Edge Function. It is never logged, never returned, and never
  sent to the client.
- This is exactly the server-side fallback described in CLAUDE.md →
  "TMDB Integration" step 2.

## Request / Response contract

**Request body** (`POST`, JSON):

```json
{ "title": "City of God", "year": 2002, "tmdb_id": 598 }
```

- `title` — string (required; empty/missing title returns the empty result).
- `year` — number or null.
- `tmdb_id` — number or null.

**Response body** (`200`, JSON) — mirrors the TMDB `/watch/providers` US object:

```json
{
  "results": {
    "US": {
      "flatrate": [{ "provider_name": "Max" }],
      "rent": [{ "provider_name": "Apple TV" }],
      "buy": [{ "provider_name": "Amazon Video" }]
    }
  }
}
```

- `flatrate` = subscription, `rent` = rentable, `buy` = purchasable.
- `provider_name` is the only field provided. `logo_path` is intentionally
  omitted; the client renders a text chip when no `logo_path` is present.
- If nothing is found — or on **any** error (missing key, bad request, Anthropic
  failure, unexpected exception) — the function returns **HTTP 200** with all
  three arrays empty, so the client cleanly shows "No streaming availability found":

```json
{ "results": { "US": { "flatrate": [], "rent": [], "buy": [] } } }
```

## Files

- `index.ts` — handler (`Deno.serve`), Claude web-search call, robust parsing.
- `cors.ts` — shared CORS headers (handles `OPTIONS` preflight).
- `deno.json` — import map placeholder.

## Deploy

```bash
# Set the server-side secret (never committed, never client-exposed)
supabase secrets set ANTHROPIC_API_KEY=<key>

# Deploy the function
supabase functions deploy streaming-fallback
```

## Wiring the client (DO NOT apply here — for the parent to wire in Films.jsx)

In the streaming fetch logic, after TMDB returns no US providers, call this
function as the fallback:

```js
// `title`, `year`, `tmdb_id` come from the resolved movie record.
const { data, error } = await supabase.functions.invoke('streaming-fallback', {
  body: { title, year, tmdb_id },
})

if (!error && data?.results?.US) {
  const us = data.results.US
  const hasAny =
    (us.flatrate?.length ?? 0) > 0 ||
    (us.rent?.length ?? 0) > 0 ||
    (us.buy?.length ?? 0) > 0
  if (hasAny) {
    const providersData = { flatrate: us.flatrate, rent: us.rent, buy: us.buy }
    await supabase
      .from('movies')
      .update({ streaming_providers: providersData })
      .eq('id', resolvedMovie.id)
    resolvedMovie = { ...resolvedMovie, streaming_providers: providersData }
  }
}
```

`StreamingSection` reads `providers?.results?.US ?? providers?.US`, so caching
either the full `{ results: { US } }` object or the bare
`{ flatrate, rent, buy }` object both render correctly.
