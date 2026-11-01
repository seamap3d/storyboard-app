# ApeOnAWhale Storyboard

Private film projects with shared storyboards, shot lists, props and equipment,
and provider-only ChatGPT tools.

**Active app:** https://apeonawhale-film-workspace.seamap3d.chatgpt.site

Collaborators open the website and sign in with a storyboard account; they do
not need ChatGPT. Project membership controls access. Owners manage members and
invitations, editors can edit and upload images, and viewers/commenters have
read-only access in the current app. Commenting is planned. Only the designated
provider can connect the MCP tools.

## Source layout

| Path                                          | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `sites/film-workspace/`                       | Current ChatGPT Sites app, Worker, provider MCP, build and tests      |
| `supabase/migrations/`                        | Ordered shared database, membership and private image migrations      |
| Root HTML/modules, `netlify/`, `netlify.toml` | Frozen Netlify fallback (hash-checked)                                |
| `docs/sites.md`                               | Current hosting, source synchronization, setup and outstanding checks |
| `docs/environments.md`                        | Supabase migration runbook and historical Netlify verification        |

The Site currently uses **development Supabase**. Production promotion and smoke
checks remain outstanding. GitHub holds the canonical development source; its tracked app is synchronized
to the Site-managed publication repository before a Sites deployment. A GitHub push does
not deploy the active Site.

## Current functionality

- Multiple named storyboards in private film projects, invitations and roles.
- Storyboard cards, editable shot list and shared props/equipment planning.
- JSON import/export, IndexedDB browser drafts and explicit shared saves.
- Private, immutable image storage with portable exports embedding image bytes.
- Save progress, reuse of existing images and read-back confirmation after an
  uncertain save, without automatically replaying a write.
- Password recovery and independent provider account linking for ChatGPT tools.
- MCP reads, planning gaps, approved frame attachment and revision-checked shot
  text edits. The new text-edit tool still needs a live native connector check.

Script editing/tagging, scheduling, people/location records and call sheets are
planned. Four corresponding tabs are disabled. Locations are currently shot
text, not a location-readiness database. Project-wide resource catalogs, image
cleanup and broader collaborator acceptance also remain open.

## Development checks

Use Node 22.13+ (22.x), or Node 24+. From the repository root:

```sh
npm ci
npm ci --prefix sites/film-workspace
npm run quality
npm run quality:browser
```

Install the browser once, then run the Sites browser fixtures:

```sh
cd sites/film-workspace
npx playwright install chromium
cd ../..
npm run quality:browser
```

Set `CHROMIUM_PATH` to use an existing Chromium executable instead. These browser
fixtures simulate Supabase; they do not modify real accounts or images. The
existing `npm run test:db` checks migrations and access policies in a disposable
local PostgreSQL container. See [Sites setup](docs/sites.md) for runtime settings
and [the environment runbook](docs/environments.md) for migration procedures.

The root `npm run build` still builds the Netlify fallback with configured public
Supabase values. `npm run build:sites` builds the current Worker separately.

## Privacy and planning

Passwords, session tokens, vault keys and private film exports must not be
committed. Source uploads and generated storyboard frames stay outside the
published asset allowlist. Public hosting does not make Supabase data or private
image buckets public. The real ESNZ Backlog is the planning source; do not create
or update `backlog.json`.

Read [AGENTS.md](AGENTS.md) and [quality requirements](docs/quality.md) before
changing code. These instructions persist for future coding sessions. GitHub CI
checks formatting, lint, complexity, coverage, unit/browser behavior and disposable
SQL tests. Branch protection must require those jobs to enforce merge blocking.
