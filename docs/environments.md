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
only HTML, CSS, browser modules, and an allowlisted public `runtime-config.json`. It does not publish
the repository root, backlog, environment files, or scripts. The legacy root
`_headers` file is intentionally excluded; its Basic-Auth configuration is not
an application authentication system. Browser drafts use IndexedDB, with migration from legacy localStorage. Shared-project setup and its
additional migration are described below.

## Local build

Node 22+ and Python 3 are required. The build has no runtime npm dependencies; `npm ci` installs development-only browser test tooling.
Export your development project's URL and publishable key in your terminal, then:

```sh
npm test
APP_ENV=development npm run build
npm run dev
```

Open the local app in your browser and create a shot, edit metadata, reload, and
export JSON. This static server does not emulate Netlify Functions. To exercise
functions locally, use the official Netlify CLI (`netlify dev`) with the development
site linked and its environment configured. `runtime-config.json` configures the shared-project client. A fixture key can
exercise the static build but cannot authenticate with Supabase.

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

## Shared projects and multiple storyboards (review branch)

The collaboration migration `20261022215928_shared_storyboards.sql` adds film
projects, project membership, invitations, and versioned storyboard documents.
Apply **both ordered migrations to development first**, using the CLI workflow
above. Do not paste these files into production without migration history checks.
The application reads public runtime configuration and talks to Supabase Auth and
PostgREST with the signed-in user's JWT. No service-role key is needed.

In Netlify, classify `SUPABASE_URL` and a verified publishable/legacy anon key as
public configuration (not secret values): they intentionally appear in
`runtime-config.json`. Keep secret scanning enabled and never exempt privileged
keys. Netlify secret scanning previously blocked the preview for `SUPABASE_URL`.

In Supabase Auth, enable email/password accounts with email confirmation. Set the
site URL and allowed redirect URLs to the exact development preview and production
URLs used for confirmation and password recovery. Restrict production redirects
to reviewed application URLs. The app supports sign-up, password sign-in,
recovery-link password changes, token refresh, and sign-out. Session tokens are
stored in sessionStorage for this tab, not in storyboard exports. Configure/test
provider email delivery and rate limits before inviting the pilot team; no paid
email service is selected by this implementation.

Users can create separate film projects and multiple named storyboards per
project. Shared changes require **Save storyboard**; the UI clearly distinguishes
unsaved changes, failures and version conflicts. Reload after a conflict only
after exporting any edits you want to keep. There is no realtime merge. Owners
can invite verified email recipients as editor, commenter or viewer, change
member roles, remove members, revoke pending invitations, and transfer ownership
to an existing member. The original owner becomes an editor. Invitations last
seven days and can only be accepted once by the intended verified account.
Invitations appear in the recipient's signed-in app; **no invitation email is
sent**. The owner shares the app link through their existing communication
channel, with no additional delivery cost. Refresh to discover new invitations.
Commenters currently have read access; commenting itself is a separate story.

The browser draft is stored in IndexedDB; old localStorage data is migrated and
kept as a fallback backup. Opening a shared storyboard does not overwrite it; **Copy browser draft to project** makes
a separate shared copy. JSON import/export still works on the selected board.
Do not clear browser storage until you have verified a shared copy and export.
Shared document content is kept in memory rather than the browser draft; unsaved
shared edits require saving or exporting before closing the tab.

Current storage unit: a versioned JSON document per storyboard, preserving all
existing shot fields and stable shot IDs. Shared saves move embedded raster images into the private `storyboard-images`
bucket and retain project/storyboard-scoped references in the document. The
**5 MiB limit applies to text/metadata JSON**, with a separate **5 MiB per image**
limit; the combined image library can be larger. Normalized scene/shot records,
comments, project deletion/renaming, and realtime collaboration are follow-up work.
Membership revocation stops subsequent backend reads/writes; it cannot erase
copies someone has already viewed or exported.

### Repeatable local verification

```sh
npm ci
npm test
npm run test:db
# Build with development configuration, then install a Chromium test browser:
npx playwright install chromium
npm run test:browser
# Or use an already-installed Chromium:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`test:db` starts a disposable PostgreSQL 17 Alpine container with no published
ports and removes it afterwards. It supplies a minimal Auth schema/roles fixture,
applies ordered migrations and exercises SQL access policies/RPCs as different
users. It does not emulate the complete hosted Supabase service or prove remote
migration state. Docker socket access is required. Playwright is development-only;
it is not shipped in the public build. Browser tests stub Supabase HTTP responses;
SQL tests independently validate backend role enforcement.

Before promoting: apply migrations to development; verify sign-up/confirmation,
password recovery, actual cross-device saves, all roles, invitations, revoked
access and simultaneous edits with real pilot accounts. The preview foundation
health endpoint has been confirmed by the owner, but health probes only Auth
connectivity, not these workflows. Production migration, pricing/limits review,
and production smoke checks remain outstanding.


## Development migration deployment — 23 October 2026 (Auckland)

Authenticated Supabase MCP access is working for `storyboard-dev`, reference
`lfvsimzmjhceyvjaoats` (PostgreSQL 17.11). Initial inspection found no application
tables or recorded migrations. The two repository migrations were applied using
Supabase MCP and verified in its migration history:

| Recorded version | Migration |
| --- | --- |
| `20261022214509` | `environment_foundation` |
| `20261022215928` | `shared_storyboards` |

MCP assigns application-time migration versions. Repository filenames were renamed
to these exact versions without changing SQL contents. Use the updated collaboration
branch before future CLI pushes; old filenames would appear unapplied and attempt
to recreate existing tables. The foundation metadata's `schema_version` remains its
original logical version marker, independent of the deployment timestamp.

Verified remotely: RLS is enabled on all five application/private tables; anonymous
roles cannot read them; authenticated users cannot write directly; all eight public
write RPCs deny anonymous execution. Transactional negative-access checks passed
and were rolled back without adding application records.

Security advisor findings: one informational notice for the intentionally
policy-free private metadata table (all client access is revoked), plus eight
warnings for intentionally authenticated `SECURITY DEFINER` RPCs. These RPCs have
explicit identity/membership/role checks, fixed empty search paths, and revoked
anonymous/PUBLIC execution. Preserve these checks; review this API design before
production. References:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

The first collaboration application attempt returned an MCP request-state error.
History and tables were rechecked before retrying; no collaboration schema had been
installed. The subsequent application succeeded and both migrations are recorded.

No production project was contacted or modified by this deployment. Real email
confirmation/recovery, redirects, cross-device saves, membership flows, and conflict
checks through the hosted app remain to be verified with development accounts.
MCP database access does not itself configure Auth settings. The earlier local
and mocked-browser tests remain supporting evidence, not substitutes for those checks.

## Hosted collaboration smoke check — 23 October 2026 (Auckland)

`tests/sql/hosted-collaboration-smoke.sql` was executed against development only.
It inserts random temporary identity fixtures within one transaction, simulates
JWT subject changes at the SQL layer, exercises the real installed RPCs and RLS,
and rolls back every fixture row. It passed project/board creation, reading an
editor's save as the owner, multiple boards, cross-project isolation, viewer write
denial, stale-version conflict detection, and revoked-member access denial.
This validates hosted SQL behavior, not password sign-in, JWT issuance, PostgREST,
email delivery, browser UI or cross-device persistence. No real emails were sent.

The workspace still receives proxy HTTP 403 when requesting the preview. Supabase
MCP provides database access but no Auth configuration editor. Real browser/email
checks require the owner's browser and inbox until those capabilities are available.

Sign-up now explicitly requests the originating app URL as its confirmation
redirect, matching recovery's existing behavior. Supabase must allow that URL;
otherwise its Site URL fallback can take the user elsewhere.

### Owner-assisted development Auth check

1. Open development Auth URL Configuration:
   https://supabase.com/dashboard/project/lfvsimzmjhceyvjaoats/auth/url-configuration
2. Set the development Site URL to
   `https://deploy-preview-3--storyboardafterlive.netlify.app/` and include that exact
   address in allowed Redirect URLs. Keep production configuration separate.
3. Confirm email/password accounts and email confirmation are enabled. If delivery
   is restricted by the default mail service, use an allowed team address for the
   pilot or review SMTP configuration and costs before selecting a provider.
4. Open the preview, select Create account, use your own email and a private
   password, then follow the confirmation email. Do not share the password,
   confirmation URL, access token or refresh token in chat.
5. Confirm return to the preview and successful sign-in. Create a film project,
   add two named storyboards, add/edit a shot and click Save storyboard. Switch
   between storyboards, reload, select the project again, and confirm saved content.
6. Repeat sign-in in a separate browser/device to verify actual cross-device saves.
   Report outcomes or error messages without credentials. Recovery and real
   multi-account membership testing remain separate pending checks.


## JSON import storage fix — 23 October 2026 (Auckland)

The owner confirmed development sign-up and email confirmation returned to the
preview successfully. They then reported a browser-storage warning when importing
an existing storyboard JSON file. Embedded images can exceed localStorage's small
string quota. The old code kept failed imports on screen but reread an older saved
copy when copying a browser draft into shared storage.

Browser drafts now use IndexedDB. Initial load migrates legacy localStorage data
without deleting it, waits for hydration before enabling editing, and serializes
saves. A status line reports saving/saved/failed state. Failed saves retain the
latest in-memory document, allow export and shared-copy attempts, and warn before
closing. Copy browser draft reads this current document rather than stale storage.
No repeated quota alert is shown on every edit.

Chromium regression checks cover legacy migration, importing and reloading a
6 MiB JSON document that exceeds localStorage quota, failed-save preservation,
export availability and subsequent storage recovery. Shared copy/save additionally
reports the existing 5 MiB document limit before sending oversized requests. This
does not increase the Supabase document limit or implement object storage. Large
image libraries still require the dedicated private-image storage story.


## Full-size storyboard import and private images — 23 October 2026

The owner's multipart archive was successfully reassembled and inspected. Its JSON
is 52,590,678 bytes, with 31 shots and 18 PNG images (39,421,119 decoded image
bytes). Largest image: 2,948,213 bytes. It also contains custom shot titles, layout,
active-tab and scene-color settings. The format is valid; embedded images exceeded
the old whole-document shared limit. A separate loss-of-fields issue was fixed:
unknown document/shot metadata and custom titles now survive editing and exports.
Custom titles are displayed and editable; layout settings remain preserved even
where the current UI does not expose their original controls.

Development migration `20261023002713_private_storyboard_images.sql` creates a
private `storyboard-images` bucket, five-MiB per-file/type restrictions, membership
read policies, owner/editor-only insertion, and a database trigger rejecting missing
or cross-storyboard image references. No public URLs or service-role keys are used.
The trigger is internal-only; the policy helper is private with fixed search_path.
The migration was created with the official CLI and its filename aligned to the
actual MCP-recorded version after development deployment. Production was untouched.

Shared Save uploads images losslessly and sequentially, showing progress, then
commits the small metadata document through the existing version-checked RPC.
Paths are project UUID / storyboard UUID / SHA-256 content hash plus extension.
Identical images are reused within the same board. A failed upload or conflicting
save does not overwrite the saved JSON or remove the source draft. Successful
uploads from an interrupted save may remain unreferenced until a separately
reviewed cleanup process is added. They stay private. Objects are immutable:
no update/delete policy is granted, so replacing/removing an image changes the
reference while retaining old bytes for safety. Do not delete Storage metadata
manually or promise automatic orphan cleanup.

Loading a shared storyboard downloads private images with the user's JWT and
current membership checks, then displays them. No signed URLs are persisted in
JSON. Portable exports embed the loaded image bytes and omit private storage
paths, so the original offline import/export workflow remains usable. Removing
or replacing an image clears the old reference before the next save.

Copy browser draft to project stages an empty storyboard first to establish the
Storage permission boundary, uploads images, and then saves the complete document.
If it fails, the source draft remains intact and an explicit incomplete-import
message identifies the newly created board as a retry destination. The existing
saved user storyboard was not overwritten during implementation or verification.

Validation: 14 unit tests and the existing Chromium workflow passed. A dedicated
Chromium regression used the exact owner-supplied JSON to verify all 31 shots,
18 image hashes, custom titles and extra metadata across local import/IndexedDB
reload, failed-upload preservation, simulated private upload/save, shared reload,
and portable export. It produced 16 unique image objects and a 26,969-byte shared
JSON document. Storage/PostgREST requests in that browser regression were stubbed:
actual hosted Storage upload/download from a real account still requires owner
verification in the preview because workspace HTTP remains blocked.

Local PostgreSQL checks passed for private bucket configuration, owner upload,
viewer read-only access, outsider/revoked-member denial, immutable objects, missing
image rejection and cross-project reference rejection. Development catalog checks
confirmed the private bucket, read/insert-only policies and reference guard.
Security advisor retained the existing guarded-RPC warnings and deny-all private
metadata notice; it additionally reports Auth leaked-password protection disabled
(an Auth configuration follow-up, not changed by this migration):
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

To repeat the exact-file browser check without committing private content:

```sh
# Build using public development configuration first.
STORYBOARD_IMPORT_FILE=/path/to/original-storyboard.json \
CHROMIUM_PATH=/usr/bin/chromium npm run test:import
```

Source archives, extracted JSON, decoded image bytes and reproduction scratch
files remain in ignored `work/`; they must not be committed or published. No paid
plan was selected or upgraded. Existing project Storage/egress allowances still
apply; review usage before a wider pilot.

## Planning workspace: first three views — 23 October 2026

The workspace now provides Storyboard, Shot list and Props & equipment views for
the **currently selected storyboard**. Script, Schedule, People & locations and
Call sheets are visible as disabled planned tabs; their editing/workflows are not
implemented by this increment. Navigation supports pointer and keyboard use and
does not change the selected project/board or discard unsaved edits.

Shot list is an editable table over the same shot records as storyboard cards:
scene, action, framing/lens/movement, location, cast, shoot date, estimated minutes,
filming status, props, equipment and notes. Search/filter by scene, location, shoot
date/status, sort by scene/date or original storyboard order, and export filtered
CSV. Table edits update cards immediately; shared users still click Save storyboard.
Sorting/filtering is a view operation and does not reorder the source storyboard.
Custom framing/lens/movement values are preserved when entered through the table.

Props & equipment consolidates case-insensitive names from comma/semicolon/newline
lists on shots, keeping categories separate and showing shot/scene references.
Quantities are manual inventory counts, not guessed from mentions. Users can add
manual requirements and save quantity, provided-by, readiness and notes. These
records live in `planning.requirements` inside the versioned storyboard document,
with stable IDs once materialized; all existing RLS, shared-save version checks,
portable export/import and image handling continue to apply. Unreferenced manual
records remain visible so removing a shot mention does not erase logistics notes.
This is not yet a project-wide cross-storyboard resource catalog or script-tagging
system; those require the later canonical-record integration stories.

Viewers/commenters can navigate, filter and export but cannot edit table values
or add requirements. CSV export quotes fields and neutralizes spreadsheet formula
prefixes. No backend migration or production change is required for these views.

Validation: 18 unit tests pass; Chromium checks cover cross-tab edits, filters,
manual requirement persistence, CSV download, keyboard navigation and read-only
controls, alongside the existing workflow and full-size private-image import checks.
