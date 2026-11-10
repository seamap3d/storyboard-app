-- Extend the versioned project register. Existing boards, images and logistics
-- remain untouched; old documents can omit the two optional new collections.
alter function app_private.validate_production(uuid,jsonb) rename to validate_production_core;
create function app_private.validate_production(p_project uuid,doc jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare kind text; item jsonb; key text; identifiers text[] := '{}'; names text[] := '{}'; targets text[] := '{}'; value jsonb; signature text;
begin
  perform app_private.validate_production_core(p_project,doc);
  foreach kind in array array['people','characters','locations','settings','scenes','shotLinks'] loop
    select identifiers || coalesce(array_agg(entity->>'id'),'{}') into identifiers from jsonb_array_elements(doc->kind) entity;
  end loop;
  foreach kind in array array['resources','resourceLinks'] loop
    if not doc ? kind then continue; end if;
    if jsonb_typeof(doc->kind) is distinct from 'array' then raise exception 'Production resource collections must be arrays.' using errcode='22023'; end if;
    if jsonb_array_length(doc->kind)>1000 then raise exception 'Production resource collection exceeds 1000 records.' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(doc->kind) loop
      if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string' or coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Production resource needs a stable UUID.' using errcode='22023'; end if;
      if item->>'id'=any(identifiers) then raise exception 'Production IDs must be unique.' using errcode='22023'; end if;
      identifiers := array_append(identifiers,item->>'id');
      foreach key in array array['name','category','unit','providedBy','responsiblePersonId','readiness','availability','collectionNotes','returnNotes','notes','resourceId','boardId','shotId'] loop
        if item ? key and (jsonb_typeof(item->key)<>'string' or length(item->>key)>4000) then raise exception 'Production resource fields must be text under 4000 characters.' using errcode='22023'; end if;
      end loop;
      foreach key in array array['availableQuantity','requiredQuantity','allocatedQuantity'] loop
        if item ? key then
          value := item->key;
          if value <> '""'::jsonb then
            if jsonb_typeof(value)<>'number' then raise exception 'Production quantities must be numbers or blank.' using errcode='22023'; end if;
            if (value::text)::numeric<0 or (value::text)::numeric>1000000 then raise exception 'Production quantity is outside 0-1000000.' using errcode='22023'; end if;
          end if;
        end if;
      end loop;
      if kind='resources' then
        if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(regexp_replace(item->>'name','\s+',' ','g'))) < 1 or length(item->>'name')>160 or coalesce(item->>'category','') not in ('prop','equipment') then raise exception 'Production resource needs a name and prop/equipment category.' using errcode='22023'; end if;
        if item ? 'readiness' and item->>'readiness' not in ('needed','sourcing','ready','on set','returned') then raise exception 'Production resource readiness is invalid.' using errcode='22023'; end if;
        if coalesce(item->>'responsiblePersonId','')<>'' and not exists(select 1 from jsonb_array_elements(doc->'people') person where person->>'id'=item->>'responsiblePersonId') then raise exception 'Production resource responsible person is unavailable.' using errcode='22023'; end if;
        signature := (item->>'category')||':'||lower(trim(regexp_replace(item->>'name','\s+',' ','g')));
        if signature=any(names) then raise exception 'Production resource already exists. Reuse its stable ID.' using errcode='22023'; end if;
        names := array_append(names,signature);
      end if;
    end loop;
  end loop;
  -- Cross references are checked after collection shape, including legacy docs.
  -- An unchanged saved target can become unavailable after a source shot is
  -- deleted. Retain and flag it for review; reject new/retargeted invalid links.
  for item in select * from jsonb_array_elements(coalesce(doc->'resourceLinks','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(doc->'resources','[]'::jsonb)) resource where resource->>'id'=item->>'resourceId') then raise exception 'Production resource link is missing. Remove assignments before deleting.' using errcode='22023'; end if;
    if coalesce(item->>'boardId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(item->>'shotId','')='' then raise exception 'Production resource assignment requires a storyboard and shot.' using errcode='22023'; end if;
    if not exists(select 1 from public.storyboards board, jsonb_array_elements(board.document->'shots') shot where board.id=(item->>'boardId')::uuid and board.project_id=p_project and shot->>'id'=item->>'shotId') and not exists(select 1 from public.project_production previous, jsonb_array_elements(coalesce(previous.document->'resourceLinks','[]'::jsonb)) saved where previous.project_id=p_project and saved->>'id'=item->>'id' and saved->>'resourceId'=item->>'resourceId' and saved->>'boardId'=item->>'boardId' and saved->>'shotId'=item->>'shotId') then raise exception 'Production resource shot is unavailable in this project.' using errcode='22023'; end if;
    signature := (item->>'resourceId')||':'||(item->>'boardId')||':'||(item->>'shotId');
    if signature=any(targets) then raise exception 'Production resource is already linked to this shot.' using errcode='22023'; end if;
    targets := array_append(targets,signature);
  end loop;
end $$;
revoke all on function app_private.validate_production(uuid,jsonb) from public,anon,authenticated;

create or replace function app_private.save_project_production(p_project uuid,p_version integer,p_document jsonb)
returns public.project_production language plpgsql security definer set search_path = '' as $$
declare result public.project_production; candidate jsonb := p_document;
begin
  perform 1 from public.film_projects where id=p_project for update;
  if auth.uid() is null or coalesce(app_private.project_role(p_project),'') not in ('owner','editor') then raise exception 'Editing access required.' using errcode='42501'; end if;
  select * into result from public.project_production where project_id=p_project;
  if p_version is null or p_version<0 or p_version<>coalesce(result.version,0) then raise exception 'Production register changed. Reload it before saving; keep your edits for comparison.' using errcode='40001'; end if;
  -- Older clients retain their original document shape. Omitted new collections
  -- preserve stored resources instead of silently deleting them.
  if candidate is not null and jsonb_typeof(candidate)='object' then
    if not candidate ? 'resources' and result.document ? 'resources' then candidate := candidate || jsonb_build_object('resources',result.document->'resources'); end if;
    if not candidate ? 'resourceLinks' and result.document ? 'resourceLinks' then candidate := candidate || jsonb_build_object('resourceLinks',result.document->'resourceLinks'); end if;
  end if;
  perform app_private.validate_production(p_project,candidate);
  if result.document=candidate then return result; end if;
  insert into public.project_production(project_id,document,version,updated_by) values(p_project,candidate,p_version+1,auth.uid())
    on conflict(project_id) do update set document=excluded.document,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by returning * into result;
  return result;
end $$;

-- Retain the original invoker read/ACL check and add only necessary shot fields;
-- no image bytes, private image paths or unrelated document metadata are exposed.
alter function public.get_project_production(uuid) set schema app_private;
alter function app_private.get_project_production(uuid) rename to get_project_production_core;
create function public.get_project_production(p_project uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; boards jsonb;
begin
  result := app_private.get_project_production_core(p_project);
  select coalesce(jsonb_agg(jsonb_build_object('id',board.id,'name',board.name,'requirements',
    (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',legacy->>'id','kind',legacy->>'kind','name',legacy->>'name','quantity',legacy->'quantity','providedBy',legacy->>'providedBy','readiness',legacy->>'readiness','notes',legacy->>'notes'))),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(board.document#>'{planning,requirements}')='array' then board.document#>'{planning,requirements}' else '[]'::jsonb end) legacy),
    'shots',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',shot->>'id','name',coalesce(nullif(shot->>'customTitle',''),shot->>'scene','Shot'),
      'desc',shot->>'desc','type',shot->>'type','lens',shot->>'lens','move',shot->>'move','chars',shot->>'chars','notes',shot->>'notes',
      'scene',shot->>'scene','location',shot->>'location','props',shot->>'props','equipment',shot->>'equipment',
      'shootDate',shot->>'shootDate','status',shot->>'status','estimatedMinutes',shot->'estimatedMinutes'))), '[]'::jsonb)
      from jsonb_array_elements(board.document->'shots') shot))), '[]'::jsonb)
    into boards from public.storyboards board where board.project_id=p_project;
  return result || jsonb_build_object('storyboards',boards);
end $$;
revoke all on function public.get_project_production(uuid) from public,anon;
grant execute on function public.get_project_production(uuid) to authenticated;
-- Both read functions are invokers with the same project visibility check.
