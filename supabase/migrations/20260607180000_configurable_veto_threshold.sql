-- Make the veto threshold admin-configurable (was hardcoded to 3 in the trigger
-- and the client). Stored as a global on the app_settings singleton; the trigger
-- reads it, and the VetoControl client reads it too.

alter table public.app_settings
  add column if not exists veto_threshold integer not null default 3;

-- Keep it sane (at least 1).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_veto_threshold_ck') then
    alter table public.app_settings add constraint app_settings_veto_threshold_ck check (veto_threshold >= 1);
  end if;
end $$;

-- Trigger now reads the threshold from app_settings (fallback 3).
create or replace function public.notify_veto_threshold() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_threshold integer;
  v_count     integer;
  v_picker    uuid;
  v_title     text;
  v_flagged   boolean;
  v_scores    integer;
begin
  select coalesce(veto_threshold, 3) into v_threshold from app_settings where id = true;
  if v_threshold is null then v_threshold := 3; end if;

  select count(*) into v_count from veto_votes where movie_id = NEW.movie_id;
  if v_count < v_threshold then
    return NEW;
  end if;

  select picked_by_user_id, title, veto_resubmit_required
    into v_picker, v_title, v_flagged
    from movies where id = NEW.movie_id;

  if coalesce(v_flagged, false) then
    return NEW;
  end if;

  select count(*) into v_scores from ratings where movie_id = NEW.movie_id and score is not null;
  if v_scores > 0 then
    return NEW;
  end if;

  update movies set veto_resubmit_required = true where id = NEW.movie_id;

  if v_picker is not null then
    insert into notifications (user_id, type, title, body, link, payload)
    values (
      v_picker, 'veto', 'Your pick was vetoed 🚫',
      '"' || coalesce(v_title, 'Your pick') || '" reached the veto threshold (' || v_threshold
        || ' members). Please choose a replacement.',
      '/films?film=' || NEW.movie_id::text,
      jsonb_build_object('movie_id', NEW.movie_id, 'votes', v_count)
    );
  end if;

  return NEW;
end $$;
