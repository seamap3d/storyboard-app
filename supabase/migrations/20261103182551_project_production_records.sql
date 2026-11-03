-- Project-wide production planning is independent of storyboard JSON and images.
create table public.project_production (
  project_id uuid primary key references public.film_projects(id) on delete cascade,
  document jsonb not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
alter table public.project_production enable row level security;
revoke all on public.project_production from public, anon, authenticated;
grant select on public.project_production to authenticated;
create policy production_read on public.project_production for select to authenticated
  using (app_private.project_role(project_id) is not null);

create function app_private.validate_production(p_project uuid, doc jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare kind text; record jsonb; item jsonb; pair record; target text; reference text; ids text[] := '{}'; targets text[] := '{}';
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 1048576 then
    raise exception 'Production register must be an object under 1 MiB.' using errcode='22023';
  end if;
  foreach kind in array array['people','characters','locations','settings','scenes','shotLinks'] loop
    if jsonb_typeof(doc->kind) is distinct from 'array' then
      raise exception 'Production collections must be arrays.' using errcode='22023';
    end if;
    if jsonb_array_length(doc->kind)>1000 then raise exception 'Production collection exceeds 1000 records.' using errcode='22023'; end if;
    for record in select value from jsonb_array_elements(doc->kind) loop
      if jsonb_typeof(record)<>'object' or jsonb_typeof(record->'id') is distinct from 'string'
        or (record->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Production record needs a stable UUID.' using errcode='22023';
      end if;
      if record->>'id'=any(ids) then raise exception 'Production IDs must be unique.' using errcode='22023'; end if;
      ids := array_append(ids,record->>'id');
      if kind<>'shotLinks' and (jsonb_typeof(record->'name') is distinct from 'string' or length(trim(record->>'name')) not between 1 and 160) then
        raise exception 'Production name must contain 1-160 characters.' using errcode='22023';
      end if;
      for pair in select * from jsonb_each(record) loop
        if pair.key=any(array['name','job','email','phone','availability','callNotes','notes','address','contact','access','parking','travel','permission','performerId','locationId','settingId','boardId','shotId','sceneId']) then
          if jsonb_typeof(pair.value)<>'string' or length(pair.value#>>'{}')>4000 then raise exception 'Production field must be text under 4000 characters.' using errcode='22023'; end if;
        end if;
      end loop;
      if kind='locations' and record ? 'permission' and record->>'permission' not in ('unconfirmed','requested','confirmed') then raise exception 'Production permission has an invalid choice.' using errcode='22023'; end if;
    end loop;
  end loop;
  -- Check references only after every collection has passed shape validation.
  foreach kind in array array['characters','settings','scenes','shotLinks'] loop
    for record in select value from jsonb_array_elements(doc->kind) loop
      for pair in select * from jsonb_each_text(case kind
        when 'characters' then '{"performerId":"people"}'::jsonb
        when 'settings' then '{"locationId":"locations"}'::jsonb
        when 'scenes' then '{"settingId":"settings"}'::jsonb
        else '{"sceneId":"scenes"}'::jsonb end) loop
        reference := record->>pair.key;
        if coalesce(reference,'')<>'' and not exists(select 1 from jsonb_array_elements(doc->pair.value) entity where entity->>'id'=reference) then
          raise exception 'Production link is missing. Remove assignments before deleting a record.' using errcode='22023';
        end if;
      end loop;
      if kind='shotLinks' then
        foreach target in array array['characterIds','crewIds'] loop
          if record ? target then
            if jsonb_typeof(record->target)<>'array' then raise exception 'Production links must be arrays.' using errcode='22023'; end if;
            if jsonb_array_length(record->target)>100 or (select count(*)<>count(distinct value) from jsonb_array_elements(record->target)) then raise exception 'Production links must be unique and at most 100.' using errcode='22023'; end if;
            for item in select value from jsonb_array_elements(record->target) loop
              if jsonb_typeof(item)<>'string' or not exists(select 1 from jsonb_array_elements(doc->(case target when 'crewIds' then 'people' else 'characters' end)) entity where entity->>'id'=item#>>'{}') then
                raise exception 'Production assignment references a missing record.' using errcode='22023';
              end if;
            end loop;
          end if;
        end loop;
        if coalesce(record->>'boardId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or coalesce(record->>'shotId','')='' then raise exception 'Production assignment requires a storyboard and shot.' using errcode='22023'; end if;
        if not exists(select 1 from public.storyboards board, jsonb_array_elements(board.document->'shots') shot
          where board.id=(record->>'boardId')::uuid and board.project_id=p_project and shot->>'id'=record->>'shotId') then
          raise exception 'Production assignment shot is unavailable in this project.' using errcode='22023';
        end if;
        target := (record->>'boardId') || ':' || (record->>'shotId');
        if target=any(targets) then raise exception 'A shot can have only one production assignment.' using errcode='22023'; end if;
        targets := array_append(targets,target);
      end if;
    end loop;
  end loop;
end $$;

-- Definer scope is private and narrow: tables are read-only to API roles. The
-- project lock uses the same order as membership changes, closing revocation races.
create function app_private.save_project_production(p_project uuid,p_version integer,p_document jsonb)
returns public.project_production language plpgsql security definer set search_path = '' as $$
declare result public.project_production;
begin
  perform 1 from public.film_projects where id=p_project for update;
  if auth.uid() is null or coalesce(app_private.project_role(p_project),'') not in ('owner','editor') then
    raise exception 'Editing access required.' using errcode='42501';
  end if;
  select * into result from public.project_production where project_id=p_project;
  if p_version is null or p_version<0 or p_version<>coalesce(result.version,0) then
    raise exception 'Production register changed. Reload it before saving; keep your edits for comparison.' using errcode='40001';
  end if;
  perform app_private.validate_production(p_project,p_document);
  if result.document=p_document then return result; end if;
  insert into public.project_production(project_id,document,version,updated_by)
    values(p_project,p_document,p_version+1,auth.uid())
    on conflict(project_id) do update set document=excluded.document,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by
    returning * into result;
  return result;
end $$;
create function public.save_project_production(p_project uuid,p_version integer,p_document jsonb)
returns public.project_production language sql security invoker set search_path = '' as $$
  select app_private.save_project_production(p_project,p_version,p_document)
$$;
create function public.get_project_production(p_project uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; boards jsonb;
begin
  if not exists(select 1 from public.film_projects where id=p_project) then raise exception 'Project not found or access denied.' using errcode='42501'; end if;
  select jsonb_build_object('project_id',project_id,'version',version,'document',document) into result
    from public.project_production where project_id=p_project;
  select coalesce(jsonb_agg(jsonb_build_object('id',board.id,'name',board.name,'shots',
    (select coalesce(jsonb_agg(jsonb_build_object('id',shot->>'id','name',coalesce(nullif(shot->>'customTitle',''),shot->>'scene','Shot'),'scene',shot->>'scene')), '[]'::jsonb)
      from jsonb_array_elements(board.document->'shots') shot))), '[]'::jsonb)
    into boards from public.storyboards board where board.project_id=p_project;
  return coalesce(result,jsonb_build_object('project_id',p_project,'version',0,'document',
    '{"people":[],"characters":[],"locations":[],"settings":[],"scenes":[],"shotLinks":[]}'::jsonb)) || jsonb_build_object('storyboards',boards);
end $$;
revoke all on function app_private.validate_production(uuid,jsonb),app_private.save_project_production(uuid,integer,jsonb),public.save_project_production(uuid,integer,jsonb),public.get_project_production(uuid) from public,anon;
revoke all on function app_private.validate_production(uuid,jsonb) from authenticated;
grant execute on function app_private.save_project_production(uuid,integer,jsonb),public.save_project_production(uuid,integer,jsonb),public.get_project_production(uuid) to authenticated;
