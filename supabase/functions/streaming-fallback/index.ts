// supabase/functions/streaming-fallback/index.ts
//
// Fallback for US streaming-provider lookup when TMDB returns no providers.
// Calls the Anthropic Claude API server-side (with the web search tool) to find
// CURRENT US streaming availability for a film, and returns JSON shaped like the
// TMDB /watch/providers US object so the existing client renderer works unchanged.
//
// SECURITY: ANTHROPIC_API_KEY lives ONLY here (server-side). It is never logged,
// never returned, and never exposed to the client.

import { corsHeaders } from "./cors.ts";

// ── Contract types ──────────────────────────────────────────────────────────

interface RequestBody {
  title: string;
  year: number | null;
  tmdb_id: number | null;
}

interface Provider {
  provider_name: string;
}

interface UsProviders {
  flatrate: Provider[];
  rent: Provider[];
  buy: Provider[];
}

interface ResponseBody {
  results: { US: UsProviders };
}

const EMPTY_RESULT: ResponseBody = {
  results: { US: { flatrate: [], rent: [], buy: [] } },
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// ── Helpers ───────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dedupeProviders(items: unknown): Provider[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: Provider[] = [];
  for (const item of items) {
    let name: string | undefined;
    if (typeof item === "string") {
      name = item;
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const raw = obj.provider_name ?? obj.name ?? obj.provider;
      if (typeof raw === "string") name = raw;
    }
    if (!name) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider_name: trimmed });
  }
  return out;
}

// Extract the first balanced top-level JSON object from a string.
function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Pull all text segments out of an Anthropic Messages API content array.
function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text);
      }
    }
  }
  return parts.join("\n");
}

function parseProvidersFromText(text: string): UsProviders {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    return { flatrate: [], rent: [], buy: [] };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    flatrate: dedupeProviders(obj.flatrate ?? obj.stream ?? obj.subscription),
    rent: dedupeProviders(obj.rent),
    buy: dedupeProviders(obj.buy),
  };
}

function buildPrompt(body: RequestBody): string {
  const yearPart = body.year ? ` (${body.year})` : "";
  return [
    `Find the CURRENT United States streaming availability for the film "${body.title}"${yearPart}.`,
    "Use web search to confirm where it can be watched in the US right now.",
    "",
    "Classify each service into exactly one of three categories:",
    '- "flatrate": included with a subscription (e.g. Netflix, Max, Hulu, Disney+, Prime Video subscription, Peacock).',
    '- "rent": available to rent (e.g. Apple TV, Amazon Video, Fandango at Home, Google Play).',
    '- "buy": available to purchase.',
    "",
    "Only include services that genuinely offer the film in the US right now. If you are unsure or find nothing, leave the relevant list empty.",
    "",
    "Respond with ONLY a single JSON object and no other text, in exactly this shape:",
    '{ "flatrate": ["Service Name"], "rent": ["Service Name"], "buy": ["Service Name"] }',
    "Use human-readable service names as strings.",
  ].join("\n");
}

async function lookupViaClaude(
  apiKey: string,
  body: RequestBody,
): Promise<UsProviders> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildPrompt(body) }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
    }),
  });

  if (!resp.ok) {
    // Do not surface API errors / key details to the client.
    console.error("Anthropic API request failed", resp.status);
    return { flatrate: [], rent: [], buy: [] };
  }

  const data = await resp.json();
  const text = collectText(data?.content);
  return parseProvidersFromText(text);
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(EMPTY_RESULT, 200);
    }

    let parsedBody: Partial<RequestBody> = {};
    try {
      parsedBody = await req.json();
    } catch {
      return jsonResponse(EMPTY_RESULT, 200);
    }

    const title = typeof parsedBody.title === "string" ? parsedBody.title.trim() : "";
    if (!title) {
      return jsonResponse(EMPTY_RESULT, 200);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not configured");
      return jsonResponse(EMPTY_RESULT, 200);
    }

    const reqBody: RequestBody = {
      title,
      year: typeof parsedBody.year === "number" ? parsedBody.year : null,
      tmdb_id: typeof parsedBody.tmdb_id === "number" ? parsedBody.tmdb_id : null,
    };

    const us = await lookupViaClaude(apiKey, reqBody);
    return jsonResponse({ results: { US: us } }, 200);
  } catch (e) {
    // Never leak internal details; always return the empty contract shape.
    console.error("streaming-fallback unexpected error", e instanceof Error ? e.message : "unknown");
    return jsonResponse(EMPTY_RESULT, 200);
  }
});
