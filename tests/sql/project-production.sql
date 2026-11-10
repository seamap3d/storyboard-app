-- Synthetic identities and production data; all rows rolled back at the end.
begin;
create function pg_temp.production_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Production assertion failed: %',label; end if; end $$;
create function pg_temp.production_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
  end;
  raise exception 'Expected error % from %',expected,statement;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000091','production-owner@example.test',now()),
 ('00000000-0000-4000-8000-000000000092','production-editor@example.test',now()),
 ('00000000-0000-4000-8000-000000000093','production-viewer@example.test',now()),
 ('00000000-0000-4000-8000-000000000094','production-outsider@example.test',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select public.create_film_project('Production fixture') as production_project \gset
select public.create_film_project('Unrelated fixture') as unrelated_project \gset
select (public.create_storyboard(:'production_project','Production board','{"meta":{},"shots":[{"id":"stable-shot","customTitle":"Opening","imageCaption":"preserve approved caption"}]}')).id as production_board \gset
select (public.create_storyboard(:'unrelated_project','Other board','{"meta":{},"shots":[{"id":"other-shot"}]}')).id as unrelated_board \gset
select pg_temp.production_assert((public.get_project_production(:'production_project')->>'version')::integer=0,'empty register revision zero');
select public.invite_project_member(:'production_project','production-editor@example.test','editor') as production_invite \gset
select public.invite_project_member(:'production_project','production-viewer@example.test','viewer') as production_viewer_invite \gset
select jsonb_build_object(
 'people','[{"id":"00000000-0000-4000-8000-000000000001","name":"Crew","phone":"Fixture only","future":{"keep":true}}]'::jsonb,
 'characters','[{"id":"00000000-0000-4000-8000-000000000002","name":"Pilot","performerId":"00000000-0000-4000-8000-000000000001"}]'::jsonb,
 'locations','[{"id":"00000000-0000-4000-8000-000000000003","name":"Studio","permission":"unconfirmed"}]'::jsonb,
 'settings','[{"id":"00000000-0000-4000-8000-000000000004","name":"Cabin","locationId":"00000000-0000-4000-8000-000000000003"}]'::jsonb,
 'scenes','[{"id":"00000000-0000-4000-8000-000000000005","name":"Scene 1","settingId":"00000000-0000-4000-8000-000000000004"}]'::jsonb,
 'shotLinks',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000006','boardId',:'production_board','shotId','stable-shot','sceneId','00000000-0000-4000-8000-000000000005','characterIds',jsonb_build_array('00000000-0000-4000-8000-000000000002'),'crewIds',jsonb_build_array('00000000-0000-4000-8000-000000000001'))),
 'futureRoot',jsonb_build_object('keep',true))::text as production_document \gset
select pg_temp.production_assert((public.save_project_production(:'production_project',0,:'production_document')).version=1,'owner create');
select pg_temp.production_assert((public.save_project_production(:'production_project',1,:'production_document')).version=1,'no-op keeps revision');
select pg_temp.production_assert(public.get_project_production(:'production_project')->'document'->'futureRoot'->>'keep'='true','unknown fields persist');
select pg_temp.production_assert(not (public.get_project_production(:'production_project')->'storyboards'->0->'shots'->0 ? 'imagePath'),'read summary excludes private images');
select pg_temp.production_error(format('select public.save_project_production(%L,0,%L)',:'production_project',:'production_document'),'40001');
select pg_temp.production_error(format('select public.save_project_production(%L,null,%L)',:'production_project',:'production_document'),'40001');
select pg_temp.production_error(format('update public.project_production set version=9 where project_id=%L',:'production_project'),'42501');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{people}','[]')),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{people}','null')),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{locations,0,permission}','"invented"')),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{people,0,name}','" "')),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{shotLinks,0,boardId}',to_jsonb(:'unrelated_board'::text))),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{shotLinks,0,shotId}','"missing-shot"')),'22023');
select pg_temp.production_error(format('select public.save_project_production(%L,1,%L)',:'production_project',jsonb_set(:'production_document'::jsonb,'{shotLinks,0,crewIds}','["00000000-0000-4000-8000-000000000099"]')),'22023');
select pg_temp.production_assert((select document->'shots'->0->>'imageCaption'='preserve approved caption' and version=1 from public.storyboards where id=:'production_board'),'storyboard fields and revision unchanged');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select public.accept_project_invitation(:'production_invite');
select pg_temp.production_assert((public.get_project_production(:'production_project')->>'version')::integer=1,'editor reads');
select pg_temp.production_assert((public.save_project_production(:'production_project',1,jsonb_set(:'production_document'::jsonb,'{people,0,job}','"Director"'))).version=2,'editor updates');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000093',true);
select public.accept_project_invitation(:'production_viewer_invite');
select pg_temp.production_assert((public.get_project_production(:'production_project')->>'version')::integer=2,'viewer reads');
select pg_temp.production_error(format('select public.save_project_production(%L,2,%L)',:'production_project',:'production_document'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000094',true);
select pg_temp.production_assert((select count(*)=0 from public.project_production),'outsider row isolation');
select pg_temp.production_error(format('select public.get_project_production(%L)',:'production_project'),'42501');
select pg_temp.production_error(format('select public.save_project_production(%L,2,%L)',:'production_project',:'production_document'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select public.set_project_member(:'production_project','00000000-0000-4000-8000-000000000092',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select pg_temp.production_error(format('select public.get_project_production(%L)',:'production_project'),'42501');
select pg_temp.production_error(format('select public.save_project_production(%L,2,%L)',:'production_project',:'production_document'),'42501');
reset role;
set local role anon;
select pg_temp.production_error('select * from public.project_production','42501');
select pg_temp.production_error(format('select public.get_project_production(%L)',:'production_project'),'42501');
select pg_temp.production_error(format('select public.save_project_production(%L,2,%L)',:'production_project',:'production_document'),'42501');
reset role;
rollback;
select 'Production register permissions, linking, preservation and stale-save checks passed' as result;
