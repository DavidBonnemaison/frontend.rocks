# frontend.rocks

**Frontend, with receipts.**

Frontend engineering explained at the level of the browser engine: concepts, production autopsies and the interactive labs that go with them. Every factual claim on the site is meant to be checked by a machine, not taken on trust.

## How claims are proven

Each claim has a type, and each type has its own check. The receipts are on [frontend.rocks/proof](https://frontend.rocks/proof/).

- **observable**: an Experiment runs in real Chromium, Firefox and WebKit (through Playwright) and the expected outcome is asserted.
- **measured**: same mechanism, for a number the Experiment measures instead of a yes/no outcome.
- **normative**: a short quotation from a specification, checked word for word against the current spec text.
- **implementation**: a short quotation from browser engine source code, pinned to a commit and checked word for word.
- **support**: computed from browser-compat-data and web-features, never typed by hand.
- **derived**: follows from other claims that are themselves proven.

## Repository layout

- `content/`: concepts, autopsies, claim files, and Experiments (`content/experiments/<id>/experiment.ts`), in MDX, JSON, and TypeScript.
- `src/`: the Next.js site, the content schemas and the proof library.
- `scripts/`: build, validation and proof scripts (`npm run proof:build` compiles Experiment bundles and the proof harness; `npm run proof:run`, `proof:aggregate`, `proof:gate`, `proof:selftest`, and `proof:all` run the 3-engine Playwright proof suite and gate).
- `tests/`: unit tests (Vitest) and end-to-end tests (Playwright).
- `netlify/`: edge function and functions used in production (`mcp` and `deploy-succeeded`, which sends the IndexNow notification after each deploy).
- `packages/`: the MCP server and the public audit skill.
- `public/`: static files only (favicons and the IndexNow key). The build writes everything else there (`llms.txt`, `sitemap.xml`, `search-index.json`, Markdown twins, OG images, `build-info.json`, `experiments/`...). None of it is tracked by git, and `tests/repo-hygiene.test.ts` fails if one gets committed.

## Local setup

```bash
nvm use        # Node 24, see .nvmrc
npm ci
npm run dev
```

> If `npm ci` fails with HTTP 403 on a recently published package, the device protection agent may have blocked it (`block_reason: min_package_age`). Check with `aikidoctl events --json`. Do not change the registry or bypass the agent. Wait until the package is old enough, or pin an older version through `overrides` in `package.json` and note it in the PR.

Checks before a pull request: `npm run check:all` (typecheck, lint, unit tests, content validation), then `npm run build-prod` and `npx playwright test` for the E2E suite. A pull request runs the `@smoke` subset (`npx playwright test --grep @smoke`) on a build without the OG images (`npm run generate:exports:fast`); the full suite and Lighthouse run in the daily deploy workflow.

Normative specification quotes can be checked locally with `npm run proof:verify-specs` (use `-- --record` to update committed quote metadata in `content/.proof-cache/specs/`). Engine source code quotes can be checked locally with `npm run proof:verify-sources` (use `-- --record` to update `content/.proof-cache/sources/` and `-- --resolve` to resolve a snippet to exact lines and commit SHA).

`npm run lint` has a warning ratchet (`--max-warnings`). It can go down, never up.

## Licenses

Code is MIT, see `LICENSE`. Content and data are CC BY 4.0, see `LICENSE-CONTENT`.

Content is produced elsewhere and arrives here through pull requests that must pass the same public checks as any contribution.
