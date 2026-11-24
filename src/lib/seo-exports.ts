import { execFileSync } from 'child_process';
import type { LoadedAutopsy, LoadedConcept } from './content-loader';
import { formatDomainLabel, formatFailureModeLabel, formatMaturityLabel } from './ui-strings';

export const SITE_URL = 'https://frontend.rocks';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getGitLastModified(filePath: string, fallbackDate: string): string {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', filePath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    // Fallback to frontmatter last_verified_at when git history is unavailable
  }
  return fallbackDate;
}

function cleanMdxBodyForMarkdown(body: string): string {
  // Remove self-closing or block JSX components if any appear outside fenced code blocks
  const lines = body.split('\n');
  const cleaned: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      cleaned.push(line);
      continue;
    }
    if (!inFence && /^\s*<[A-Z][A-Za-z0-9]*[\s/>]/.test(line)) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildConceptMarkdownTwin(
  concept: LoadedConcept,
  conceptTitles: Map<string, string>
): string {
  const { frontmatter, body } = concept;
  const prerequisites = frontmatter.relations
    .filter((r) => r.type === 'requires')
    .map((r) => {
      const title = conceptTitles.get(r.target_id) ?? r.target_id;
      return `- [${title}](${SITE_URL}/concepts/${r.target_id}.md): ${r.note}`;
    });

  const headerLines = [
    `# ${frontmatter.title}`,
    '',
    `- **Canonical URL:** ${SITE_URL}/concepts/${frontmatter.id}/`,
    `- **Domain:** ${formatDomainLabel(frontmatter.domain)}`,
    `- **Baseline / Maturity Status:** ${formatMaturityLabel(frontmatter.maturity_status)}`,
    `- **Last Verified:** ${frontmatter.last_verified_at}`,
    `- **TL;DR:** ${frontmatter.summary_tldr}`,
    '',
    ...(prerequisites.length > 0 ? ['## Prerequisites', ...prerequisites, ''] : []),
    '## Primary Sources',
    ...frontmatter.sources.map((src) => `- ${src}`),
    '',
    '---',
    '',
  ];

  return `${headerLines.join('\n')}${cleanMdxBodyForMarkdown(body)}\n`;
}

export function buildAutopsyMarkdownTwin(
  autopsy: LoadedAutopsy,
  conceptTitles: Map<string, string>
): string {
  const { frontmatter, body } = autopsy;
  const cf = frontmatter.case_file;
  const chain = [...frontmatter.traversed_concepts]
    .sort((a, b) => a.step_order - b.step_order)
    .map((tc) => {
      const title = conceptTitles.get(tc.concept_id) ?? tc.concept_id;
      return `${tc.step_order}. [${title}](${SITE_URL}/concepts/${tc.concept_id}.md): ${tc.role_in_chain}`;
    });

  const caseFileLines = [
    '## Case File',
    `- **Trigger:** ${cf.trigger}`,
    `- **Symptom:** ${cf.symptom}`,
    `- **Root cause:** ${cf.root_cause}`,
    ...cf.bad_fixes.map((b, i) => `- **Bad fix #${i + 1} (${b.label}):** ${b.outcome}`),
    `- **Fix:** ${cf.fix}`,
    `- **How to spot it:** ${cf.how_to_spot}`,
    ...(cf.deleted ? [`- **Deleted / Replaced:** ${cf.deleted}`] : []),
  ];

  const headerLines = [
    `# ${frontmatter.title}`,
    '',
    `- **Canonical URL:** ${SITE_URL}/autopsies/${frontmatter.id}/`,
    `- **Case:** #${String(frontmatter.case_number).padStart(2, '0')}`,
    `- **Failure Mode:** ${formatFailureModeLabel(frontmatter.failure_mode)}`,
    `- **Production Symptom:** ${frontmatter.symptom}`,
    `- **Last Verified:** ${frontmatter.last_verified_at}`,
    '',
    ...caseFileLines,
    '',
    '## Causal Chain',
    ...chain,
    '',
    '## Primary Sources',
    ...frontmatter.sources.map((src) => `- ${src}`),
    '',
    '---',
    '',
  ];

  return `${headerLines.join('\n')}${cleanMdxBodyForMarkdown(body)}\n`;
}

import type { ProductionSymptomConfig } from '../config/symptoms';
import type { VsPair } from './vs-pairs';
import { splitProductionPitfalls, stripMarkdown } from './seo-schema';

export function buildVsMarkdownTwin(
  pair: VsPair,
  conceptTitles: Map<string, string>
): string {
  const { primary, secondary, relationType, note, relatedAutopsies, sources, dateModified } = pair;
  const pFm = primary.frontmatter;
  const sFm = secondary.frontmatter;
  const pPitfalls = splitProductionPitfalls(primary.sections.production_pitfalls);
  const sPitfalls = splitProductionPitfalls(secondary.sections.production_pitfalls);

  const pReqs = pFm.relations
    .filter((r) => r.type === 'requires')
    .map((r) => `${conceptTitles.get(r.target_id) ?? r.target_id} (${r.note})`)
    .join('; ');
  const sReqs = sFm.relations
    .filter((r) => r.type === 'requires')
    .map((r) => `${conceptTitles.get(r.target_id) ?? r.target_id} (${r.note})`)
    .join('; ');

  const lines = [
    `# ${pFm.title} vs ${sFm.title}`,
    '',
    `- **Canonical URL:** ${SITE_URL}/vs/${pair.slug}/`,
    `- **Relation:** ${relationType === 'replaces' ? 'Replaces' : 'Contrasts With'}`,
    `- **Last Verified:** ${dateModified}`,
    `- **Verdict:** ${note}`,
    '',
    '## Comparison Matrix',
    '',
    `| Dimension | ${pFm.title} | ${sFm.title} |`,
    '| :--- | :--- | :--- |',
    `| **Maturity** | ${formatMaturityLabel(pFm.maturity_status)} | ${formatMaturityLabel(sFm.maturity_status)} |`,
    `| **Domain** | ${formatDomainLabel(pFm.domain)} | ${formatDomainLabel(sFm.domain)} |`,
    `| **Mental Model** | ${pFm.summary_tldr} | ${sFm.summary_tldr} |`,
    `| **Prerequisites** | ${pReqs || 'None'} | ${sReqs || 'None'} |`,
    `| **When Not to Use** | ${stripMarkdown(pPitfalls.whenNotToUse || pPitfalls.mainPitfalls)} | ${stripMarkdown(sPitfalls.whenNotToUse || sPitfalls.mainPitfalls)} |`,
    '',
    `## ${pFm.title} — Under the Hood`,
    cleanMdxBodyForMarkdown(primary.sections.under_the_hood),
    '',
    `## ${sFm.title} — Under the Hood`,
    cleanMdxBodyForMarkdown(secondary.sections.under_the_hood),
    '',
    '## Interactive Labs & Dissections',
    `- [${pFm.title} Lab](${SITE_URL}/concepts/${pFm.id}/#lab) ([Markdown](${SITE_URL}/concepts/${pFm.id}.md))`,
    `- [${sFm.title} Lab](${SITE_URL}/concepts/${sFm.id}/#lab) ([Markdown](${SITE_URL}/concepts/${sFm.id}.md))`,
    ...(relatedAutopsies.length > 0
      ? [
          '',
          '## Related Architecture Autopsies',
          ...relatedAutopsies.map(
            (a) =>
              `- [${a.frontmatter.title}](${SITE_URL}/autopsies/${a.frontmatter.id}/) ([Markdown](${SITE_URL}/autopsies/${a.frontmatter.id}.md)): ${a.frontmatter.symptom}`
          ),
        ]
      : []),
    '',
    '## Primary Sources',
    ...sources.map((src) => `- ${src}`),
    '',
  ];

  return lines.join('\n');
}

export function buildLlmsTxt(params: {
  concepts: LoadedConcept[];
  autopsies: LoadedAutopsy[];
  vsPairs?: VsPair[];
  productionSymptoms?: ProductionSymptomConfig[];
}): string {
  const { concepts, autopsies, vsPairs = [], productionSymptoms = [] } = params;

  const lines = [
    '# frontend.rocks',
    '',
    '> Interactive frontend engineering knowledge graph: browser internals, problem genealogy, architecture autopsies, and curated technical watch.',
    '',
    ...(productionSymptoms.length > 0
      ? [
          '## Symptom Triggers & Production Symptom Hubs',
          ...productionSymptoms.map(
            (ps) =>
              `- [${ps.search_title}](${SITE_URL}/symptoms/${ps.slug}/): ${ps.summary} (Signature: ${ps.devtools_signature})`
          ),
          '',
        ]
      : []),
    ...(concepts.length > 0
      ? [
          '## Concepts',
          ...concepts.map(
            (c) =>
              `- [${c.frontmatter.title}](${SITE_URL}/concepts/${c.frontmatter.id}.md) ([HTML](${SITE_URL}/concepts/${c.frontmatter.id}/)): ${c.frontmatter.summary_tldr} (${c.frontmatter.domain}, ${c.frontmatter.maturity_status}) · Anchors: [Under the Hood](${SITE_URL}/concepts/${c.frontmatter.id}/#under-the-hood), [Production Pitfalls](${SITE_URL}/concepts/${c.frontmatter.id}/#production-pitfalls)`
          ),
          '',
        ]
      : []),
    ...(vsPairs.length > 0
      ? [
          '## Comparative Trade-Offs (/vs/)',
          `- [Compare Primitives Hub](${SITE_URL}/vs/): Filterable index of all ${vsPairs.length} mechanical X vs Y comparisons (Replaces Legacy & Contrasts With).`,
          ...vsPairs.map(
            (p) =>
              `- [${p.primary.frontmatter.title} vs ${p.secondary.frontmatter.title}](${SITE_URL}/vs/${p.slug}.md) ([HTML](${SITE_URL}/vs/${p.slug}/)): ${p.note}`
          ),
          '',
        ]
      : []),
    ...(autopsies.length > 0
      ? [
          '## Architecture Autopsies',
          ...autopsies.map(
            (a) =>
              `- [${a.frontmatter.title}](${SITE_URL}/autopsies/${a.frontmatter.id}.md) ([HTML](${SITE_URL}/autopsies/${a.frontmatter.id}/)): Symptom: ${a.frontmatter.symptom} (${a.frontmatter.failure_mode}) · Anchor: [Architectural Fix](${SITE_URL}/autopsies/${a.frontmatter.id}/#architectural-fix)`
          ),
          '',
        ]
      : []),
    '## Machine-Readable Exports',
    `- [Full Knowledge Base](${SITE_URL}/llms-full.txt)`,
    `- [Directed Knowledge Graph JSON](${SITE_URL}/graph.json)`,
    `- [Frontend Audit Rules JSON](${SITE_URL}/audit-rules.json)`,
    `- [Weekly Digest RSS](${SITE_URL}/rss.xml)`,
    `- [XML Sitemap](${SITE_URL}/sitemap.xml)`,
    '',
  ];

  return lines.join('\n');
}

export function buildRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `LLMs-Txt: ${SITE_URL}/llms.txt`,
    '',
  ].join('\n');
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: string;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '',
        entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : '',
        entry.priority ? `    <priority>${entry.priority}</priority>` : '',
      ].filter(Boolean);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
