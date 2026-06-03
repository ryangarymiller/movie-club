-- Phase 4a: in-app notifications. SELECTIVE — only meaningful events create rows
-- (film scores revealed, new month, end-of-month reveal, replies, @mentions, score-change
-- decisions). NOT general activity (no notify on every score/review/reaction). Push + email
-- channels layer on later; for now everything is in-app. All rows are created by these
-- SECURITY DEFINER triggers, so there is no client INSERT policy.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.notify_scores_revealed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.scores_revealed = true and OLD.scores_revealed is distinct from true then
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'scores_revealed', 'Scores are in 🎬', NEW.title || ' — scores revealed',
           '/films', jsonb_build_object('movie_id', NEW.id)
    from users u where u.is_active and u.email <> 'i.am.ryan.the.miller@gmail.com';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_scores_revealed on public.movies;
create trigger trg_notify_scores_revealed after update of scores_revealed on public.movies
for each row execute function public.notify_scores_revealed();

create or replace function public.notify_month_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare lbl text;
begin
  lbl := to_char(to_date(NEW.month_year || '-01','YYYY-MM-DD'), 'FMMonth YYYY');
  if NEW.status = 'revealed' and OLD.status is distinct from 'revealed' then
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'month_reveal', 'The reveal is live 🎭', lbl || ' — pickers + recap revealed',
           '/this-month', jsonb_build_object('month_id', NEW.id)
    from users u where u.is_active and u.email <> 'i.am.ryan.the.miller@gmail.com';
  elsif NEW.status = 'active' and OLD.status is distinct from 'active' then
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'month_active', lbl || ' is live 🍿', 'New films to watch this month',
           '/this-month', jsonb_build_object('month_id', NEW.id)
    from users u where u.is_active and u.email <> 'i.am.ryan.the.miller@gmail.com';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_month_status on public.months;
create trigger trg_notify_month_status after update of status on public.months
for each row execute function public.notify_month_status();

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid; actor text; m record;
begin
  if NEW.parent_comment_id is not null then
    select user_id into target from comments where id = NEW.parent_comment_id;
  elsif NEW.review_id is not null then
    select user_id into target from reviews where id = NEW.review_id;
  end if;
  select name into actor from users where id = NEW.user_id;
  if target is not null and target <> NEW.user_id then
    insert into notifications (user_id, type, title, body, link, payload)
    values (target, 'reply', coalesce(actor,'Someone') || ' replied 💬', left(NEW.body,140),
            '/films', jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
  end if;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' and m.id is distinct from target then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films', jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
for each row execute function public.notify_comment();

create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text; m record;
begin
  select name into actor from users where id = NEW.user_id;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films', jsonb_build_object('movie_id', NEW.movie_id, 'review_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;
drop trigger if exists trg_notify_review on public.reviews;
create trigger trg_notify_review after insert on public.reviews
for each row execute function public.notify_review();

create or replace function public.notify_score_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','denied') then
    insert into notifications (user_id, type, title, body, link, payload)
    values (NEW.user_id, 'score_change',
            case when NEW.status='approved' then 'Score change approved ✅' else 'Score change denied' end,
            'Your score change request was ' || NEW.status, '/films',
            jsonb_build_object('request_id', NEW.id));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_score_change on public.score_change_requests;
create trigger trg_notify_score_change after update of status on public.score_change_requests
for each row execute function public.notify_score_change();
