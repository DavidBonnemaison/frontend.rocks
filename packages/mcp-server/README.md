# `@frontend-rocks/mcp`

Official zero-backend Model Context Protocol (MCP) server for [frontend.rocks](https://frontend.rocks).

Gives AI coding agents direct, structured access to browser-engine internals, production failure autopsies, and Web Platform obsolescence intelligence — with **zero API keys**, **zero secrets**, and **zero private backend dependencies**.

## Architecture

`@frontend-rocks/mcp` consumes public static JSON & Markdown artifacts published on `https://frontend.rocks`:

- `/graph.json` — full ConceptNode knowledge graph (nodes, maturity status, `requires`/`replaces`/`contrasts_with` edges)
- `/audit-rules.json` — structured production anti-pattern and failure diagnostic rules
- `/concepts/<slug>.md` — canonical Markdown twin for every browser-internals concept
- `/autopsies/<slug>.md` — canonical Markdown twin + structured `Case File` for every Architecture Autopsy
- `/vs/<slug>.md` — canonical comparison matrix twins

All artifacts are cached in memory with a **1-hour TTL** (`3_600_000 ms`). If the network is unavailable, the server gracefully falls back to a local `public/` directory when configured via `FRONTEND_ROCKS_LOCAL_PUBLIC_DIR`.

## Quick Start

The server is hosted at `https://frontend.rocks/mcp` (Streamable HTTP). Nothing to install and no API key. This package is not published to npm.

### Claude Code

```bash
claude mcp add --transport http frontend-rocks https://frontend.rocks/mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "frontend-rocks": {
      "url": "https://frontend.rocks/mcp"
    }
  }
}
```

### Antigravity

```json
{
  "mcpServers": {
    "frontend-rocks": {
      "serverUrl": "https://frontend.rocks/mcp"
    }
  }
}
```

## Local development

From a clone of the repository, run the stdio server with `tsx`:

```bash
npx tsx packages/mcp-server/src/index.ts
```

## Available MCP Tools

| Tool | Inputs | Returns |
| :--- | :--- | :--- |
| `diagnose_symptom` | `{ query, devtools_error? }` | Ranked matching audit rules, probable causal chain concepts with `#lab` links, related autopsies with `#failure-simulator` links, and symptom pages. |
| `get_concept_internals` | `{ concept_id }` | Full Markdown twin (`/concepts/<slug>.md`) plus immediate graph neighbors (`requires`, `required_by`, `replaces`, `replaced_by`, `contrasts_with`, `under_the_hood`). Returns closest suggestions if not found. |
| `check_pattern_obsolescence` | `{ pattern_or_api }` | Obsolescence verdict (`superseded` / `legacy-pattern` vs Baseline status), native replacement primitives (`superseded_by` + `replaces` edges), and canonical `/vs/` comparison links. |
| `find_related_autopsy` | `{ concept_id_or_failure_mode }` | Ranked Architecture Autopsies with structured `CaseFile` summary (`trigger`, `root_cause`, `bad_fixes`, `fix`, `how_to_spot`, `canonical_url`). |

## Environment Variables (Optional)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `FRONTEND_ROCKS_BASE_URL` | `https://frontend.rocks` | Override base URL for public artifacts |
| `FRONTEND_ROCKS_LOCAL_PUBLIC_DIR` | _(auto-detected in monorepo)_ | Local `public/` directory used as offline fallback |

## License

MIT
