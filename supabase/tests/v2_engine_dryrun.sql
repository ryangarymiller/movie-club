-- Movie Club 2.0 engine — end-to-end dry run. Run INSIDE a transaction you roll back:
--   begin; \i supabase/migrations/20261001000000_v2_engine.sql  (if not yet applied)
--   \i supabase/tests/v2_engine_dryrun.sql
--   rollback;
-- Uses the real October 2026 list and five ballots that reproduce the club's 6/4/3 tally exactly.
-- Ends by RAISING 'V2_ENGINE_DRY_RUN_OK' so it can never be committed by accident.
update months set status='revealed' where month_year='2026-08' and status='active';  -- sim only: one lifecycle at a time
do $$
declare v_season uuid; v_month uuid; v_next uuid; e1 uuid; e2 uuid; mv1 uuid; mv2 uuid; u uuid[]; v_rev boolean;
        hell uuid; silver uuid; back uuid; weap uuid; wail uuid; pulse uuid; elm uuid; wicked uuid; primal uuid; angel uuid;
begin
  select array_agg(id order by name) into u from public.users where is_active and not is_test;
  v_season := public.ensure_season_for(date '2026-10-01');
  insert into months (season_id, month_year, status, auto_activate, mode, theme) values (v_season, '2026-10', 'upcoming', false, 'v2', 'Halloween / Horror') returning id into v_month;
  if (select count(*) from public.expected_members(v_month)) <> 5 then raise exception 'expected 5'; end if;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[1],1,'Hellraiser') returning id into hell;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[1],2,'Silver Bullet') returning id into silver;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[2],3,'Backrooms') returning id into back;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[2],4,'Weapons') returning id into weap;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[3],5,'The Wailing') returning id into wail;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[3],6,'Pulse') returning id into pulse;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[4],7,'A Nightmare on Elm Street') returning id into elm;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[4],8,'Something Wicked This Way Comes') returning id into wicked;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[5],9,'Primal Fear') returning id into primal;
  insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[5],10,'Angel Heart') returning id into angel;
  begin insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[1],11,'Extra'); raise exception 'cap not enforced'; exception when others then if sqlerrm not like '%no more than 2%' then raise; end if; end;
  begin insert into submissions (month_id,user_id,tmdb_id,title) values (v_month,u[3],1,'dup'); raise exception 'dup allowed'; exception when unique_violation then null; end;
  e1 := public.v2_close_submissions(v_month);
  if (select count(*) from public.v2_candidates(e1)) <> 10 then raise exception 'candidates != 10'; end if;
  insert into ballots (id,election_id,user_id) select gen_random_uuid(), e1, x from unnest(u) x;
  insert into ballot_ranks select b.id, v.sid, v.rk from ballots b, (values (hell,1),(back,2),(wail,3)) v(sid,rk) where b.election_id=e1 and b.user_id=u[1];
  insert into ballot_ranks select b.id, v.sid, v.rk from ballots b, (values (elm,1),(weap,2),(hell,3)) v(sid,rk) where b.election_id=e1 and b.user_id=u[2];
  insert into ballot_ranks select b.id, v.sid, v.rk from ballots b, (values (primal,1),(pulse,2),(elm,3)) v(sid,rk) where b.election_id=e1 and b.user_id=u[3];
  insert into ballot_ranks select b.id, v.sid, v.rk from ballots b, (values (primal,1),(wail,2),(weap,3)) v(sid,rk) where b.election_id=e1 and b.user_id=u[4];
  insert into ballot_ranks select b.id, v.sid, v.rk from ballots b, (values (weap,1),(back,2),(pulse,3)) v(sid,rk) where b.election_id=e1 and b.user_id=u[5];
  if (select points from public.v2_tally(e1) where submission_id=weap)   <> 13 then raise exception 'Weapons != 13'; end if;
  if (select points from public.v2_tally(e1) where submission_id=primal) <> 12 then raise exception 'Primal != 12'; end if;
  if (select points from public.v2_tally(e1) where submission_id=elm)    <> 9  then raise exception 'Elm != 9'; end if;
  if (select points from public.v2_tally(e1) where submission_id=hell)   <> 9  then raise exception 'Hellraiser != 9'; end if;
  if (select points from public.v2_tally(e1) where submission_id=back)   <> 8  then raise exception 'Backrooms != 8'; end if;
  if (select points from public.v2_tally(e1) where submission_id=wail)   <> 7  then raise exception 'Wailing != 7'; end if;
  if (select points from public.v2_tally(e1) where submission_id=pulse)  <> 7  then raise exception 'Pulse != 7'; end if;
  if (select points from public.v2_tally(e1) where submission_id=angel)  <> 0  then raise exception 'Angel != 0'; end if;
  -- Security: a non-admin member cannot close a vote, even passing p_force => true.
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from users where role='member' and is_active and not is_test limit 1)::text, 'role','authenticated')::text, true);
  begin perform public.v2_close_election(e1, true); raise exception 'member force-closed a vote';
  exception when others then if sqlerrm not like '%admin only%' then raise; end if; end;
  perform set_config('request.jwt.claims', '', true);
  mv1 := public.v2_close_election(e1, true);
  if (select winner_submission_id from elections where id=e1) <> weap then raise exception 'winner should be Weapons'; end if;
  if (select tie_broken_randomly from elections where id=e1) then raise exception 'false tie'; end if;
  if (select scoring_deadline from movies where id=mv1) is not null then raise exception 'v2 film got a deadline'; end if;
  if (select count(*) from notifications where type='film_elected' and payload->>'movie_id'=mv1::text) <> 5 then raise exception 'notifs'; end if;
  update app_settings set vote_points='{3,2,1}';
  if (select points from public.v2_tally(e1) where submission_id=weap) <> 6 or (select points from public.v2_tally(e1) where submission_id=primal) <> 6 then raise exception 'borda cross-check'; end if;
  update app_settings set vote_points='{6,4,3}';
  begin perform public.v2_open_election(v_month); raise exception 'opened while watching'; exception when others then if sqlerrm not like '%not finished%' then raise; end if; end;
  insert into ratings (movie_id,user_id,score) select mv1, x, 7.5 from unnest(u[1:4]) x;
  if (select scores_revealed from movies where id=mv1) then raise exception 'revealed early'; end if;
  insert into ratings (movie_id,user_id,score) values (mv1, u[5], 8.25);
  select scores_revealed and picker_revealed into v_rev from movies where id=mv1; if not v_rev then raise exception 'last score did not reveal'; end if;
  e2 := public.v2_open_election(v_month);
  if (select count(*) from public.v2_candidates(e2)) <> 9 then raise exception 'candidates != 9'; end if;
  insert into ballots (id,election_id,user_id) select gen_random_uuid(), e2, x from unnest(u) x;
  insert into ballot_ranks select b.id, primal, 1 from ballots b where b.election_id=e2;
  mv2 := public.v2_close_election(e2, true);
  if (select title from movies where id=mv2) <> 'Primal Fear' then raise exception 'second winner'; end if;
  insert into ratings (movie_id,user_id,score) select mv2, x, 6 from unnest(u[1:4]) x;
  if (select scores_revealed from movies where id=mv2) then raise exception 'revealed with 4/5'; end if;
  if not public.v2_mark_absent(mv2, u[5], 'travelling') then raise exception 'absence did not reveal'; end if;
  v_next := public.v2_close_month(v_month);
  if (select status from months where id=v_month) <> 'revealed' then raise exception 'month not revealed'; end if;
  if (select count(*) from submissions where month_id=v_month and withdrawn_at is null) <> 2 then raise exception 'leftovers not withdrawn'; end if;
  if (select mode||'/'||status||'/'||month_year from months where id=v_next) <> 'v2/upcoming/2026-11' then raise exception 'next month wrong'; end if;
  perform public.activate_month(v_next, false);
  if (select status from months where id=v_next) <> 'upcoming' then raise exception 'activate_month touched v2'; end if;
  raise exception 'V2_ENGINE_DRY_RUN_OK';
end $$;
