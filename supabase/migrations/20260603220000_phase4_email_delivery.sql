-- Email delivery for notifications via Resend, sent straight from a DB trigger with pg_net
-- (no Edge Function needed). Opt-in only (notification_preferences.channel_email, default
-- false), respects per-type mutes + quiet hours (in the recipient's timezone). The Resend
-- API key and app base URL are read from supabase_vault (not stored in this file).
-- NOTE: requires `create extension pg_net;` and vault secrets 'resend_api_key' + 'app_base_url'.
-- Resend delivers to ALL members only once a sending domain is verified; until then test
-- mode delivers to the Resend account owner's address only.
create or replace function public.email_notification() returns trigger
language plpgsql security definer set search_path = public, vault as $$
declare
  pref record; usr record; api_key text; base_url text;
  localnow time; in_quiet boolean := false;
  esc_title text; esc_body text;
  from_addr text := 'Movie Club <onboarding@resend.dev>';
begin
  select * into pref from notification_preferences where user_id = NEW.user_id;
  if not found or pref.channel_email is not true then return NEW; end if;
  if NEW.type = any(coalesce(pref.muted_types, '{}'::text[])) then return NEW; end if;

  select email, name, coalesce(nullif(timezone,''), 'America/Los_Angeles') as tz
    into usr from users where id = NEW.user_id and is_active;
  if not found or usr.email is null then return NEW; end if;

  if pref.quiet_start is not null and pref.quiet_end is not null then
    begin localnow := (now() at time zone usr.tz)::time;
    exception when others then localnow := (now() at time zone 'America/Los_Angeles')::time; end;
    if pref.quiet_start <= pref.quiet_end then
      in_quiet := localnow >= pref.quiet_start and localnow < pref.quiet_end;
    else
      in_quiet := localnow >= pref.quiet_start or localnow < pref.quiet_end;
    end if;
    if in_quiet then return NEW; end if;
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'app_base_url';
  if api_key is null then return NEW; end if;

  esc_title := replace(replace(replace(NEW.title, '&','&amp;'), '<','&lt;'), '>','&gt;');
  esc_body  := replace(replace(replace(coalesce(NEW.body,''), '&','&amp;'), '<','&lt;'), '>','&gt;');

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer '||api_key, 'Content-Type','application/json'),
    body := jsonb_build_object(
      'from', from_addr,
      'to', jsonb_build_array(usr.email),
      'subject', NEW.title,
      'html',
        '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        || '<p style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#888;margin:0 0 8px">Movie Club</p>'
        || '<h2 style="margin:0 0 8px;color:#111">' || esc_title || '</h2>'
        || case when esc_body <> '' then '<p style="color:#444;line-height:1.5;margin:0 0 16px">' || esc_body || '</p>' else '' end
        || '<a href="' || coalesce(base_url,'') || coalesce(NEW.link,'/')
        || '" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open Movie Club</a>'
        || '<p style="color:#aaa;font-size:11px;margin-top:24px">Manage these in Profile &#8594; Notifications.</p>'
        || '</div>'
    )
  );
  return NEW;
end $$;
drop trigger if exists trg_email_notification on public.notifications;
create trigger trg_email_notification after insert on public.notifications
for each row execute function public.email_notification();
