-- Development-only database smoke test. All fixture rows are rolled back.
-- This simulates JWT identity at the SQL layer; it does not test Auth email/API.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  owner_email text := owner_id::text || '@storyboard-smoke.invalid';
  editor_email text := editor_id::text || '@storyboard-smoke.invalid';
  viewer_email text := viewer_id::text || '@storyboard-smoke.invalid';
  project_id uuid;
  other_project uuid;
  board public.storyboards;
  second_board public.storyboards;
  invitation uuid;
  viewer_invitation uuid;
  denied boolean;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (owner_id,owner_email,now()),(editor_id,editor_email,now()),
    (viewer_id,viewer_email,now()),(outsider_id,outsider_id::text||'@storyboard-smoke.invalid',now());
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  project_id := public.create_film_project('Temporary hosted collaboration smoke');
  other_project := public.create_film_project('Temporary isolated second project');
  board := public.create_storyboard(project_id,'Opening','{"meta":{"director":"Smoke fixture"},"shots":[{"id":"stable-shot-smoke","scene":"EXT. BEACH","props":"Boat"}]}'::jsonb);
  second_board := public.create_storyboard(project_id,'Alternate','{"meta":{},"shots":[]}'::jsonb);
  invitation := public.invite_project_member(project_id,editor_email,'editor');
  viewer_invitation := public.invite_project_member(project_id,viewer_email,'viewer');
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.accept_project_invitation(invitation);
  if not exists(select 1 from public.storyboards where id=board.id and document->'shots'->0->>'props'='Boat') then raise exception 'Shared read failed'; end if;
  if exists(select 1 from public.film_projects where id=other_project) then raise exception 'Cross-project isolation failed'; end if;
  board := public.save_storyboard(board.id,1,'Opening saved','{"meta":{},"shots":[{"id":"stable-shot-smoke","props":"Revised boat"}]}'::jsonb);
  if board.version<>2 then raise exception 'Version increment failed'; end if;
  denied:=false;
  begin perform public.save_storyboard(board.id,1,'Stale','{"meta":{},"shots":[]}'::jsonb);
  exception when serialization_failure then denied:=true; end;
  if not denied then raise exception 'Conflict was not detected'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not exists(select 1 from public.storyboards where id=board.id and document->'shots'->0->>'props'='Revised boat') then raise exception 'Owner cannot read editor save'; end if;
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.accept_project_invitation(viewer_invitation);
  denied:=false;
  begin perform public.save_storyboard(board.id,2,'Viewer write','{"meta":{},"shots":[]}'::jsonb);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Viewer write allowed'; end if;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  if exists(select 1 from public.storyboards where id in (board.id,second_board.id)) then raise exception 'Outsider read allowed'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.set_project_member(project_id,editor_id,null);
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  if exists(select 1 from public.storyboards where id=board.id) then raise exception 'Revocation failed'; end if;
  execute 'reset role';
end $$;
rollback;
select 'passed: hosted create/read/save, multiple boards, cross-project isolation, editor sharing, viewer denial, conflict detection, revocation; all fixture rows rolled back' as database_smoke_test;
