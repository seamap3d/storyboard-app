# Active app quality requirements

This directory is the active application. These instructions also travel to the
dedicated Site-managed publication checkout. In GitHub, read root `AGENTS.md` and
`docs/quality.md`; in a standalone Site checkout use this file and README.md.

- Preserve normal collaborator access without ChatGPT and provider-only MCP.
  Browser/server code uses publishable configuration and the current user's token;
  never introduce a service-role key into the app.
- Prefer focused modules and pure model functions. Keep HTML declarative and put
  browser code in modules. Use JSDoc contracts at shared boundaries. Keep routing,
  input validation, account sessions and rendering separate.
- New functions should normally have decision complexity at most 10. A few
  measured existing exceptions are recorded; do not grow them or create new
  exceptions by changing the baseline instead of simplifying the code.
- Run `npm run quality` for every code change. Run `npm run quality:browser` for
  UI/auth/storage/route/workflow changes. Add targeted behavior/failure tests;
  preserve unknown fields/images and use synthetic fixtures, not private films.
- Formatting, lint, complexity, coverage and test checks must pass. Do not bypass
  failures, weaken thresholds or mark mocked APIs as live provider acceptance.
- Test the actual modules deployed here, not only a similar fallback copy.
- Keep pinned dependencies/lockfile and the public build-asset allowlist current.
  Build output, generated assets, coverage, credentials and runtime data stay
  ignored. Do not log passwords, tokens or recovery links.
- Preserve the existing Site project ID, audience, runtime secrets and R2 vault.
  Record source/deployment provenance when publishing. GitHub changes do not
  publish themselves; use the documented source sync and Sites deployment path.
