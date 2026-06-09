// supabase/functions/ai-recap/index.ts
//
// Generates a month's AI recap + picks the AI-assisted "Best Review", and stores
// the result in public.month_recaps. Admin-gated (the caller's JWT must resolve to
// an admin). Gathers the month's films, scores and reviews with the service role,
// asks Claude for a short narrative recap + the single best-written review, and
// upserts the row.
//
// SECURITY: ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY live ONLY here
// (server-side). They are never logged, returned, or exposed to the client. The
// service role bypasses RLS, so the function never reads more than it assembles
// into the prompt and the stored recap.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const TEST_EMAIL = "i.am.ryan.the.miller@gmail.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extract the first balanced top-level JSON object from a string.
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
  }
  return parts.join("\n");
}

const fmt = (n: unknown) => (typeof n === "number" ? n.toFixed(2) : "—");

// deno-lint-ignore no-explicit-any
function buildPrompt(monthLabel: string, films: any[], reviews: any[], nameCollisions: string[][]): string {
  // Films arrive in WATCH ORDER (sorted by scoring_deadline); number them so the
  // model can't mistake a later film for the month's opener.
  const filmLines = films.map((f, idx) => {
    const scores = f.memberScores.map((m: { name: string; score: number }) => `${m.name} ${fmt(m.score)}`).join(", ");
    return [
      `${idx + 1}. "${f.title}"${f.year ? ` (${f.year})` : ""} — picked by ${f.pickerName ?? "unknown"}`,
      `   director: ${f.director ?? "—"}; genre: ${f.genre ?? "—"}; club average: ${fmt(f.clubAvg)}`,
      `   scores: ${scores || "none yet"}`,
    ].join("\n");
  }).join("\n");

  const reviewLines = reviews.length
    ? reviews.map((r) => `[id:${r.id}] ${r.author} on "${r.filmTitle}":\n${r.body}`).join("\n\n")
    : "(no reviews were written this month)";

  const namingRule = nameCollisions.length
    ? `Refer to members by first name — EXCEPT these members share a first name, so always use their full name (or last name) to tell them apart, never the bare first name: ${nameCollisions.map((g) => g.join(" and ")).join("; ")}.`
    : `Refer to members by first name; if two members share one, use their full or last name to distinguish them.`;

  return [
    `You are the in-house critic for a private five-person movie club, writing the recap for ${monthLabel}.`,
    `Everyone watches every film and scores it 0.01–10.00. The films below are listed in WATCH ORDER — the order the club actually watched them, first to last. Film 1 opened the month; the last film closed it. The members' written reviews follow.`,
    ``,
    `FILMS (in watch order):`,
    filmLines,
    ``,
    `REVIEWS:`,
    reviewLines,
    ``,
    `Write a warm, witty, specific recap of the month (2–3 short paragraphs, ~150–220 words). Reference the actual films, the standout scores (highs, lows, and any big disagreements), and the general mood — like a friend who watched along. ${namingRule} HONOR THE WATCH ORDER: only film 1 "opened"/"kicked off" the month and only the last film "closed"/"ended" it — never call a later film the opener or an earlier film the closer, and don't claim two films "bookend" the month unless they are literally the first and last. Do not invent facts not present above. Plain prose (you may use light markdown emphasis); no headings.`,
    ``,
    `Then choose the single best-written review of the month from the REVIEWS list (most insightful, funny, or well-crafted). If there are no reviews, set best_review_id to null.`,
    ``,
    `Respond with ONLY a JSON object, no other text, in exactly this shape:`,
    `{ "recap": "<the recap prose>", "best_review_id": "<the [id:...] value of the chosen review, or null>", "best_review_blurb": "<one sentence, max 25 words, on why this review stood out — or empty string if none>" }`,
  ].join("\n");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_misconfigured" }, 500);
    if (!apiKey) { console.error("ANTHROPIC_API_KEY not configured"); return json({ error: "ai_unavailable" }, 503); }

    let body: { month_id?: string; force?: boolean } = {};
    try { body = await req.json(); } catch { /* fallthrough */ }
    const monthId = typeof body.month_id === "string" ? body.month_id : "";
    const force = body.force === true;
    if (!monthId) return json({ error: "month_id_required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── auth: the caller must be an admin ─────────────────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (userErr || !uid) return json({ error: "unauthorized" }, 401);
    const { data: me } = await admin.from("users").select("role").eq("id", uid).maybeSingle();
    if (me?.role !== "admin") return json({ error: "forbidden" }, 403);

    // ── gather the month ──────────────────────────────────────────────────────
    const { data: month } = await admin.from("months").select("id, month_year").eq("id", monthId).maybeSingle();
    if (!month) return json({ error: "month_not_found" }, 404);

    // Generate ONCE per month. If a recap already exists, skip (and don't spend an
    // AI call) unless the caller explicitly forces it — the admin "Regenerate" button
    // passes force:true; the client-soft auto-gen never does. This is the authoritative
    // guard against the recap being silently regenerated/changed on repeat invocations.
    if (!force) {
      const { data: existing } = await admin.from("month_recaps").select("month_id").eq("month_id", monthId).maybeSingle();
      if (existing) return json({ ok: true, skipped: true, reason: "recap_exists" }, 200);
    }

    // Order by scoring_deadline so the prompt lists films in WATCH ORDER (the
    // order the club watched them) — the recap must not contradict it (e.g. call
    // the last film the one that "kicked off" the month).
    const { data: filmRows } = await admin.from("movies")
      .select("id, title, year_released, director, genre, historical_avg_score, picked_by_user_id")
      .eq("month_id", monthId)
      .order("scoring_deadline", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
    const films = filmRows ?? [];
    if (!films.length) return json({ error: "no_films" }, 422);
    const filmIds = films.map((f) => f.id);

    const { data: userRows } = await admin.from("users").select("id, name, email");
    const users = userRows ?? [];
    const userById: Record<string, { name: string; email: string }> = {};
    for (const u of users) userById[u.id] = { name: u.name, email: u.email };
    const isTest = (id: string | null) => !!id && (userById[id]?.email ?? "").toLowerCase() === TEST_EMAIL;

    // Detect members who share a first name (e.g. the two Ryans) so the recap can
    // be told to disambiguate them by full/last name instead of a bare first name.
    const firstNameGroups: Record<string, Set<string>> = {};
    for (const u of users) {
      if ((u.email ?? "").toLowerCase() === TEST_EMAIL) continue;
      const first = (u.name ?? "").trim().split(/\s+/)[0];
      if (!first) continue;
      (firstNameGroups[first] ??= new Set<string>()).add(u.name);
    }
    const nameCollisions = Object.values(firstNameGroups)
      .filter((s) => s.size > 1)
      .map((s) => [...s]);

    const [{ data: ratingRows }, { data: reviewRows }] = await Promise.all([
      admin.from("ratings").select("movie_id, user_id, score").in("movie_id", filmIds),
      admin.from("reviews").select("id, movie_id, user_id, body").in("movie_id", filmIds),
    ]);
    const ratings = ratingRows ?? [];
    const reviewsRaw = reviewRows ?? [];

    const filmTitleById: Record<string, string> = {};
    const enrichedFilms = films.map((f) => {
      filmTitleById[f.id] = f.title;
      const memberScores = ratings
        .filter((r) => r.movie_id === f.id && r.score != null && !isTest(r.user_id) && userById[r.user_id])
        .map((r) => ({ name: userById[r.user_id].name, score: Number(r.score) }))
        .sort((a, b) => b.score - a.score);
      const vals = memberScores.map((m) => m.score);
      const clubAvg = f.historical_avg_score != null
        ? Number(f.historical_avg_score)
        : (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
      return {
        title: f.title, year: f.year_released, director: f.director, genre: f.genre,
        pickerName: f.picked_by_user_id ? userById[f.picked_by_user_id]?.name ?? null : null,
        clubAvg, memberScores,
      };
    });

    const reviews = reviewsRaw
      .filter((r) => !isTest(r.user_id) && userById[r.user_id] && typeof r.body === "string" && r.body.trim().length > 0)
      .map((r) => ({
        id: r.id, author: userById[r.user_id].name,
        filmTitle: filmTitleById[r.movie_id] ?? "a film",
        body: r.body.trim().slice(0, 1500),
      }));
    const reviewIds = new Set(reviews.map((r) => r.id));

    // ── call Claude ───────────────────────────────────────────────────────────
    const prompt = buildPrompt(month.month_year, enrichedFilms, reviews, nameCollisions);
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error("Anthropic request failed", resp.status);
      return json({ error: "ai_request_failed" }, 502);
    }
    const data = await resp.json();
    const parsed = extractJsonObject(collectText(data?.content));
    if (!parsed || typeof parsed.recap !== "string" || !parsed.recap.trim()) {
      return json({ error: "ai_parse_failed" }, 502);
    }

    const recap_md = parsed.recap.trim();
    // The model returns the [id:...] value; accept a bare uuid too. Validate it.
    let best_review_id: string | null = null;
    const rawId = parsed.best_review_id;
    if (typeof rawId === "string") {
      const m = rawId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      const candidate = m ? m[0] : rawId;
      if (reviewIds.has(candidate)) best_review_id = candidate;
    }
    const best_review_blurb = (best_review_id && typeof parsed.best_review_blurb === "string")
      ? parsed.best_review_blurb.trim().slice(0, 240)
      : null;

    // ── store ─────────────────────────────────────────────────────────────────
    const { error: upErr } = await admin.from("month_recaps").upsert({
      month_id: monthId,
      recap_md,
      best_review_id,
      best_review_blurb,
      model: MODEL,
      generated_at: new Date().toISOString(),
    });
    if (upErr) { console.error("recap upsert failed", upErr.message); return json({ error: "store_failed" }, 500); }

    return json({ ok: true, recap_md, best_review_id, best_review_blurb });
  } catch (e) {
    console.error("ai-recap unexpected error", e instanceof Error ? e.message : "unknown");
    return json({ error: "unexpected" }, 500);
  }
});
