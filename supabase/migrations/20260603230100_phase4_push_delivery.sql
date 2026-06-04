-- Web push delivery: on notification insert, if the recipient enabled push (and hasn't
-- muted the type / isn't in quiet hours), gather their subscriptions + VAPID keys (private
-- from supabase_vault) and POST to the send-push Edge Function via pg_net. The VAPID PUBLIC
-- key is not secret (it's embedded in the client too). Requires pg_net + the send-push
-- Edge Function + vault secrets 'vapid_private_key' and 'vapid_subject'.
create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public, vault as $$
declare
  pref record; subs jsonb; vpriv text; vsub text; usr_tz text; localnow time; in_quiet boolean := false;
  vpub text := 'BPWTm62KWStCugQNiHyZonaZ6eMoaOpo6ZhgmBFw3Wt3z7Cbu8StfGiEuaXalAONbR5OlFEEUX6lK-1QnHRmY6U';
begin
  select * into pref from notification_preferences where user_id = NEW.user_id;
  if not found or pref.channel_push is not true then return NEW; end if;
  if NEW.type = any(coalesce(pref.muted_types, '{}'::text[])) then return NEW; end if;

  select coalesce(nullif(timezone,''), 'America/Los_Angeles') into usr_tz from users where id = NEW.user_id;
  if pref.quiet_start is not null and pref.quiet_end is not null then
    begin localnow := (now() at time zone usr_tz)::time;
    exception when others then localnow := (now() at time zone 'America/Los_Angeles')::time; end;
    if pref.quiet_start <= pref.quiet_end then
      in_quiet := localnow >= pref.quiet_start and localnow < pref.quiet_end;
    else
      in_quiet := localnow >= pref.quiet_start or localnow < pref.quiet_end;
    end if;
    if in_quiet then return NEW; end if;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into subs
  from push_subscriptions where user_id = NEW.user_id;
  if subs is null then return NEW; end if;

  select decrypted_secret into vpriv from vault.decrypted_secrets where name = 'vapid_private_key';
  select decrypted_secret into vsub  from vault.decrypted_secrets where name = 'vapid_subject';
  if vpriv is null then return NEW; end if;

  perform net.http_post(
    url := 'https://pjwttvazgabwcybrwpmx.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'vapid', jsonb_build_object('publicKey', vpub, 'privateKey', vpriv, 'subject', vsub),
      'payload', jsonb_build_object('title', NEW.title, 'body', coalesce(NEW.body,''), 'url', NEW.link, 'tag', NEW.type),
      'subscriptions', subs
    )
  );
  return NEW;
end $$;
drop trigger if exists trg_push_notification on public.notifications;
create trigger trg_push_notification after insert on public.notifications
for each row execute function public.push_notification();
