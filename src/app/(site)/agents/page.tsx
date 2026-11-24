import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Bot, Cpu, FileCode2, Terminal } from 'lucide-react';
import { CopyCodeButton } from '@/components/concepts/CopyCodeButton';
import { buildAuditRulesCatalog } from '@/lib/audit-rules';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { selectPublishableContent } from '@/lib/publishable-content';
import { PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { SITE_URL } from '@/lib/seo-schema';
import './agents.css';

export const metadata: Metadata = {
  title: 'AI Agents, Audit Skill & MCP Server | frontend.rocks',
  description:
    'Install the frontend-rocks-audit skill, connect the hosted frontend.rocks MCP endpoint in Cursor, Claude Code, or Antigravity, and consume raw Markdown and JSON feeds.',
  alternates: {
    canonical: `${SITE_URL}/agents/`,
  },
  openGraph: {
    title: 'AI Agents, Audit Skill & MCP Server | frontend.rocks',
    description:
      'Install the frontend-rocks-audit skill, connect the hosted frontend.rocks MCP endpoint in Cursor, Claude Code, or Antigravity, and consume raw Markdown and JSON feeds.',
    url: `${SITE_URL}/agents/`,
    type: 'website',
  },
};

const SKILL_INSTALL_COMMAND =
  'npx skills add DavidBonnemaison/frontend-rocks-skills --skill frontend-rocks-audit';

const EXAMPLE_PROMPTS = [
  {
    id: 'full-audit',
    title: 'Full Codebase Production Audit',
    label: 'Copy full codebase audit prompt',
    prompt:
      'Use the frontend-rocks-audit skill to scan this frontend codebase for high-impact browser-internals bugs (IndexedDB deadlocks, Service Worker cache mismatches, CSS stacking/VRAM traps, React race conditions, and bfcache blockers). Report file paths, line numbers, severity, and concrete fixes.',
  },
  {
    id: 'pr-diff-audit',
    title: 'Targeted PR / Diff Review',
    label: 'Copy targeted PR audit prompt',
    prompt:
      'Run frontend-rocks-audit on the current git diff. Flag any regression matching the frontend.rocks production audit catalog, explain the browser engine root cause, and link the matching autopsy or concept URL.',
  },
  {
    id: 'symptom-triage',
    title: 'Production Symptom Triage',
    label: 'Copy symptom triage prompt',
    prompt:
      'Users report stale chunks and frozen IndexedDB upgrades after deploy. Use frontend-rocks-audit to inspect our Service Worker, indexedDB.open() calls, and pagehide handlers, then propose a coordinated fix.',
  },
] as const;

const REMOTE_MCP_URL = 'https://frontend.rocks/mcp';

const CURSOR_REMOTE_MCP_CONFIG = `{
  "mcpServers": {
    "frontend-rocks": {
      "url": "https://frontend.rocks/mcp"
    }
  }
}`;

const CLAUDE_CODE_REMOTE_MCP_CMD =
  'claude mcp add --transport http frontend-rocks https://frontend.rocks/mcp';

const ANTIGRAVITY_REMOTE_MCP_CONFIG = `{
  "mcpServers": {
    "frontend-rocks": {
      "serverUrl": "https://frontend.rocks/mcp"
    }
  }
}`;

const MCP_TOOLS = [
  {
    name: 'diagnose_symptom',
    description:
      'Matches a DevTools warning, runtime error, or production symptom query against audit-rules.json, production symptoms, and the knowledge graph.',
    input: '{ query: string, devtools_error?: string }',
    returns:
      'Ranked diagnostic matches with probable causal chain, linked Architecture Autopsies, Browser Internals concepts, and interactive lab links.',
  },
  {
    name: 'get_concept_internals',
    description:
      'Retrieves the full Markdown twin for a specific browser concept along with its immediate knowledge-graph neighbors.',
    input: '{ concept_id: string }',
    returns:
      'Full /concepts/<concept_id>.md twin plus immediate incoming/outgoing graph relations (requires, replaces, contrasts_with) and canonical URLs.',
  },
  {
    name: 'check_pattern_obsolescence',
    description:
      'Evaluates whether a legacy frontend API or library pattern is superseded or legacy-pattern in the graph and identifies its Baseline-native replacement.',
    input: '{ pattern_or_api: string }',
    returns:
      'Obsolescence verdict, maturity_status / Baseline tier, native replacement primitive(s) via superseded_by and replaces edges, and /vs/ comparison links.',
  },
  {
    name: 'find_related_autopsy',
    description:
      'Looks up production post-mortems by concept_id, failure mode, or autopsy slug so the agent can cite real incident evidence.',
    input: '{ concept_id_or_failure_mode: string }',
    returns:
      'Matching Architecture Autopsies with structured CaseFile summaries (trigger, root_cause, bad_fixes, fix, how_to_spot) and canonical URLs.',
  },
] as const;

const CURL_MARKDOWN_SNIPPET =
  'curl -H "Accept: text/markdown" https://frontend.rocks/concepts/browser-rendering-pipeline/';

export default function AgentsPage() {
  const published = selectPublishableContent({
    concepts: getAllConcepts(),
    autopsies: getAllAutopsies(),
    symptoms: PRODUCTION_SYMPTOMS,
  });
  const catalog = buildAuditRulesCatalog({
    concepts: published.concepts,
    autopsies: published.autopsies,
    symptoms: published.symptoms,
    onMissingReference: 'skip',
  });
  const hasRules = catalog.rule_count > 0;

  const rulesByCategory = catalog.categories.map((category) => ({
    category,
    rules: catalog.rules.filter((rule) => rule.category === category),
  }));

  return (
    <div className="agents-page">
      <header className="agents-hero">
        <div className="agents-eyebrow">
          <span className="badge badge-baseline-newly">
            <Bot size={12} style={{ marginRight: '6px' }} aria-hidden="true" />
            Agent-Native Ecosystem · {catalog.rule_count} Audit Rules · 4 MCP Tools
          </span>
        </div>

        <h1 className="agents-title">frontend.rocks for AI Agents</h1>
        <p className="agents-subtitle">
          Give your coding agent direct access to browser-internals mechanics, production autopsy
          case files, and {catalog.rule_count} deterministic audit rules—via an installable Agent
          Skill, the hosted MCP endpoint, or raw Markdown and JSON feeds.
        </p>

        <nav className="agents-jump-nav" aria-label="Agent integration sections">
          <a href="#audit-skill" className="agents-jump-link">
            <Terminal size={14} aria-hidden="true" />
            1. Audit Skill
          </a>
          <a href="#mcp-server" className="agents-jump-link">
            <Cpu size={14} aria-hidden="true" />
            2. MCP Server
          </a>
          <a href="#machine-interfaces" className="agents-jump-link">
            <FileCode2 size={14} aria-hidden="true" />
            3. Raw Machine Interfaces
          </a>
        </nav>
      </header>

      {/* Section 1 — Install the Audit Skill */}
      <section id="audit-skill" className="agents-section" aria-labelledby="audit-skill-heading">
        <div className="agents-section-header">
          <span className="agents-section-kicker">01 // Agent Skill</span>
          <h2 id="audit-skill-heading" className="agents-section-title">
            Install the Audit Skill (<code>frontend-rocks-audit</code>)
          </h2>
          <p className="agents-section-lead">
            Install the public <code>frontend-rocks-audit</code> skill once to equip your coding
            agent with an offline-ready catalog of {catalog.rule_count} production failure patterns
            across {catalog.categories.length} browser-internals categories.
          </p>
        </div>

        <div className="agents-code-shell code-block-shell">
          <div className="code-block-header">
            <span className="code-lang-badge">BASH · INSTALL</span>
            <CopyCodeButton rawCode={SKILL_INSTALL_COMMAND} label="Copy skill install command" />
          </div>
          <pre className="agents-code-pre">
            <code>{SKILL_INSTALL_COMMAND}</code>
          </pre>
        </div>

        <h3 className="agents-subsection-title">Ready-to-Copy Audit Prompts</h3>
        <div className="agents-prompts-grid">
          {EXAMPLE_PROMPTS.map((item) => (
            <article key={item.id} className="agents-prompt-card code-block-shell">
              <div className="code-block-header">
                <span className="code-lang-badge">PROMPT · {item.title.toUpperCase()}</span>
                <CopyCodeButton rawCode={item.prompt} label={item.label} />
              </div>
              <p className="agents-prompt-body">{item.prompt}</p>
            </article>
          ))}
        </div>

        <h3 className="agents-subsection-title">
          Detected Bug Categories ({catalog.rule_count} Rules Across {catalog.categories.length}{' '}
          Categories)
        </h3>
        {hasRules ? (
          <div className="agents-categories-grid">
            {rulesByCategory.map(({ category, rules }) => (
              <article key={category} className="agents-category-card">
                <div className="agents-category-head">
                  <h4 className="agents-category-name">{category}</h4>
                  <span className="badge">
                    {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
                  </span>
                </div>
                <ul className="agents-rule-list">
                  {rules.map((rule) => {
                    const primaryAutopsy = rule.autopsy_ids[0];
                    const primaryConcept = rule.concept_ids[0];
                    const targetHref = primaryAutopsy
                      ? `/autopsies/${primaryAutopsy}/`
                      : `/concepts/${primaryConcept}/`;
                    const targetLabel = primaryAutopsy
                      ? `Autopsy: ${primaryAutopsy}`
                      : `Concept: ${primaryConcept}`;

                    return (
                      <li key={rule.id} className="agents-rule-item">
                        <div className="agents-rule-top">
                          <span className="agents-rule-title">{rule.title}</span>
                          <span className={`agents-severity agents-severity-${rule.severity}`}>
                            {rule.severity}
                          </span>
                        </div>
                        <div className="agents-rule-meta">
                          <code>{rule.id}</code>
                          <span aria-hidden="true">·</span>
                          <Link href={targetHref} className="agents-rule-link">
                            {targetLabel}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="agents-section-lead" data-testid="agents-empty-catalog">
            No proven audit rules yet.
          </p>
        )}
      </section>

      {/* Section 2 — Connect the MCP Server */}
      <section id="mcp-server" className="agents-section" aria-labelledby="mcp-server-heading">
        <div className="agents-section-header">
          <span className="agents-section-kicker">02 // Model Context Protocol</span>
          <h2 id="mcp-server-heading" className="agents-section-title">
            Connect the MCP Server (<code>{REMOTE_MCP_URL}</code>)
          </h2>
          <p className="agents-section-lead">
            Query the full <code>frontend.rocks</code> knowledge graph directly from your IDE or
            agent runtime through the hosted Streamable HTTP endpoint. Nothing to install, zero API
            keys, zero telemetry, 1-hour in-memory cache over live JSON and Markdown artifacts.
          </p>
        </div>

        <h3 className="agents-subsection-title">Hosted Streamable HTTP Endpoint</h3>
        <div className="agents-clients-grid">
          <article className="agents-client-card">
            <div className="agents-client-head">
              <h4 className="agents-client-name">Cursor (Remote)</h4>
              <span className="badge">.cursor/mcp.json</span>
            </div>
            <p className="agents-client-note">
              Connect directly to <code>{REMOTE_MCP_URL}</code> with no Node.js or npm setup.
            </p>
            <div className="agents-code-shell code-block-shell">
              <div className="code-block-header">
                <span className="code-lang-badge">JSON · CURSOR HTTP</span>
                <CopyCodeButton
                  rawCode={CURSOR_REMOTE_MCP_CONFIG}
                  label="Copy Cursor remote HTTP MCP configuration"
                />
              </div>
              <pre className="agents-code-pre">
                <code>{CURSOR_REMOTE_MCP_CONFIG}</code>
              </pre>
            </div>
          </article>

          <article className="agents-client-card">
            <div className="agents-client-head">
              <h4 className="agents-client-name">Claude Code (Remote)</h4>
              <span className="badge">HTTP · CLI</span>
            </div>
            <p className="agents-client-note">
              Register the hosted Streamable HTTP endpoint in one command.
            </p>
            <div className="agents-code-shell code-block-shell">
              <div className="code-block-header">
                <span className="code-lang-badge">BASH · CLAUDE CODE HTTP</span>
                <CopyCodeButton
                  rawCode={CLAUDE_CODE_REMOTE_MCP_CMD}
                  label="Copy Claude Code remote HTTP MCP command"
                />
              </div>
              <pre className="agents-code-pre">
                <code>{CLAUDE_CODE_REMOTE_MCP_CMD}</code>
              </pre>
            </div>
          </article>

          <article className="agents-client-card">
            <div className="agents-client-head">
              <h4 className="agents-client-name">Antigravity (Remote)</h4>
              <span className="badge">serverUrl</span>
            </div>
            <p className="agents-client-note">
              Point Antigravity directly at the hosted Streamable HTTP endpoint.
            </p>
            <div className="agents-code-shell code-block-shell">
              <div className="code-block-header">
                <span className="code-lang-badge">JSON · ANTIGRAVITY HTTP</span>
                <CopyCodeButton
                  rawCode={ANTIGRAVITY_REMOTE_MCP_CONFIG}
                  label="Copy Antigravity remote HTTP MCP configuration"
                />
              </div>
              <pre className="agents-code-pre">
                <code>{ANTIGRAVITY_REMOTE_MCP_CONFIG}</code>
              </pre>
            </div>
          </article>
        </div>

        <h3 className="agents-subsection-title">Available MCP Tools (4)</h3>
        <div className="agents-tools-grid">
          {MCP_TOOLS.map((tool) => (
            <article key={tool.name} className="agents-tool-card">
              <h4 className="agents-tool-name">{tool.name}</h4>
              <p className="agents-tool-desc">{tool.description}</p>
              <div className="agents-tool-io">
                <div className="agents-tool-io-row">
                  <span className="agents-tool-io-label">Input:</span>
                  <code>{tool.input}</code>
                </div>
                <div className="agents-tool-io-row">
                  <span className="agents-tool-io-label">Returns:</span>
                  <span>{tool.returns}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Section 3 — Raw Machine Interfaces */}
      <section
        id="machine-interfaces"
        className="agents-section"
        aria-labelledby="machine-interfaces-heading"
      >
        <div className="agents-section-header">
          <span className="agents-section-kicker">03 // Direct Endpoints</span>
          <h2 id="machine-interfaces-heading" className="agents-section-title">
            Raw Machine Interfaces
          </h2>
          <p className="agents-section-lead">
            Prefer plain HTTP? Every concept, autopsy, and comparison page ships a clean Markdown
            twin, alongside structured JSON feeds for custom pipelines and RAG indexing.
          </p>
        </div>

        <div className="agents-interfaces-grid">
          <a href="/llms.txt" className="agents-interface-card">
            <div className="agents-interface-top">
              <span className="agents-interface-path">/llms.txt</span>
              <span className="badge">text/plain</span>
            </div>
            <p className="agents-interface-desc">
              Compact index of every concept, architecture autopsy, comparison pair, and production
              symptom trigger with direct .md URLs.
            </p>
          </a>

          <a href="/llms-full.txt" className="agents-interface-card">
            <div className="agents-interface-top">
              <span className="agents-interface-path">/llms-full.txt</span>
              <span className="badge">text/plain</span>
            </div>
            <p className="agents-interface-desc">
              Complete single-file Markdown corpus containing every concept and autopsy for bulk
              context loading.
            </p>
          </a>

          <a href="/graph.json" className="agents-interface-card">
            <div className="agents-interface-top">
              <span className="agents-interface-path">/graph.json</span>
              <span className="badge">application/json</span>
            </div>
            <p className="agents-interface-desc">
              Full browser-internals knowledge graph: typed nodes, maturity statuses, replacement
              edges, and canonical URLs.
            </p>
          </a>

          <a href="/audit-rules.json" className="agents-interface-card">
            <div className="agents-interface-top">
              <span className="agents-interface-path">/audit-rules.json</span>
              <span className="badge">{catalog.rule_count} rules</span>
            </div>
            <p className="agents-interface-desc">
              Machine-readable catalog of all {catalog.rule_count} production audit rules with
              detection signals, pattern hints, and autopsy references.
            </p>
          </a>

          {hasRules && (
            <>
              <a href="/concepts/browser-rendering-pipeline.md" className="agents-interface-card">
                <div className="agents-interface-top">
                  <span className="agents-interface-path">
                    /concepts/browser-rendering-pipeline.md
                  </span>
                  <span className="badge">Markdown Twin</span>
                </div>
                <p className="agents-interface-desc">
                  Example concept Markdown twin—append <code>.md</code> to any{' '}
                  <code>/concepts/</code> or <code>/vs/</code> slug to skip HTML boilerplate.
                </p>
              </a>

              <a
                href="/autopsies/indexeddb-versionchange-deadlock.md"
                className="agents-interface-card"
              >
                <div className="agents-interface-top">
                  <span className="agents-interface-path">
                    /autopsies/indexeddb-versionchange-deadlock.md
                  </span>
                  <span className="badge">Markdown Twin</span>
                </div>
                <p className="agents-interface-desc">
                  Example autopsy Markdown twin with full Case File metadata, causal chain, and
                  architectural fix.
                </p>
              </a>
            </>
          )}
        </div>

        <h3 className="agents-subsection-title">
          HTTP Content Negotiation (Accept: text/markdown)
        </h3>
        <div className="agents-code-shell code-block-shell">
          <div className="code-block-header">
            <span className="code-lang-badge">BASH · CURL</span>
            <CopyCodeButton
              rawCode={CURL_MARKDOWN_SNIPPET}
              label="Copy curl Markdown content negotiation command"
            />
          </div>
          <pre className="agents-code-pre">
            <code>{CURL_MARKDOWN_SNIPPET}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
