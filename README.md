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

- `content/`: concepts, autopsies and their claim files, in MDX and JSON.
- `src/`: the Next.js site, the content schemas and the proof library.
- `scripts/`: build, validation and proof scripts.
- `tests/`: unit tests (Vitest) and end-to-end tests (Playwright).
- `netlify/`: edge function and function used in production.
- `packages/`: the MCP server and the public audit skill.
- `public/`: static files only (favicons and the IndexNow key). The build writes everything else there (`llms.txt`, `sitemap.xml`, `search-index.json`, Markdown twins, OG images, `build-info.json`...). None of it is tracked by git, and `tests/repo-hygiene.test.ts` fails if one gets committed.

## Running locally

```bash
npm ci
npm run dev
npm run proof:all
```

## Licenses

Code is MIT, see `LICENSE`. Content and data are CC BY 4.0, see `LICENSE-CONTENT`.

Content is produced elsewhere and arrives here through pull requests that must pass the same public checks as any contribution.
