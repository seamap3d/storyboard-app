# ChatGPT Sites setup and source handoff

## Current deployment (Film Planner, 2026-11-02)

- URL: https://apeonawhale-film-workspace.seamap3d.chatgpt.site
- Site project: `appgprj_6ae647f088b48191b14473736fa55625`
- Database/Auth/private images: development Supabase `lfvsimzmjhceyvjaoats`.
- Source directory here: `sites/film-workspace/`.
- Deployed Site source commit: `6133e6aa342aab1355897357ed02874ae05d30e5`.
- Saved version: `appgprj_6ae647f088b48191b14473736fa55625~appgver_6382dfa896708191a60b64e8ca55a98e`.
- Successful deployment: `appgdep_6ae8f5aef60c81918a4b82f80c23ad47`.

The current canonical source is `sites/film-workspace/` in GitHub. Its source
instructions, checks and code travel together to the Site publication mirror.
The retired root Netlify app has been removed. Database migrations and SQL
checks remain in their original directories. See [quality requirements](quality.md).

The active Site has a dedicated publication repository.
Changes pushed to GitHub are reviewable source, not an automatic Sites release.
To publish a reviewed change, run `npm run sync:sites -- --target <checkout>`
from a clean GitHub checkout. The target must be clean, dedicated to the same
Site and outside this repository. Inspect its diff, run quality checks there,
then commit/push that source
using the Sites source credentials, save its version and deploy through Sites.
Use the resulting Site commit as deployment provenance. Do not replace either
repository's remote or force-push one repository's unrelated history over the other.
The included `scripts/push-source.mjs` is for a dedicated Site-managed checkout
with temporary credentials supplied through hidden stdin, not the GitHub root.

## Build and runtime configuration

From `sites/film-workspace/`:

```sh
npm ci
npm run quality
npm run quality:browser
```

The build emits a Worker ESM bundle in `dist/server/index.js`. The publishing
archive must contain root `.openai/hosting.json` AND `dist/`; archiving only the
contents of `dist` is insufficient. The manifest declares private R2 binding
`BUCKET` and the `mcp` capability. D1 is not used. The Worker embeds an explicit
allowlist of public app assets, not the source directory or private input files.

Configure these values securely in the Site runtime, not committed environment
files or the manifest:

| Value                        | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `SUPABASE_URL`               | Development project endpoint                               |
| `SUPABASE_PUBLISHABLE_KEY`   | Public client configuration; never substitute an admin key |
| `SESSION_VAULT_KEY`          | Existing 32-byte base64 AES-GCM account-link key           |
| `MCP_OWNER_SUPABASE_USER_ID` | Designated provider's verified Supabase user UUID          |

Keep the existing vault key when changing unrelated settings. Rotating or losing
it invalidates the encrypted provider connection and requires reconnection.
No service-role key or database credential is needed by the running app.

Sites calls the hosted environment production, but this app still uses the
development database. Supabase production `yvtixpzlsnhgsyksmypm` was not accessed
or changed during the migration and save fix. Do not switch runtime values as
part of a routine source sync. Follow [the migration runbook](environments.md)
for separately reviewed database changes; builds never apply SQL migrations.

## Website and connector access

Keep the Site audience public so collaborators can open it without a ChatGPT
account. They then use normal Supabase storyboard sign-in. Project membership,
database RLS and role/version-checked RPCs protect film data. Viewer/commenter
controls are read-only; owner/editor can edit and upload. Registration grants no
access to the provider's existing films.

The normal browser stores its session per tab. Reads and images go to Supabase;
allowlisted database RPCs use `/api/project-rpc/<name>`, which verifies the user,
requires the same Origin and forwards their token. It uses no privileged key.

The provider separately opens **Provider: ChatGPT tools** and connects a dedicated
Supabase session to the Site-authenticated ChatGPT identity. That session is
encrypted in private R2. Only the configured provider may enroll/use MCP, and
project role/version checks still apply. Normal collaborators do not use MCP.
The Sites-native identity/account-link path supersedes the old Netlify OAuth
discovery and consent setup; the obsolete files have been removed.

Set development Supabase Auth Site URL and an allowed Redirect URL to:

```text
https://apeonawhale-film-workspace.seamap3d.chatgpt.site/
```

Password reset has been accepted by the owner. Arbitrary collaborator onboarding
still needs a suitable email sender: Supabase's built-in test sender has recipient
restrictions and rate limits. Custom SMTP or a supported email hook is pending;
no paid provider was selected. Invitations are email-bound, expire after seven
days and are single-use/revocable. The app does not send invitation emails;
the owner shares the app URL. Do not disable email verification to bypass limits.

## Verification and remaining checks (2026-11-01)

The refactored source has 52 unit regressions plus mocked Chromium workflows for
roles, recovery, provider linking, text/image editing, existing-image reuse and
uncertain saves. A lost response is reconciled through one read and accepted only
when ID, next revision, name and document match; uncertain writes are never
automatically replayed. Failed saves preserve the draft and advise JSON export.

The owner has accepted real import/save/reload with shots and images, password
recovery, provider connection and the latest save-timeout fix. Native connector
reads and an approved generated-frame attachment also passed. The new text-edit
tool is implemented and deployed but needs a fresh/refreshed native connector
session for its own live invocation. Automated HTTP fixtures alone do not prove
that workflow.

Keep these acceptance items open:

- Real external collaborator email onboarding, invitation acceptance, role change
  and removal, and multi-account/cross-device checks.
- Live native `update_shot` invocation with image/document preservation.
- Production database promotion and production smoke checks.
- Current provider limits/cost review before any paid service selection.
- Image preview scaling and reviewed orphan cleanup/deletion.

The save-timeout defect alone is accepted; the parent shared-storage/deployment
stories remain In Progress. Backlog evidence belongs in ESNZ, not `backlog.json`.

## Quality release evidence

GitHub implementation commits are `c25c210` plus the cross-version runner
corrections through `c2ad5d44d74fe3c52184c56a7918ee37350c9a2d`. All 52 canonical
application files matched the dedicated Site publication checkout before saving
its version. Deployment succeeded with MCP enabled and runtime revision 2.

GitHub Actions run https://github.com/seamap3d/storyboard-app/actions/runs/41335958166
passed `quality (22)`, `quality (24)` and `database`. Standalone Site clean-install,
quality and browser checks passed too: 52 active unit cases, 81.66% combined runtime
line coverage, 100% vault coverage, 95.23% planning-model coverage and maximum
function decision complexity 20. The router fell from 56 to 12. At that release, the root fallback unit tests (26)
and disposable PostgreSQL checks passed. The fallback has since been removed.

The real MCP read after publication succeeded and matched the pre-publication
storyboard summary. No user film/account/image was changed by the regression
fixtures. Required-check branch protection remains a one-time owner setting;
the CLI API returned Forbidden for its settings endpoint. See quality.md.

## Film Planner naming and planning connector

The active display name is ApeOnAWhale Film Planner. Storyboard document labels,
API names, Site URL, project/App/plugin identities and storage remain compatible.
The new `update_shots` MCP tool applies up to 100 text/planning patches in one
version-checked save. The current client may need an existing-plugin refresh or
fresh chat before newly published edit tools appear. Do not claim a real planning
write succeeded until a tool call returns its revision and a fresh read verifies
it. The initial AfterLife draft is private local work, not repository source.

## 2026-11-02 Film Planner release evidence

The owner confirmed the name ApeOnAWhale Film Planner. GitHub implementation
commits `0b15ed3` and `cce020f7bd3c37848ad4726f148da9cfccd4367f` add atomic
`update_shots`, matching MCP/website requirements consolidation and active UI
branding. CI passed Node 22, Node 24 and disposable PostgreSQL at
https://github.com/seamap3d/storyboard-app/actions/runs/41521050649 . All 58 active
unit cases and the expanded mock browser workflow pass; combined runtime line
coverage is 82.06%. All 55 application files match the Site publication checkout.
The deployment above succeeded with MCP and runtime revision 2.

The existing branded private plugin was updated to version 1.1.0, release
`pluginrel_6ae8f5d65e208191aa244dc4032392ad`. Read-back verified its display name,
unchanged App connection, private scope and retained icon. Its film-planning skill
now describes evidence-based extraction and atomic text/planning edits. No App,
Site, project, auth account, storage or plugin was recreated.

The current chat still exposes the older read/image tool catalog. A private draft
of 87 blank/TBD fields for 31 AfterLife shots was prepared from revision 6, but
has NOT been saved. Do not claim the app contains that breakdown. Refresh the
existing plugin or start a fresh chat to load `update_shots`, then reread the
current revision before applying the requested changes and verifying them. No
management SQL or hidden writes through read/image tools are an acceptable
substitute. Actual crew/performer contacts and real venue bookings remain unknown.
