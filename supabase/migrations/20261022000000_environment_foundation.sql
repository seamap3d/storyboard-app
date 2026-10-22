-- Operational metadata only. Project membership and production data are
-- deliberately deferred to the collaboration stories.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.environment_metadata (
  singleton boolean primary key default true check (singleton),
  schema_version text not null,
  installed_at timestamptz not null default now()
);

alter table app_private.environment_metadata enable row level security;
revoke all on app_private.environment_metadata from public, anon, authenticated;

insert into app_private.environment_metadata (singleton, schema_version)
values (true, '20261022000000');
