# Project production records

The People & locations tab holds one shared production register per film project,
independent of each storyboard's JSON, revision and private images. All boards in
the same project use the same register. A browser draft has no shared register.

Project-wide resources and resource assignments extend this register; see
[project resources](project-resources.md) for the later migration and workflow.

## Records and relationships

- People: real cast/crew names, department/job, contact details, availability notes,
  preparation/call requirements and manual notes. A production person is not an
  application membership and need not have an app or ChatGPT account.
- Characters: script roles, optionally linked to a person playing them.
- Filming venues: real address/contact, access/permission arrangements, parking,
  travel/setup, availability and permission status. Defaults are unconfirmed.
- Script settings: narrative places, optionally linked to a real venue.
- Scenes: stable project IDs and names, optionally linked to a script setting.
- Shot assignments: stable storyboard/shot IDs linked to a scene, characters and
  assigned crew. Several storyboards can reference the same production records.

Creating a register does not infer real contacts, book venues, create members or
rewrite shot text. Users explicitly create and link records. Script labels remain
available in the existing storyboard and shot list. Missing cast assignments,
unmapped settings, incomplete venue logistics and absent contacts are flagged.
Assignments pointing to removed shots are flagged and must be removed before the
register can save again. Referenced records cannot be deleted until unlinked.

## Website and MCP workflow

Choose a shared film project, open People & locations and select a register. Use
New record or select an existing record, fill its fields and click Save record.
These saves are immediate shared writes, separate from Save storyboard. Form
changes are retained after failed saves. Refresh production records reads changes
made through MCP or another tab; discarding an edited form requires confirmation.
Viewer/commenter accounts can read; owner/editor accounts can edit. Ordinary
website use requires no ChatGPT account. Contact records are omitted from the
generic storyboard printout; reviewed call-sheet export is a later feature.

Provider-only MCP exposes:

- `get_project_production(project_id)`: register, version, gap flags and minimal
  storyboard/shot references. Image bytes and private image paths are omitted.
- `update_production_record(project_id, expected_revision, collection, record_id,
changes)`: create using a new UUID or patch an existing UUID. Only specified
  fields change; unrelated records and unknown future fields are retained.
- `delete_production_record(project_id, expected_revision, collection, record_id)`:
  remove an explicitly selected, unreferenced record.

Use `list_storyboards` to find the project ID, then read the register before
writing. Collections are `people`, `characters`, `locations`, `settings`, `scenes`
and `shotLinks`. Read each tool's schema and match the website fields. An empty
register starts at version zero. Successful changes increment its version;
identical documents retain their current version. A stale revision fails without
overwriting. An uncertain write is never automatically replayed: retain the
form/request and read back to establish whether it committed before reconciling.

## Database and access

The additive `project_production_records` migration creates
`public.project_production`, keyed by project ID, with a versioned JSON document.
The register is capped at 1 MiB, each collection at 1000 records, field text at
4000 characters and names at 160. IDs, reference integrity, unique assignments,
document shape, permissions and limits are validated in PostgreSQL; the browser
and MCP also share a model validator. Writes validate that assigned shots exist
in the same project.

RLS allows project members to read. API roles have no direct table write grants.
The public write wrapper invokes a narrowly scoped private definer function which
locks the project, rechecks owner/editor access, validates all data and compares
the revision. Membership changes use the same lock order. The app forwards the
current user's token, never a service-role key. Production records do not share
or bypass the provider-only MCP enrollment boundary.

Before applying to development, inspect remote migrations/tables, run
`npm run quality`, `npm run quality:browser` and the disposable `npm run test:db`.
Apply the migration to development only and verify the recorded history/version
matches the checked-in filename. Run security advisors and authenticated checks.
Production promotion follows the separate environment runbook; this feature does
not authorize production migration. Backup/restore planning must include this new
table as well as storyboards and private image objects.

## Remaining scope

Availability and preparation requirements are notes in this increment. Dated
bookings, shoot-day availability conflicts, script annotation anchors, scheduling
and reviewed call sheets are subsequent increments. They should reuse these IDs,
not copy contact details into disconnected per-board lists. This foundation alone
does not complete every acceptance criterion of the broader people/logistics story.

## Development verification (3 November 2026)

Development migration history records `20261103182551_project_production_records`.
The disposable PostgreSQL suite checks the whole migration chain and the new
register's role, isolation, reference, preservation and stale-save behavior.
Development Supabase also passed a transaction-rolled-back synthetic check of
owner/editor writes, viewer reads, viewer/outsider/revoked/anonymous denial,
no-op/stale revisions and cross-project shot-link rejection. Synthetic users,
projects and register rows did not persist. The existing AfterLife board remained
at revision 7 with 31 shots; the new real-project register remained empty.

Website tests use real browser modules with mocked HTTP APIs. They cover record
creation/editing/linking/deletion, reload persistence, read-only access, mobile
layout, stale-save draft retention and lost-response read-back. They do not
establish real crew availability, actual bookings or user acceptance.

Supabase security advisors reported no finding for the new register or its public
invoker RPCs. Existing findings remain for the intentionally policy-free private
environment metadata table, eight older public definer RPCs and disabled leaked
password protection. Review the existing role guards and Auth settings during the
release security checks; do not rewrite those unrelated policies in this feature.
Remediation references: [private metadata RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[public definer RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
