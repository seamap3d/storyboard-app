# Netlify + Supabase environments

Implements the repository portion of ESNZ story
`ee564b7d-873e-4303-8a44-7a3fe33d45ce`.

## Registered provider projects

| Environment | Supabase project reference | Supabase URL |
| --- | --- | --- |
| Development | `lfvsimzmjhceyvjaoats` | https://lfvsimzmjhceyvjaoats.supabase.co |
| Production | `yvtixpzlsnhgsyksmypm` | https://yvtixpzlsnhgsyksmypm.supabase.co |

Existing Netlify site: https://storyboardafterlive.netlify.app (intended production;
confirm its linked repository and production branch in Netlify). Use this site's
Deploy Previews for development with context-specific Supabase configuration, or
create a separate development site for a stable development URL. The project
references above were supplied by the owner; connectivity and remote setup have
not yet been verified.

## Isolation and configuration

Use the separate Supabase projects above. Connect the existing Netlify site to
this repository with `main` as its production branch. Use Deploy Previews for
development, or optionally connect a second site to your development branch for
a stable development URL. Use the development Supabase project for all previews
and branch deployments. Do not use production credentials/data in
previews. If creating separate production and development branches, protect main
and promote reviewed changes through pull requests.

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` independently in each Netlify
site's build and function environment. On the production site, explicitly override
these for deploy-preview and branch-deploy contexts with development values.
A publishable key (or legacy anon key) is public configuration, not privileged
access. Never configure a service-role/secret key in the frontend. This foundation
needs no privileged Supabase key in Netlify. Keep database passwords and Supabase
CLI access tokens in secure provider/CI settings; never commit them or send them
in chat.

Netlify uses `netlify.toml`, Node 22, `npm run build`, and `dist`. The build emits
only HTML, CSS, and an allowlisted public `runtime-config.json`. It does not publish
the repository root, backlog, environment files, or scripts. The legacy root
`_headers` file is intentionally excluded; its Basic-Auth configuration is not
an application authentication system. The current storyboard still uses localStorage:
this story does not implement login, collaboration, or shared project saving.

## Local build

Node 22+ and Python 3 are required. There are no npm dependencies to install.
Export your development project's URL and publishable key in your terminal, then:

```sh
npm test
APP_ENV=development npm run build
npm run dev
```

Open the local app in your browser and create a shot, edit metadata, reload, and
export JSON. This static server does not emulate Netlify Functions. To exercise
functions locally, use the official Netlify CLI (`netlify dev`) with the development
site linked and its environment configured. `runtime-config.json` establishes
configuration for later integration; the existing storyboard does not consume it yet.

## Database migrations

Install the current supported Supabase CLI using its official installation guide:
https://supabase.com/docs/guides/local-development/cli/getting-started
Record the tested CLI version in release notes. Use Docker for a local Supabase
stack. Initialize local CLI configuration using `supabase init` if needed (do not
overwrite existing configuration). From the repository root:

```sh
supabase start
supabase db reset
```

The CLI applies ordered files in `supabase/migrations`. Reset is for disposable
local databases only. Never reset a remote development or production database.
The initial migration creates a non-exposed, RLS-enabled operational metadata
table without anonymous/authenticated access. Application tables, membership,
private buckets, and access policies belong to later stories. No public bucket
is created by this foundation.

For a remote deployment, authenticate securely with `supabase login`, then:

```sh
supabase link --project-ref YOUR_DEVELOPMENT_PROJECT_REF
supabase db push --dry-run
supabase db push
supabase migration list
```

Verify the linked project reference before each push. Apply to development first;
then repeat with the production project reference after review and a backup/restore
plan appropriate to the chosen plan. Do not edit an applied migration; add a new
migration. Database migrations are intentionally not run by Netlify builds, so a
preview cannot mutate production. Review dry-run output before applying remotely.

## Preview and production smoke checks

1. Run tests and a configured build. Confirm only intended files are in `dist`.
2. Deploy the development branch/PR to Netlify; record its actual HTTPS URL and
   deploy ID. Confirm the public runtime configuration names development and
   points to the development Supabase project.
3. Request `/.netlify/functions/health`: expect HTTP 200 and
   `{"status":"ok","dependency":"supabase-auth"}`. A 503 is a failed check,
   not readiness. This probes Supabase Auth settings; it does not prove database
   migrations or storage permissions. Verify those independently in Supabase.
4. In a clean browser, create a shot, edit metadata, reload to confirm persistence,
   and export JSON. Check console errors and Tailwind/font loading. Data remains
   local to that browser at this milestone.
5. Repeat on the production URL after promoting the same reviewed commit. Confirm
   `environment` is production and the project URL is the production Supabase
   project, then repeat health and browser checks. Record commit, deploy ID, date,
   HTTP outcomes, migration status, and any failures. Roll back the frontend via
   Netlify's previous successful deploy if necessary; database rollback requires
   a separately reviewed forward migration or restore.

## Limits and costs: required before activation

No paid service has been selected or provisioned by this change. Current pricing
has not been verified from this restricted workspace. Check the official pages
before choosing plans, and record the date and actual allowances in the deployment
record rather than relying on remembered free-tier numbers:

- https://www.netlify.com/pricing/ — deploy/build usage, bandwidth, requests,
  functions, preview usage, credits, spending controls, and overage behavior.
- https://supabase.com/pricing — project count, database and private object storage,
  egress, active users, pausing/inactivity, backups and restore, and spend controls.

Two isolated Supabase projects must fit the selected account's project allowance.
Confirm development inactivity/pausing is acceptable and backups meet production
needs. Image storage and downloads may dominate usage. AI API usage is outside
this foundation and billed separately. Do not upgrade without reviewing actual
limits/costs with the owner.

## Current verification and outstanding prerequisites

Repository tests validate configuration filtering, privileged-key rejection,
build output isolation, and health success/failure behavior with stubbed requests.
They are not evidence of a live provider deployment. A preview URL, production
URL, access to the Netlify sites and Supabase projects, applied migration evidence,
and current pricing confirmation are required to complete the story. Neither
provider credentials nor its management tools were available in this session.
