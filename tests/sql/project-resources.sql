begin;
create function pg_temp.resource_assert(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Resource assertion failed: %',label; end if; end $$;
create function pg_temp.resource_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate=expected then return; end if; raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm; end; raise exception 'Expected error %',expected; end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000111','resource-owner@example.test',now()),
 ('00000000-0000-4000-8000-000000000112','resource-editor@example.test',now()),
 ('00000000-0000-4000-8000-000000000113','resource-viewer@example.test',now()),
 ('00000000-0000-4000-8000-000000000114','resource-outsider@example.test',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true);
select public.create_film_project('Resource fixture') as resources_project \gset
select public.create_film_project('Other resource fixture') as resources_other \gset
select (public.create_storyboard(:'resources_project','First board','{"meta":{"retain":true},"planning":{"requirements":[{"kind":"prop","name":"Radio","quantity":2,"providedBy":"Earlier supplier","notes":"Preserve legacy"}]},"shots":[{"id":"first","props":"Radio","equipment":"Recorder","imageCaption":"Approved caption","desc":"Keep action","shootDate":"2026-11-10"}]}')).id as resources_board \gset
select (public.create_storyboard(:'resources_project','Second board','{"meta":{},"shots":[{"id":"second","props":"radio"}]}')).id as resources_second \gset
select (public.create_storyboard(:'resources_other','Foreign board','{"meta":{},"shots":[{"id":"foreign","props":"Radio"}]}')).id as resources_foreign \gset
select public.get_project_production(:'resources_project')->'document' as resources_legacy \gset
select (:'resources_legacy'::jsonb || jsonb_build_object('futureRoot',true,'resources',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000001','name','Radio','category','prop','availableQuantity',''::text,'readiness','needed','sourceDetails',jsonb_build_array('Legacy provenance'))),'resourceLinks',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000002','resourceId','00000000-0000-4000-8000-000000000001','boardId',:'resources_board','shotId','first','requiredQuantity',''::text),jsonb_build_object('id','00000000-0000-4000-8000-000000000003','resourceId','00000000-0000-4000-8000-000000000001','boardId',:'resources_second','shotId','second','allocatedQuantity',''::text))))::text as resources_doc \gset
select pg_temp.resource_assert((public.save_project_production(:'resources_project',0,:'resources_doc')).version=1,'cross-board resource links save');
select pg_temp.resource_assert((public.save_project_production(:'resources_project',1,:'resources_doc')).version=1,'identical resource no-op');
select pg_temp.resource_assert(public.get_project_production(:'resources_project')->'storyboards'->0->'shots'->0 ? 'props','read supplies source mentions');
select pg_temp.resource_assert(not(public.get_project_production(:'resources_project')->'storyboards'->0->'shots'->0 ? 'imageCaption'),'read omits image metadata');
select pg_temp.resource_error(format('select public.save_project_production(%L,0,%L)',:'resources_project',:'resources_doc'),'40001');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources,0,availableQuantity}','-1')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources,0,availableQuantity}','"2"')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources,0,availableQuantity}','null')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resourceLinks,0,requiredQuantity}','1000001')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resourceLinks,0,boardId}',to_jsonb(:'resources_foreign'::text))),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources}','[]')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources,0,responsiblePersonId}','"00000000-0000-4000-8000-000000000099"')),'22023');
select pg_temp.resource_error(format('select public.save_project_production(%L,1,%L)',:'resources_project',jsonb_set(:'resources_doc'::jsonb,'{resources}',(:'resources_doc'::jsonb->'resources') || '[{"id":"00000000-0000-4000-8000-000000000004","name":" RADIO ","category":"prop"}]'::jsonb)),'22023');
-- Old clients can still save their six original collections without erasing resources.
select pg_temp.resource_assert((public.save_project_production(:'resources_project',1,(:'resources_doc'::jsonb-'resources'-'resourceLinks') || '{"futureRoot":"old-client update"}')).version=2,'legacy shape save');
select pg_temp.resource_assert(jsonb_array_length(public.get_project_production(:'resources_project')->'document'->'resources')=1,'old client retains resource records');
select pg_temp.resource_assert(jsonb_array_length(public.get_project_production(:'resources_project')->'document'->'resourceLinks')=2,'old client retains links');
select pg_temp.resource_assert((public.save_project_production(:'resources_project',2,jsonb_set(:'resources_doc'::jsonb,'{resources,0,availableQuantity}','0'))).version=3,'zero is known, not missing');
select pg_temp.resource_assert((select document->'shots'->0->>'desc'='Keep action' and document#>>'{planning,requirements,0,notes}'='Preserve legacy' and version=1 from public.storyboards where id=:'resources_board'),'source text, metadata, legacy logistics and board version preserved');
select public.invite_project_member(:'resources_project','resource-editor@example.test','editor') as resources_invite \gset
select public.invite_project_member(:'resources_project','resource-viewer@example.test','viewer') as resources_viewer_invite \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000112',true);
select public.accept_project_invitation(:'resources_invite');
select pg_temp.resource_assert((public.save_project_production(:'resources_project',3,jsonb_set(:'resources_doc'::jsonb,'{resources,0,availableQuantity}','2.5'))).version=4,'editor fractional unit quantity');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000113',true);
select public.accept_project_invitation(:'resources_viewer_invite');
select pg_temp.resource_assert((public.get_project_production(:'resources_project')->>'version')::int=4,'viewer reads project resources');
select pg_temp.resource_error(format('select public.save_project_production(%L,4,%L)',:'resources_project',:'resources_doc'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000114',true);
select pg_temp.resource_error(format('select public.get_project_production(%L)',:'resources_project'),'42501');
select pg_temp.resource_error(format('select public.save_project_production(%L,4,%L)',:'resources_project',:'resources_doc'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true);
select public.set_project_member(:'resources_project','00000000-0000-4000-8000-000000000112',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000112',true);
select pg_temp.resource_error(format('select public.save_project_production(%L,4,%L)',:'resources_project',:'resources_doc'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true);
select public.save_storyboard(:'resources_board',1,'Removed source shot','{"meta":{},"shots":[]}');
select pg_temp.resource_assert((public.save_project_production(:'resources_project',4,:'resources_doc')).version=5,'unchanged unavailable resource targets can be retained and reviewed');
select pg_temp.resource_assert((public.save_project_production(:'resources_project',5,jsonb_set(:'resources_doc'::jsonb,'{resourceLinks}',jsonb_build_array((:'resources_doc'::jsonb->'resourceLinks'->1))))).version=6,'unavailable links can be removed without deleting inventory');
reset role;
set local role anon;
select pg_temp.resource_error(format('select public.get_project_production(%L)',:'resources_project'),'42501');
select pg_temp.resource_error(format('select public.save_project_production(%L,4,%L)',:'resources_project',:'resources_doc'),'42501');
reset role;
rollback;
select 'Resource quantities, cross-board links, legacy-client preservation, no-op/stale and role/isolation checks passed' as result;
