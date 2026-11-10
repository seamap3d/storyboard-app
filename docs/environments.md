# Supabase environments

The Film Planner is hosted only on ChatGPT Sites. See [Sites setup](sites.md)
for runtime configuration and publication. The retired Netlify app, functions,
OAuth consent pages, build configuration and duplicate tests have been removed.
Git history retains their earlier implementation.

## Database separation

- Development: `storyboard-dev`, project `lfvsimzmjhceyvjaoats`.
- Production: `storyboard-prod`, project `yvtixpzlsnhgsyksmypm`.

The active Site currently uses development. Production promotion and its smoke
checks remain outstanding. Never change runtime database values as part of an
ordinary source sync. Keep credentials in provider settings; never commit them
or request secret values in chat. The app uses publishable configuration and the
current user's token, not a service-role key.

## Versioned migrations

Ordered migrations are in `supabase/migrations/`. They cover environment metadata,
shared projects and memberships, private images, production records and resources.
Do not edit applied migrations; add a new migration. Builds do not apply SQL.

`npm run test:db` checks migrations and access policies against a disposable local
PostgreSQL container with synthetic fixtures in `tests/sql/`. It does not contact
remote projects or prove live collaborator acceptance.

For remote migration work, use the supported Supabase CLI and secure provider
authentication. Verify the exact project reference before every operation:

```sh
supabase link --project-ref YOUR_DEVELOPMENT_PROJECT_REF
supabase db push --dry-run
supabase db push
supabase migration list
```

Review the dry-run before applying. Apply and verify development first; production
requires its separately reviewed workflow and backup/restore plan. Never reset a
remote database. Any local reset is restricted to disposable data.

## Live acceptance

Verify normal website sign-in/recovery, shared save/reload, private image access,
project role isolation and provider connector access using approved fixtures.
Preserve real film records and private images. Mock browser checks and local SQL
checks are useful evidence but do not establish live email/onboarding, connector
write acceptance or production readiness. Review current hosting/database limits,
private storage, egress, backups and costs before selecting paid services.

## Netlify hosting retirement

Repository cleanup does not delete a Netlify project or its previous deployments.
The last observed preview belonged to `aoawproductions-storyboard`, site ID
`5b2d3f7e-48d2-4ace-9488-bd87a3e9200e`:
https://app.netlify.com/projects/aoawproductions-storyboard/configuration/general

Delete that retired project in the authenticated Netlify dashboard to remove its
hosted deployments and repository build integration. An earlier project URL,
https://storyboardafterlive.netlify.app, was also recorded in the historical
handoff; verify ownership and identity before retiring any separate project.
Do not delete Supabase projects, databases, buckets or the active Film Planner
Site while retiring Netlify. This session has no authenticated Netlify connection
or browser-control tool, so hosted deletion has not been verified.
