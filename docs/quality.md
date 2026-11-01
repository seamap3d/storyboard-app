# Quality and maintainability

Root AGENTS.md and the active app's AGENTS.md are persistent instructions for
future coding sessions. They require understandable changes, meaningful tests,
data/permission preservation and truthful verification. CI checks enforce the
measurable requirements on every pull request and push. Human review remains
necessary; a passing coverage percentage does not establish correctness.

## Canonical source and fallback

Develop the app in `sites/film-workspace/`. Its standalone package contains the
same checks used by GitHub CI and the Site-managed publication checkout. The root
Netlify application is a frozen fallback, not a second development target.
`npm run check:fallback` checks its recorded source hashes. An intentional fallback
change requires an explicit reviewed decision and manifest update, not routine
dual editing. Database migrations remain at `supabase/migrations/`.

Use `npm run sync:sites -- --target /absolute/dedicated/site-checkout` to mirror
tracked application source to a clean checkout of the same Site project. It
verifies identity and copies only tracked source; it never copies Git metadata,
runtime secrets, builds, coverage, private images or user exports. Run the checks
in the destination, then use the Sites source/version/deployment workflow.

## Required checks

From the repository root, after `npm ci` and `npm ci --prefix sites/film-workspace`:

```sh
npm run quality
npm run quality:browser
```

The first command runs frozen-fallback verification, fallback unit tests, active
format/lint/complexity checks, build, unit tests and their coverage floor. The
browser command exercises the active UI with synthetic accounts and mocked HTTP,
and checks combined server/browser coverage. Install the pinned Playwright
Chromium with `npx playwright install chromium` from the active app first; an
existing executable can be selected through CHROMIUM_PATH.

Use the disposable `npm run test:db` when migrations, RLS, storage policies or
permission behavior change. Never run a remote database reset. Local SQL checks
and mocked browser coverage do not replace real account/email/revocation checks.

## Review rules

- Prettier defines source formatting; ESLint checks common JavaScript mistakes.
- Runtime JavaScript belongs in modules rather than inline HTML scripts.
- The complexity checker scores decisions per function and rejects new functions
  above 10 or growth in specifically recorded existing exceptions. Existing
  exceptions are technical debt, not permission for new complex code.
- Coverage includes unloaded runtime files. Unit and combined browser scopes are
  distinct, documented baselines. Generated assets, dependencies and test/build
  code are excluded. Never hide missing coverage by excluding changed code.
- Add regressions for changed behavior and relevant failures: stale saves,
  interrupted transfers, account refresh, permission denial and data preservation.
- CI uploads reports so reviewers can see the result. Do not lower thresholds or
  refresh exception baselines solely to make a failed check green.
- GitHub repository protection must require the quality jobs to block a merge;
  merely adding a workflow makes failures visible but does not impose protection.
  This work does not silently alter the owner's repository protection policy.

## Definition of done

The behavior is implemented, relevant checks pass, documentation/source sync are
consistent, and material live acceptance gaps are stated. Reports must distinguish
tests actually run from assumptions. No real ESNZ card is complete merely because
a build succeeds. Run the required checks before commit/push and publication.

## Initial enforced budgets (2026-11-01)

- Runtime unit line coverage: at least 40%, including unloaded UI modules.
- Combined unit/browser runtime line coverage: at least 80%.
- Combined account vault and planning model line coverage: at least 95% each.
- New-function complexity: at most 10. Fifteen retained legacy exceptions are
  recorded by name with individual ceilings of 11–20; none may grow.
- The largest router score fell from 56 to 12. No function remains above 20.
- The active suite contains 52 unit tests; 26 fallback tests share canonical
  client/media/model test cases. Browser checks add import rejection/preservation,
  folding, duplication/deletion, planning edits, filtered exports and saving.

These are starting guardrails, not a claim of full coverage. The old 67.9% figure
used compact code and one inline script; formatting changes line accounting, so
compare future runs against the new checked-in source and same measurement scope.
JSDoc covers the card action interface; full type checking remains a possible
incremental improvement. Hosted email/multi-account and production acceptance
remain separate backlog work.
