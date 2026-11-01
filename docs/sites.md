# ChatGPT Sites setup and source handoff

## Current deployment

- URL: https://apeonawhale-film-workspace.seamap3d.chatgpt.site
- Site project: `appgprj_6ae647f088b48191b14473736fa55625`
- Database/Auth/private images: development Supabase `lfvsimzmjhceyvjaoats`.
- Source directory here: `sites/film-workspace/`.
- Deployed Site source commit: `6e345b3198f55848f669185a25ef0b85ac64b5a7`.
- Saved version: `appgprj_6ae647f088b48191b14473736fa55625~appgver_aaa71f75280c8191a6813ff1e1f9fe24`.
- Successful deployment: `appgdep_6ae6da2ad77c81918c26e69e34f98817`.

This GitHub import contains the tracked source from that commit, with portable
browser-test dependency resolution, blank-line whitespace cleanup and updated documentation. It excludes the
Site Git metadata, installed dependencies, generated build files, credentials,
private storyboard exports and uploaded images. The earlier Netlify app remains
at the repository root with its existing build configuration. Database migrations
and SQL regression checks remain in their original locations.

The active Site and Netlify have different hosting systems and source repositories.
Changes pushed to GitHub are reviewable source, not an automatic Sites release.
To publish a later reviewed change, synchronize the intended files into the
Site-managed checkout, inspect its diff, build/test there, commit/push that source
using the Sites source credentials, save its version and deploy through Sites.
Use the resulting Site commit as deployment provenance. Do not replace either
repository's remote or force-push one repository's unrelated history over the other.
The included `scripts/push-source.mjs` is for a dedicated Site-managed checkout
with temporary credentials supplied through hidden stdin, not the GitHub root.

## Build and runtime configuration

From `sites/film-workspace/`:

```sh
npm ci
npm run build
npm test
```

The build emits a Worker ESM bundle in `dist/server/index.js`. The publishing
archive must contain root `.openai/hosting.json` AND `dist/`; archiving only the
contents of `dist` is insufficient. The manifest declares private R2 binding
`BUCKET` and the `mcp` capability. D1 is not used. The Worker embeds an explicit
allowlist of public app assets, not the source directory or private input files.

Configure these values securely in the Site runtime, not committed environment
files or the manifest:

| Value | Purpose |
| --- | --- |
| `SUPABASE_URL` | Development project endpoint |
| `SUPABASE_PUBLISHABLE_KEY` | Public client configuration; never substitute an admin key |
| `SESSION_VAULT_KEY` | Existing 32-byte base64 AES-GCM account-link key |
| `MCP_OWNER_SUPABASE_USER_ID` | Designated provider's verified Supabase user UUID |

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
discovery and consent setup; those fallback files are retained, not required by
the current connection.

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

The deployed source has 29 unit regressions plus mocked Chromium workflows for
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
