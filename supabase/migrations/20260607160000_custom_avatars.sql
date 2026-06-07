-- Admin-managed custom avatars (Phase 7 — Admin Assets).
--
-- ADDITIVE to the static avatar library (public/avatars/* + src/lib/avatars.js,
-- which stays the polished base set). This lets an admin upload extra avatars
-- WITHOUT a code change: the image goes to a public Storage bucket and a row here
-- records its pack/slug/label. A user picks one and we store the avatar_id as
-- "storage:<path>", which avatarSrc() resolves to the bucket's public URL — so
-- rendering stays fully synchronous (no per-render DB lookup).

-- ── public bucket for avatar images (admin writes; anyone reads via public URL) ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve objects publicly via their URL; these policies govern the
-- Storage API. Read is open (it's a public bucket); writes are admin-only.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars admin insert" on storage.objects;
create policy "avatars admin insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and public.is_admin(auth.uid()));

drop policy if exists "avatars admin update" on storage.objects;
create policy "avatars admin update" on storage.objects
  for update using (bucket_id = 'avatars' and public.is_admin(auth.uid()))
  with check (bucket_id = 'avatars' and public.is_admin(auth.uid()));

drop policy if exists "avatars admin delete" on storage.objects;
create policy "avatars admin delete" on storage.objects
  for delete using (bucket_id = 'avatars' and public.is_admin(auth.uid()));

-- ── manifest rows for admin-uploaded avatars ──────────────────────────────────
create table if not exists public.custom_avatars (
  id           uuid primary key default gen_random_uuid(),
  pack         text not null,
  slug         text not null,
  label        text not null,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  unique (pack, slug)
);

alter table public.custom_avatars enable row level security;

drop policy if exists "custom avatars readable" on public.custom_avatars;
create policy "custom avatars readable" on public.custom_avatars
  for select using (auth.uid() is not null);

drop policy if exists "admins manage custom avatars" on public.custom_avatars;
create policy "admins manage custom avatars" on public.custom_avatars
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
