-- Carry the comment/review id in film notification links so the notification
-- "Open" (and a tapped push notification) scrolls to and highlights the exact
-- post in the discussion, not just the film. Builds on 20260605120000.

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
            '/films?film=' || NEW.movie_id || '&comment=' || NEW.id,
            jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
  end if;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' and m.id is distinct from target then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id || '&comment=' || NEW.id,
              jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;

create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text; m record;
begin
  select name into actor from users where id = NEW.user_id;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id || '&review=' || NEW.id,
              jsonb_build_object('movie_id', NEW.movie_id, 'review_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;

-- Backfill: append the anchor to already-deep-linked rows that don't have one.
update notifications
set link = link || '&comment=' || (payload->>'comment_id')
where link like '/films?film=%' and link not like '%&comment=%' and link not like '%&review=%'
  and payload ? 'comment_id' and coalesce(payload->>'comment_id','') <> '';

update notifications
set link = link || '&review=' || (payload->>'review_id')
where link like '/films?film=%' and link not like '%&review=%' and link not like '%&comment=%'
  and payload ? 'review_id' and coalesce(payload->>'review_id','') <> '';
