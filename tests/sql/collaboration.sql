\set ON_ERROR_STOP on
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege then return; end;
  raise exception 'Expected permission denial: %',statement;
end $$;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','owner@example.test',now()),
 ('00000000-0000-0000-0000-000000000002','editor@example.test',now()),
 ('00000000-0000-0000-0000-000000000003','viewer@example.test',now()),
 ('00000000-0000-0000-0000-000000000004','stranger@example.test',now()),
 ('00000000-0000-0000-0000-000000000005','unverified@example.test',null);
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='app_private.environment_metadata'::regclass),'foundation RLS');
set role anon;
select pg_temp.denied('select * from app_private.environment_metadata');
select pg_temp.denied('select * from public.storyboards');
select pg_temp.denied($$select public.create_film_project('Anonymous')$$);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select pg_temp.denied('select * from app_private.environment_metadata');
select public.create_film_project('Film One') as project \gset
select public.create_film_project('Film Two') as second_project \gset
select (public.create_storyboard(:'project','Opening','{"meta":{"director":"A"},"shots":[{"id":"stable-shot-1","scene":"EXT. BEACH","props":"Boat"}]}')).id as board \gset
select (public.create_storyboard(:'project','Alternate cut','{"meta":{},"shots":[]}')).id as alternate \gset
select pg_temp.assert_true((select count(*)=2 from public.storyboards),'multiple boards');
select public.invite_project_member(:'project','editor@example.test','editor') as invite \gset
select public.invite_project_member(:'project','viewer@example.test','viewer') as viewer_invite \gset
select public.invite_project_member(:'project','stranger@example.test','commenter') as revoked \gset
select public.revoke_project_invitation(:'revoked');
select pg_temp.denied($$update public.storyboards set version=99$$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select pg_temp.assert_true((select count(*)=0 from public.storyboards),'outsider isolation');
select pg_temp.denied(format('select public.accept_project_invitation(%L)',:'invite'));
select pg_temp.denied(format('select public.accept_project_invitation(%L)',:'revoked'));
select pg_temp.denied(format('select public.save_storyboard(%L,1,%L,%L)',:'board','Hack','{"meta":{},"shots":[]}'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.accept_project_invitation(:'invite');
select pg_temp.denied(format('select public.accept_project_invitation(%L)',:'invite'));
select pg_temp.assert_true((select count(*)=1 from public.film_projects),'project isolation');
select pg_temp.assert_true((select document->'shots'->0->>'props'='Boat' from public.storyboards where id=:'board'),'shot fields persist');
select (public.save_storyboard(:'board',1,'Opening revised','{"meta":{},"shots":[{"id":"stable-shot-1","props":"Boat revised"}]}')).version as saved_version \gset
select pg_temp.assert_true(:saved_version=2,'version increments');
-- Stale versions must fail, rather than overwrite.
do $$ begin
 begin
  perform public.save_storyboard((select id from public.storyboards where name='Opening revised'),1,'Stale','{"meta":{},"shots":[]}');
 exception when serialization_failure then return; end;
 raise exception 'Stale save overwrote document';
end $$;
select pg_temp.denied(format('select public.invite_project_member(%L,%L,%L)',:'project','bad@example.test','editor'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.accept_project_invitation(:'viewer_invite');
select pg_temp.denied(format('select public.save_storyboard(%L,2,%L,%L)',:'board','Hack','{"meta":{},"shots":[]}'));
select pg_temp.denied(format('select public.create_storyboard(%L,%L,%L)',:'project','Hack','{"meta":{},"shots":[]}'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.set_project_member(:'project','00000000-0000-0000-0000-000000000003','commenter');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.denied(format('select public.save_storyboard(%L,2,%L,%L)',:'board','Hack','{"meta":{},"shots":[]}'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.set_project_member(:'project','00000000-0000-0000-0000-000000000003',null);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert_true((select count(*)=0 from public.storyboards),'revocation immediate');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.transfer_project_ownership(:'project','00000000-0000-0000-0000-000000000002');
select pg_temp.assert_true(app_private.project_role(:'project')='editor','old owner becomes editor');
select pg_temp.denied(format('select public.set_project_member(%L,%L,null)',:'project','00000000-0000-0000-0000-000000000002'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select pg_temp.assert_true(app_private.project_role(:'project')='owner','new owner');
select public.invite_project_member(:'project','stranger@example.test','viewer') as expired \gset
reset role;
update public.project_invitations set expires_at=now()-interval '1 second' where id=:'expired';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select pg_temp.denied(format('select public.accept_project_invitation(%L)',:'expired'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select pg_temp.denied($$select public.create_film_project('Unverified')$$);
reset role;
select 'All foundation, isolation, role, invitation, revocation and conflict checks passed.' as result;
