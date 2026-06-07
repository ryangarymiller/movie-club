-- AI month recaps + Best Review (Phase 6 award catalog: the two AI-dependent
-- pieces — the monthly AI recap and the AI-assisted Best Review).
--
-- Rows are written ONLY by the ai-recap Edge Function (server-side, with the
-- service role key + the ANTHROPIC_API_KEY that never touches the client). The
-- function gathers the month's films, scores and reviews, asks Claude for a short
-- narrative recap + the single best-written review, and upserts the result here.
-- Members read it (shown in the month's Reveal section); admins may delete to
-- force a regenerate. Normal clients have no insert/update path.

create table if not exists public.month_recaps (
  month_id          uuid primary key references public.months(id) on delete cascade,
  recap_md          text,
  best_review_id    uuid references public.reviews(id) on delete set null,
  best_review_blurb text,
  model             text,
  generated_at      timestamptz not null default now()
);

alter table public.month_recaps enable row level security;

-- Any signed-in member can read a recap.
drop policy if exists "members read recaps" on public.month_recaps;
create policy "members read recaps" on public.month_recaps
  for select using (auth.uid() is not null);

-- Admins may manage (e.g. delete to regenerate). The Edge Function uses the
-- service role, which bypasses RLS, so it does not need an explicit policy.
drop policy if exists "admins manage recaps" on public.month_recaps;
create policy "admins manage recaps" on public.month_recaps
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
