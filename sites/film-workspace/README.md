# ApeOnAWhale Film Planner — collaborators and provider tools

Live Site: https://apeonawhale-film-workspace.seamap3d.chatgpt.site

This directory is the canonical application source in GitHub. The Site-managed
repository is a publication mirror synchronized by the root `npm run sync:sites`
command. GitHub pushes alone do not publish the Site. Read `AGENTS.md` for the
required development checks. The earlier Netlify implementation is frozen.
Database migrations remain in the repository's `supabase/migrations/` directory.

## Access model

The website is publicly reachable. Collaborators do NOT need a ChatGPT account
or plugin. They sign in with their normal Supabase storyboard account and can
access only projects where the provider has given them membership. Opening the
URL or registering an account does not grant access to an existing film.

The browser uses the publishable API key and the signed-in user's token for
Supabase reads/files. Database RPC writes use a same-origin authenticated Site
relay, which validates that user and forwards only their token to allowlisted
Supabase functions; it never uses an admin credential. Tokens are stored in per-tab sessionStorage, refresh automatically,
and are removed on sign-out. Project reads use existing RLS; shared writes use
the existing role-checked/version-checked RPCs. Private image reads require project
membership; uploads require owner/editor. No policy, project ownership, database
schema, data or private image is copied or made public by this hosting change.
Browser drafts remain device/origin-local until explicitly saved to a project.

Roles remain owner (members/invites and edits), editor (edits/uploads), and
viewer/commenter (read-only here; commenting is future work). Providers invite by
email using Project members & invitations. Recipients create/verify a storyboard
account with that email, accept the pending invitation inside the app, and use
the shared URL. Invitations expire after seven days and are single-use/revocable.
The app does not automatically email those invitations; the provider shares the
URL themselves. Site editor/viewer grants are not part of collaborator onboarding.

## Project production records

People & locations now manages project-wide people, characters/performers,
filming venues, script settings, scenes and shot assignments. These records save
separately from each storyboard and use their own revision checks. Availability
is recorded as notes; dated scheduling/conflict checks remain planned. Ordinary
collaborators use the same owner/editor/read-only permissions as shared boards.
Provider MCP adds `get_project_production`, `update_production_record` and
`delete_production_record`. See [the production-records guide](../../docs/production-records.md)
in the GitHub repository for the schema, workflow, migration and remaining scope.

## Project-wide props and equipment

Props & equipment now includes shared project resources and shot assignments,
reviewed promotion of saved storyboard mentions, manual quantities/suppliers/
readiness/collection/return details and filtered CSV. The Shot list scope selector
adds a read-only whole-project view with filters, resource links and navigation
back to the selected shot's editable board. Per-board source notes are preserved.
MCP adds `get_project_resources` and `promote_resource_mentions`; the existing
production record tools also edit `resources` and `resourceLinks`. See
[project resources](../../docs/project-resources.md) in the GitHub repository.
Daily allocation/conflict checks and call-sheet outputs remain scheduling work.

## Provider-only MCP

Only the designated provider's Supabase user ID can enroll or use the MCP data
tools. This is independent of film ownership: owning a different project does not
grant access to the provider's MCP connection. MCP enrollment/calls fail closed
if MCP_OWNER_SUPABASE_USER_ID is absent or does not match the verified user.
An old encrypted link belonging to a collaborator is also rejected.

The provider signs into the website normally, opens Provider: ChatGPT tools,
and follows the dispatch-owned ChatGPT sign-in link if needed. Confirming their
storyboard password creates a separate Supabase session solely for MCP. That
session is independently verified, rotated and AES-GCM encrypted in private R2,
bound to the Site-scoped ChatGPT identity with authenticated additional data.
The ordinary browser session and MCP session are separate refresh-token families.
Email/name are display data; they never automatically link or authorize accounts.
Normal app sign-in does not enroll tools or require the account-link API/R2.

MCP calls require Site-authenticated ChatGPT identity, a valid account link and
the provider ID check, followed by the same Supabase role permissions. Only
non-sensitive protocol discovery/tool schemas are available without that link.
The native Site plugin and the separately requested branded plugin both use this
same server and owner restriction; neither hosts another database.

Runtime values are configured through Sites tools, not in source or manifests:
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SESSION_VAULT_KEY (32 bytes, base64),
MCP_OWNER_SUPABASE_USER_ID. This Site still uses the original DEVELOPMENT project
lfvsimzmjhceyvjaoats. Production yvtixpzlsnhgsyksmypm is not accessed. Loss/rotation
of the vault key requires the provider to reconnect. Existing Netlify source is
retained as a fallback and is not the deployment source for this Site.

## Email onboarding and recovery

The Site root URL must be the development Supabase Auth Site URL and an allowed
Redirect URL. Recovery captures/scrubs callback fragments before async app setup,
verifies the recovery token directly with Supabase and updates that user's
password without requiring a ChatGPT identity or account link. Passwords and
recovery tokens are not persisted or logged. Expired/incomplete links and email
429 responses are explained; no automatic resend loop is used.

Current live onboarding is subject to the project's email provider and rate
limits. The owner has reported a recovery email limit. Supabase's built-in test
sender has recipient restrictions as well as project-wide email limits. Configure
a suitable SMTP sender or supported email hook before relying on onboarding
arbitrary collaborators. Do not disable email verification or grant unverified
addresses access to avoid sender limits. No paid email provider is selected or
activated by this change; credentials and any provider costs require setup.
https://supabase.com/docs/guides/auth/testing-auth-flows

## Build, publish and verify

```sh
npm ci
npm run quality
npm run quality:browser
```

For browser fixtures, install Chromium once with `npx playwright install chromium`,
then run `npm run test:browser` after building. Alternatively set `CHROMIUM_PATH`
to an existing Chromium executable. Playwright is pinned locally; no workspace-
specific dependency path is required.

The pinned esbuild build embeds an explicit allowlist of public assets into a
Worker ESM bundle at dist/server/index.js, with dist/.openai/hosting.json. The
published artifact contains root .openai/hosting.json AND dist/, not dist contents
alone. No environment file, private source JSON/image archive or vault content
is included. The Site's managed source repository records each published source state;
GitHub is the canonical review/development source. The installed Sites helper/Vinext source was unavailable in this image;
the Worker adapter retains the existing browser app. Temporary source credentials
are accepted only through hidden stdin by scripts/push-source.mjs.

58 unit tests cover save reconciliation and image reuse, text editing, vault identity isolation, mixed-account rejection, public
assets/config, authenticated APIs, provider enrollment and old-link MCP denial,
route allowlists/user-token forwarding, and independent recovery. Browser fixtures
exercise anonymous-site editor sign-in, image upload/edit/save/reload, viewer
read-only controls, uninvited isolation, explicit independent provider MCP linking
and disconnection, and password recovery including a mocked email-rate limit.
No real emails or passwords are changed by tests. Live RLS policy inspection
confirms membership-based reads and owner/editor-only image insert policies.

After publication, verify anonymous URL access with no ChatGPT session, real
collaborator email onboarding/acceptance, role changes/removal, and a real
provider MCP call. Those hosted multi-account/email checks are not proven by
local fixtures or deployment success. No acceptance card should be marked Done
until its real workflow is verified.

## Planning scope

Functional views: Storyboard, Shot list, Props & equipment. Four tabs remain
planned. MCP tools check connection status, list/read boards, get_planning_gaps,
attach_shot_image and update_shot.
Locations are currently shot text; gaps report missing names/mentioned locations,
not invented permits, addresses or readiness. Generated images need actual bytes
or a supported accessible file URL. The remote server cannot read a ChatGPT local
path; manual app upload is the fallback when no asset is transferable.

## Cloudflare request compatibility

Cloudflare Workers accepts redirect modes follow/manual, not the browser's error
mode. All server-side Auth, image and Supabase client requests use manual mode
and reject non-2xx redirects rather than forwarding credentials. The live MCP
connection probe reproduced this unsupported-setting TypeError; it caused the
provider check and initial account linking to return 503. A regression simulates
the edge fetch contract and verifies redirects are not followed. Provider-check
failures now show a retryable message instead of silently hiding the panel.
The read-only connection check returns only the caller's own Site-scoped ID,
account-link status, service reachability and redacted failure categories; never
provider tokens, vault contents or private storyboard data.

## Connector text editing

`update_shot` accepts storyboard_id, stable shot_id, expected_revision and a
nonempty `changes` object. Supported fields: title, scene, description, location,
cast, props, equipment, notes, shot_type, lens, camera_movement and shoot_date.
Read get_storyboard first; its shot summaries now expose all of these fields.
Title maps to customTitle and description to desc in the existing document.
An omitted field is preserved; an explicit empty string clears that field.
Title and scene are independent, so supply both only when both should change.
shoot_date is an actual YYYY-MM-DD date or empty. Per-field limits bound input;
IDs, images, image paths, permissions and arbitrary document fields are forbidden.

The provider MCP gate remains mandatory. The target project must grant owner or
editor access, and save_storyboard performs the final role/revision check. Text
patches never upload or replace images. Other shots, metadata, planning records,
custom fields and image captions/paths survive. Stale/racing saves fail without
retry. A patch with no changed values returns changed:false at the same revision.
No schema change or privileged database key is needed for this tool. The earlier
one-off SQL correction of shot 31 is not the normal connector edit path.

Text regression fixtures verify exact document/image preservation, editor vs
viewer/commenter writes, stable/ambiguous IDs, stale/racing versions, empty/no-op
updates, protected-field rejection, date/length validation and all field mappings.
The mock browser exercises MCP text edit then website reload with the same image.

## Saving after image preparation

Loaded/uploaded immutable image paths are tracked in the current authenticated
session, so saving text after loading 19 frames does not re-upload and re-download
all 19 files. Content hashing still detects changed images and uploads a new path.
The cache is cleared when accounts change/sign out. Final DB role/version checks
remain authoritative after membership changes, regardless of the local cache.
Image transfers allow 60 seconds, browser RPCs 90 seconds and the Site RPC upstream
60 seconds. Preparation and final-save progress are distinct.

The normal-user /api/project-rpc/<name> relay is separate from provider MCP. It
requires a valid Supabase account token, same Origin for writes and an allowlisted
function name. It preserves the caller's token and upstream role/conflict errors;
no ChatGPT account is required. This avoids relying on a browser-to-Supabase RPC
preflight succeeding after the image transfers. External redirects are rejected.

A timeout does not prove whether a write committed. save_storyboard reconciles
with one read, accepting success only for the target ID, exactly next revision,
matching trimmed name and semantically identical submitted document (key order
ignored). It never automatically replays an uncertain write. A different/unknown
result preserves the in-memory draft and asks for JSON export before reloading.
An explicit retry can recognize an identical late commit; genuine conflicts still
fail. No failed/unconfirmed save is labelled saved just because image preparation
finished. Regressions include a lost response after commit, failure before commit,
19-image reuse, safe retry, permission/conflict errors and browser draft retention.

## Quality gates and future changes

Prettier, ESLint, per-function complexity limits, unit tests and coverage run via
`npm run quality`. Browser changes also require `npm run quality:browser`.
The pinned Playwright Chromium must be installed first, or CHROMIUM_PATH supplied.
The browser checks use synthetic accounts and mocked HTTP; no real password,
project or image is changed. Reports are ignored under `coverage/`.

The runtime unit coverage floor is 40%, including unloaded UI modules. Combined
unit/browser line coverage must reach 80%, with 95% floors for the account vault
and planning model. Branch numbers from V8 are diagnostic rather than a complete
syntactic branch guarantee. New functions default to complexity at most 10;
measured legacy exceptions (all at most 20) may not grow. The previous largest
router function scored 56; it now scores 12 after extraction. Runtime editor code
is in modules, not inline HTML. Shared test cases run against the deployed app
modules and the frozen fallback.

JSDoc documents the card-renderer action boundary. Full JavaScript type checking
has not been introduced. In the GitHub repository, CI runs the checks on Node 22
and 24 plus disposable PostgreSQL migration/access tests. Required status checks
must be enabled in repository protection to make passing CI a merge condition.

## Planning through MCP

The app is now called ApeOnAWhale Film Planner. Storyboards remain one planning
view; the existing Site URL, project IDs, accounts and memberships are unchanged.

Ask the connected provider tools to read a storyboard, identify script settings,
characters and required props, then populate only requested shot fields. Saved
location/cast/props fields appear in the website and its existing requirements
view after loading the shared version. Those fields describe the script; they
are not real venue bookings or actor/crew contacts. No such facts are invented.

`update_shots` accepts `storyboard_id`, `expected_revision` and 1–100 `updates`
with unique `shot_id`/`changes` entries. It uses the same text whitelist as
`update_shot`. All patches validate before one role/version-checked save; any
invalid/missing/ambiguous ID prevents the entire batch. Images, unknown fields,
metadata and omitted shot fields are preserved. A no-op does not save. A stale
batch is not replayed. Read back after saving to verify the new revision.

The plugin's film-planning skill performs interpretation here in ChatGPT; no
OpenAI API service or paid generation integration is added. If the current chat
still exposes only read/image tools, it cannot save a text breakdown. Refresh the
existing plugin or use a fresh chat after publication; never substitute management
SQL or hide a write in a read/image tool. A prepared private draft is not saved
app data. Full project-wide location, crew and performer registers remain planned.

The MCP planning-gaps requirements list uses the same consolidation as the website,
including shot mentions even without manual inventory records. Existing quantities,
suppliers and readiness are retained; new mentions have blank quantities and the
planning status needed, which is not a confirmed booking or available inventory.

## Character Bible image tools (1.5)

`get_character_bible(project_id)` reads stable character IDs, reference metadata,
missing-reference flags and the production register revision. Create character
records through `update_production_record` before adding references.
`attach_character_reference` requires the current register revision, stable
character/reference UUIDs and `approved:true` after the user approves the image.
It accepts either a source shot ID or one PNG/JPEG/WebP data URL / supported
OpenAI file URL. Replacing an existing reference requires `replace_existing:true`.
Caption, appearance, costume and continuity notes are optional. Unknown character
fields, other production records and original storyboard frames are preserved.

`get_character_reference_image` returns actual approved private image bytes in an
MCP image content block. `get_shot_image` retrieves an existing frame for visual
inspection without declaring it canonical. Neither returns storage credentials
or public image URLs. The provider-only gate and normal project permissions apply.
Read back after saving, especially after timeouts; never replay an uncertain write.

Reference metadata lives on project production characters as `visualReferences`,
using the existing versioned register. Images reuse immutable content-hashed
objects in an existing project storyboard's private storage namespace. Retain
that source storyboard: storage access is tied to it. No database migration,
service key, bucket policy change or second database is introduced. This increment
adds MCP authoring/retrieval; a dedicated browser Bible gallery remains pending.
No character likenesses or approval decisions are populated by the server update.
