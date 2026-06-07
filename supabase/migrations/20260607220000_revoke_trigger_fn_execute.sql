-- Security hardening (advisor follow-up): trigger-only functions should never be
-- callable via /rest/v1/rpc. They run from triggers as the table owner regardless
-- of these grants, so revoking direct EXECUTE from anon/authenticated/public is safe
-- and removes them from the exposed RPC surface.

do $$
declare fn text;
begin
  foreach fn in array array[
    'handle_new_auth_user()',
    'handle_auth_user_created()',
    'enforce_op_for_role_changes()',
    'notify_pick_change()',
    'notify_review()',
    'notify_scores_revealed()',
    'notify_score_change()',
    'push_notification()',
    'email_notification()',
    'reveal_picker_when_month_complete()',
    'notify_month_status()',
    'notify_comment()',
    'notify_veto_threshold()'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', fn);
  end loop;
end $$;
