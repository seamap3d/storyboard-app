\set ON_ERROR_STOP on
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement; exception when insufficient_privilege then return; end; raise exception 'Expected permission denial: %',statement; end $$;
-- Local fixture identities from collaboration.sql; role 002 owns Film One.
select id as project from public.film_projects where name='Film One' \gset
select id as board from public.storyboards where name='Opening revised' \gset
select :'project'||'/'||:'board'||'/'||repeat('a',64)||'.png' as path \gset
set role anon;
select pg_temp.denied(format('insert into storage.objects(bucket_id,name) values (%L,%L)','storyboard-images',:'path'));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into storage.objects(bucket_id,name) values('storyboard-images',:'path');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'owner sees upload');
select (public.save_storyboard(:'board',2,'Opening with image',jsonb_build_object('meta','{}'::jsonb,'shots',jsonb_build_array(jsonb_build_object('id','stable-shot-1','imagePath',:'path'))))).version as image_version \gset
select pg_temp.assert_true(:image_version=3,'image reference saved');
-- References must belong to this exact board, and point to an uploaded object.
do $$
declare b public.storyboards; other public.storyboards; project uuid; rejected boolean;
begin
 select * into b from public.storyboards where name='Opening with image';
 rejected:=false;
 begin perform public.save_storyboard(b.id,b.version,b.name,jsonb_build_object('meta','{}'::jsonb,'shots',jsonb_build_array(jsonb_build_object('imagePath',b.project_id::text||'/'||b.id::text||'/'||repeat('b',64)||'.png'))));
 exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Missing image reference was accepted'; end if;
 project:=public.create_film_project('Other image project');
 other:=public.create_storyboard(project,'Other board','{"meta":{},"shots":[]}');
 rejected:=false;
 begin perform public.save_storyboard(other.id,other.version,other.name,b.document);
 exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Cross-project image reference was accepted'; end if;
end $$;
-- Files are immutable: even owner cannot overwrite or delete existing bytes.
update storage.objects set name=name;
delete from storage.objects;
select pg_temp.assert_true((select count(*)=1 from storage.objects),'immutable image remains');
select public.invite_project_member(:'project','viewer@example.test','viewer') as view_invite \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.accept_project_invitation(:'view_invite');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'viewer reads image');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name) values (%L,%L)','storyboard-images',replace(:'path',repeat('a',64),repeat('b',64))));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'outsider cannot read images');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.set_project_member(:'project','00000000-0000-0000-0000-000000000003',null);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'revoked viewer cannot read image');
reset role;
select pg_temp.assert_true((select not public from storage.buckets where id='storyboard-images'),'bucket is private');
select 'Private image policies passed' as result;
