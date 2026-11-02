# Working on ApeOnAWhale Film Planner

These instructions apply to every coding task in this repository, including bug
fixes, features and maintenance. Read `docs/quality.md` and the active app's
`sites/film-workspace/AGENTS.md` before changing code.

- The canonical application source is `sites/film-workspace/`. The root Netlify
  application is a frozen fallback, checked by `npm run check:fallback`. Make
  app changes in the canonical source, not by editing two implementations.
- Keep changes understandable to another developer: formatted code, descriptive
  names, small functions and explicit boundaries. Do not add inline application
  JavaScript to HTML. Follow existing dependency-injection seams.
- Preserve user data, unknown document fields, private images, permissions and
  stale-save protection. Do not weaken authorization or retry uncertain writes
  merely to make a test or demo succeed.
- Test meaningful behavior and failure cases appropriate to the change. Run
  `npm run quality` before committing. Run `npm run quality:browser` for browser,
  auth, storage, routing or workflow changes. Use the disposable `npm run test:db`
  when migrations, policies, storage guards or permission semantics change.
- Maintain the checked-in coverage and complexity baselines. Improve coverage of
  changed behavior; never lower thresholds or update a baseline just to hide a
  failure. Explain an unavoidable exception with evidence before accepting it.
- Keep source, tests, setup docs and the real ESNZ Backlog consistent. Never add
  or update `backlog.json`. Distinguish local fixture checks from live acceptance.
- Do not commit credentials, user exports, generated private frames, dependencies,
  coverage output or build artifacts. Use development Supabase for development;
  production migrations/promotion require their separate reviewed workflow.
- GitHub is the canonical review source; the Site-managed repository is a
  publication mirror. Use `npm run sync:sites -- --target <checkout>` to sync a
  clean dedicated Site checkout, then verify/check/publish the exact source.
- At handoff, report what changed, checks actually run, remaining limitations and
  the commit/PR/deployment when relevant. Do not claim unrun checks passed.

AGENTS.md persists repository guidance across sessions. Automated CI enforces the
measurable checks; these instructions do not replace human review or live checks.
