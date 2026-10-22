-- All writes use narrowly scoped RPCs; RLS protects direct reads.
create table public.film_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.film_projects on delete cascade,
  user_id uuid not null references auth.users(id),
  email text not null,
  role text not null check (role in ('editor','commenter','viewer')),
  primary key (project_id,user_id)
);
create table public.storyboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.film_projects on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  document jsonb not null default '{"meta":{},"shots":[]}',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint storyboard_document check (jsonb_typeof(document) = 'object' and jsonb_typeof(document->'meta') = 'object' and jsonb_typeof(document->'shots') = 'array' and document ?& array['meta','shots'] and octet_length(document::text) <= 5242880)
);
create index on public.storyboards(project_id);
create index on public.project_members(user_id);
create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.film_projects on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role text not null check (role in ('editor','commenter','viewer')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.project_invitations(email);

create function app_private.project_role(p_project uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p.owner_id = auth.uid() then 'owner'
    else (select m.role from public.project_members m where m.project_id=p.id and m.user_id=auth.uid()) end
  from public.film_projects p where p.id=p_project
$$;
create function app_private.verified_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null
$$;
-- Schema USAGE is required for policy helper execution, not table access.
grant usage on schema app_private to authenticated;
revoke all on function app_private.project_role(uuid), app_private.verified_email() from public, anon;
grant execute on function app_private.project_role(uuid), app_private.verified_email() to authenticated;

alter table public.film_projects enable row level security;
alter table public.project_members enable row level security;
alter table public.storyboards enable row level security;
alter table public.project_invitations enable row level security;
revoke all on public.film_projects,public.project_members,public.storyboards,public.project_invitations from public,anon,authenticated;
grant select on public.film_projects,public.project_members,public.storyboards,public.project_invitations to authenticated;
create policy project_read on public.film_projects for select to authenticated using (app_private.project_role(id) is not null);
create policy member_read on public.project_members for select to authenticated using (app_private.project_role(project_id) is not null);
create policy storyboard_read on public.storyboards for select to authenticated using (app_private.project_role(project_id) is not null);
create policy invitation_read on public.project_invitations for select to authenticated using (
  app_private.project_role(project_id)='owner' or (email=app_private.verified_email() and revoked_at is null and accepted_at is null and expires_at>now())
);

create function public.create_film_project(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or app_private.verified_email() is null then raise exception 'Verify your email before creating a project.' using errcode='42501'; end if;
  insert into public.film_projects(name,owner_id) values(trim(p_name),auth.uid()) returning id into result;
  return result;
end $$;
create function public.create_storyboard(p_project uuid,p_name text,p_document jsonb) returns public.storyboards
language plpgsql security definer set search_path = '' as $$
declare result public.storyboards;
begin
  -- Serialize permission changes with writes to avoid revoked-member races.
  perform 1 from public.film_projects where id=p_project for update;
  if coalesce(app_private.project_role(p_project),'') not in ('owner','editor') then raise exception 'Editing access required.' using errcode='42501'; end if;
  insert into public.storyboards(project_id,name,document,updated_by) values(p_project,trim(p_name),p_document,auth.uid()) returning * into result;
  return result;
end $$;
create function public.save_storyboard(p_id uuid,p_version integer,p_name text,p_document jsonb) returns public.storyboards
language plpgsql security definer set search_path = '' as $$
declare result public.storyboards; project uuid;
begin
  select project_id into project from public.storyboards where id=p_id;
  perform 1 from public.film_projects where id=project for update;
  if coalesce(app_private.project_role(project),'') not in ('owner','editor') then raise exception 'Editing access required.' using errcode='42501'; end if;
  update public.storyboards set name=trim(p_name),document=p_document,version=version+1,updated_at=now(),updated_by=auth.uid()
    where id=p_id and version=p_version returning * into result;
  if not found then raise exception 'Another member saved this storyboard. Export your changes, then reload the shared version.' using errcode='40001'; end if;
  return result;
end $$;
create function public.invite_project_member(p_project uuid,p_email text,p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform 1 from public.film_projects where id=p_project for update;
  if app_private.project_role(p_project) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
  -- Replace pending invitations instead of leaving conflicting roles active.
  update public.project_invitations set revoked_at=now() where project_id=p_project and email=lower(trim(p_email)) and accepted_at is null and revoked_at is null;
  insert into public.project_invitations(project_id,email,role) values(p_project,lower(trim(p_email)),p_role) returning id into result;
  return result;
end $$;
create function public.accept_project_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.project_invitations; project uuid;
begin
  select project_id into project from public.project_invitations where id=p_id;
  perform 1 from public.film_projects where id=project for update;
  select * into invitation from public.project_invitations where id=p_id for update;
  if not found or invitation.email is distinct from app_private.verified_email() or invitation.expires_at<=now() or invitation.accepted_at is not null or invitation.revoked_at is not null then
    raise exception 'Invitation is unavailable for this account.' using errcode='42501';
  end if;
  if app_private.project_role(project) is null then
    insert into public.project_members(project_id,user_id,email,role) values(project,auth.uid(),app_private.verified_email(),invitation.role);
  end if;
  update public.project_invitations set accepted_at=now() where id=p_id;
  return project;
end $$;
create function public.revoke_project_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare project uuid;
begin
  select project_id into project from public.project_invitations where id=p_id;
  perform 1 from public.film_projects where id=project for update;
  if app_private.project_role(project) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
  update public.project_invitations set revoked_at=now() where id=p_id and accepted_at is null;
end $$;
create function public.set_project_member(p_project uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.film_projects where id=p_project for update;
  if app_private.project_role(p_project) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
  if exists(select 1 from public.film_projects where id=p_project and owner_id=p_user) then raise exception 'Transfer ownership before changing the owner.'; end if;
  if p_role is null then delete from public.project_members where project_id=p_project and user_id=p_user;
  else update public.project_members set role=p_role where project_id=p_project and user_id=p_user;
  end if;
end $$;
create function public.transfer_project_ownership(p_project uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.film_projects where id=p_project for update;
  if app_private.project_role(p_project) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
  if not exists(select 1 from public.project_members where project_id=p_project and user_id=p_user) then raise exception 'Choose an existing member.'; end if;
  delete from public.project_members where project_id=p_project and user_id=p_user;
  insert into public.project_members(project_id,user_id,email,role) values(p_project,auth.uid(),app_private.verified_email(),'editor');
  update public.film_projects set owner_id=p_user where id=p_project;
end $$;
-- Supabase defaults can grant EXECUTE to public. Explicitly restrict every RPC.
revoke all on function public.create_film_project(text),public.create_storyboard(uuid,text,jsonb),public.save_storyboard(uuid,integer,text,jsonb),public.invite_project_member(uuid,text,text),public.accept_project_invitation(uuid),public.revoke_project_invitation(uuid),public.set_project_member(uuid,uuid,text),public.transfer_project_ownership(uuid,uuid) from public,anon;
grant execute on function public.create_film_project(text),public.create_storyboard(uuid,text,jsonb),public.save_storyboard(uuid,integer,text,jsonb),public.invite_project_member(uuid,text,text),public.accept_project_invitation(uuid),public.revoke_project_invitation(uuid),public.set_project_member(uuid,uuid,text),public.transfer_project_ownership(uuid,uuid) to authenticated;
