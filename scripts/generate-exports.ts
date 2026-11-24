import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getAllAutopsies, getAllConcepts } from '../src/lib/content-loader';
import { isListingIndexable } from '../src/lib/publication';
import { selectPublishableContent } from '../src/lib/publishable-content';
import {
  buildAutopsyMarkdownTwin,
  buildConceptMarkdownTwin,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  buildBuildInfo,
  buildVsMarkdownTwin,
  getGitLastModified,
  SITE_URL,
  type SitemapEntry,
} from '../src/lib/seo-exports';
import {
  renderAutopsyCoverPng,
  renderAutopsyOgPng,
  renderConceptOgPng,
  renderVsOgPng,
} from '../src/lib/og-generator';
import { extractVsPairs } from '../src/lib/vs-pairs';
import { PRODUCTION_SYMPTOMS } from '../src/config/symptoms';
import { buildSearchIndex } from '../src/lib/search-index';
import { PUBLIC_DIR, SITE_ROOT } from '../src/lib/paths';
import { parseCliArgs } from '../src/lib/cli-args';
import { buildIndexNowPending } from '../src/lib/indexnow';
import { buildAuditRulesCatalog, renderAuditCatalogMarkdown } from '../src/lib/audit-rules';

const PUBLIC_SKILL_REFS_DIR = path.join(process.cwd(), 'packages', 'public-skill', 'references');

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), { 'skip-og': 'boolean' });
  // OG images are the slow part of the build: PR builds and `npm run dev` skip them.
  const skipOg = args['skip-og'] === true || process.env.EXPORTS_SKIP_OG === '1';
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  // Written first: the daily deploy workflow reads the deployed commit from /build-info.json.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SITE_ROOT, encoding: 'utf8' }).trim();
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'build-info.json'),
    JSON.stringify(buildBuildInfo(process.env, commit), null, 2) + '\n'
  );
  const allConcepts = getAllConcepts();
  const allAutopsies = getAllAutopsies();
  const { concepts, autopsies, symptoms, vsPairs } = selectPublishableContent({
    concepts: allConcepts,
    autopsies: allAutopsies,
    symptoms: PRODUCTION_SYMPTOMS,
  });
  const allVsPairs = extractVsPairs(allConcepts, allAutopsies);

  // Titles are only used to label links, not to publish: built on every concept.
  const conceptTitles = new Map(allConcepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));

  // 1. Enriched llms.txt
  const llmsTxt = buildLlmsTxt({
    concepts,
    autopsies,
    vsPairs,
    productionSymptoms: symptoms,
  });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt);

  // 2. llms-full.txt
  const fullBlocks = concepts.map((c) => {
    const rels = c.frontmatter.relations
      .map((r) => `  - ${r.type} -> ${r.target_id}: ${r.note}`)
      .join('\n');
    return [
      `# ${c.frontmatter.title} (${c.frontmatter.id})`,
      `Domain: ${c.frontmatter.domain} | Maturity: ${c.frontmatter.maturity_status} | Verified: ${c.frontmatter.last_verified_at}`,
      `TL;DR: ${c.frontmatter.summary_tldr}`,
      rels ? `Relations:\n${rels}` : '',
      '',
      '## Under the Hood',
      c.sections.under_the_hood,
      '',
      '## Production Pitfalls',
      c.sections.production_pitfalls,
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const autopsyBlocks = autopsies.map((a) => {
    const cf = a.frontmatter.case_file;
    const chain = a.frontmatter.traversed_concepts
      .map((tc) => `  ${tc.step_order}. ${tc.concept_id}: ${tc.role_in_chain}`)
      .join('\n');
    return [
      `# ${a.frontmatter.title} (${a.frontmatter.id})`,
      `Case #${String(a.frontmatter.case_number).padStart(2, '0')} | Failure Mode: ${a.frontmatter.failure_mode} | Verified: ${a.frontmatter.last_verified_at}`,
      `Symptom: ${a.frontmatter.symptom}`,
      `Causal Chain:\n${chain}`,
      '',
      '## Case File',
      `Trigger: ${cf.trigger}`,
      `Root cause: ${cf.root_cause}`,
      ...cf.bad_fixes.map((b, i) => `Bad fix #${i + 1} (${b.label}): ${b.outcome}`),
      `Fix: ${cf.fix}`,
      `How to spot it: ${cf.how_to_spot}`,
      ...(cf.deleted ? [`Deleted / Replaced: ${cf.deleted}`] : []),
      '',
      '## The Incident',
      a.sections.incident_report,
      '',
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'llms-full.txt'),
    [...fullBlocks, ...autopsyBlocks].join('\n'),
  );

  // 3. graph.json (an edge whose target is not published is dropped)
  const publishedConceptIds = new Set(concepts.map((c) => c.frontmatter.id));
  const graphJson = {
    generated_at: new Date().toISOString(),
    node_count: concepts.length,
    nodes: concepts.map((c) => ({
      id: c.frontmatter.id,
      title: c.frontmatter.title,
      domain: c.frontmatter.domain,
      maturity_status: c.frontmatter.maturity_status,
      superseded_by: c.frontmatter.superseded_by ?? [],
      summary_tldr: c.frontmatter.summary_tldr,
      last_verified_at: c.frontmatter.last_verified_at,
      url: `${SITE_URL}/concepts/${c.frontmatter.id}/`,
    })),
    edges: concepts.flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => publishedConceptIds.has(r.target_id))
        .map((r) => ({
          source: c.frontmatter.id,
          target: r.target_id,
          type: r.type,
          note: r.note,
        })),
    ),
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, 'graph.json'), JSON.stringify(graphJson, null, 2));

  // 4. rss.xml: digests are not verified, so the channel is emitted without any <item>.
  const rssItems = '';

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>frontend.rocks — Curated Technical Watch</title>
    <link>${SITE_URL}/digest/</link>
    <description>5 to 8 high-signal frontend engineering updates linked to durable concepts in the knowledge graph.</description>
    <language>en</language>
${rssItems}
  </channel>
</rss>
`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'rss.xml'), rssXml);

  // 5. Markdown twins (public/concepts/[slug].md, public/autopsies/[slug].md, public/vs/[pair].md)
  const conceptsMdDir = path.join(PUBLIC_DIR, 'concepts');
  const autopsiesMdDir = path.join(PUBLIC_DIR, 'autopsies');
  const vsMdDir = path.join(PUBLIC_DIR, 'vs');
  // Wipe the three folders so no stale twin of a now-unpublished page survives.
  for (const dir of [conceptsMdDir, autopsiesMdDir, vsMdDir]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const c of concepts) {
    const md = buildConceptMarkdownTwin(c, conceptTitles);
    fs.writeFileSync(path.join(conceptsMdDir, `${c.frontmatter.id}.md`), md);
  }
  for (const a of autopsies) {
    const md = buildAutopsyMarkdownTwin(a, conceptTitles);
    fs.writeFileSync(path.join(autopsiesMdDir, `${a.frontmatter.id}.md`), md);
  }
  for (const pair of vsPairs) {
    const md = buildVsMarkdownTwin(pair, conceptTitles);
    fs.writeFileSync(path.join(vsMdDir, `${pair.slug}.md`), md);
  }

  // 6. robots.txt
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), buildRobotsTxt());

  // 7. sitemap.xml with Git-Freshness <lastmod>
  const symptomsConfigPath = path.join(process.cwd(), 'src', 'config', 'symptoms.ts');
  const symptomsLastMod = getGitLastModified(symptomsConfigPath, '2026-11-16');

  const listingEntries: Array<{ entry: SitemapEntry; publishedCount: number | null }> = [
    { entry: { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' }, publishedCount: null },
    {
      entry: { loc: `${SITE_URL}/autopsies/`, changefreq: 'weekly', priority: '0.9' },
      publishedCount: autopsies.length,
    },
    {
      entry: { loc: `${SITE_URL}/vs/`, changefreq: 'weekly', priority: '0.9' },
      publishedCount: vsPairs.length,
    },
    {
      entry: {
        loc: `${SITE_URL}/symptoms/`,
        lastmod: symptomsLastMod,
        changefreq: 'weekly',
        priority: '0.9',
      },
      publishedCount: symptoms.length,
    },
    {
      entry: { loc: `${SITE_URL}/graph/`, changefreq: 'weekly', priority: '0.8' },
      publishedCount: concepts.length,
    },
    {
      entry: { loc: `${SITE_URL}/index-list/`, changefreq: 'weekly', priority: '0.8' },
      publishedCount: concepts.length,
    },
    {
      entry: { loc: `${SITE_URL}/obsolescence/`, changefreq: 'weekly', priority: '0.8' },
      publishedCount: concepts.length,
    },
    // /digest/ is always excluded: digests are not verified.
    {
      entry: { loc: `${SITE_URL}/agents/`, changefreq: 'weekly', priority: '0.8' },
      publishedCount: null,
    },
  ];

  const sitemapEntries: SitemapEntry[] = [
    ...listingEntries
      .filter(({ publishedCount }) => publishedCount === null || isListingIndexable(publishedCount))
      .map(({ entry }) => entry),
    ...concepts.map((c) => ({
      loc: `${SITE_URL}/concepts/${c.frontmatter.id}/`,
      lastmod: getGitLastModified(c.filePath, c.frontmatter.last_verified_at),
      changefreq: 'monthly' as const,
      priority: '0.9',
    })),
    ...autopsies.map((a) => ({
      loc: `${SITE_URL}/autopsies/${a.frontmatter.id}/`,
      lastmod: getGitLastModified(a.filePath, a.frontmatter.last_verified_at),
      changefreq: 'monthly' as const,
      priority: '0.9',
    })),
    ...vsPairs.map((p) => {
      const modA = getGitLastModified(p.primary.filePath, p.primary.frontmatter.last_verified_at);
      const modB = getGitLastModified(
        p.secondary.filePath,
        p.secondary.frontmatter.last_verified_at,
      );
      return {
        loc: `${SITE_URL}/vs/${p.slug}/`,
        lastmod: modA >= modB ? modA : modB,
        changefreq: 'monthly' as const,
        priority: '0.8',
      };
    }),
    ...symptoms.map((s) => ({
      loc: `${SITE_URL}/symptoms/${s.slug}/`,
      lastmod: symptomsLastMod,
      changefreq: 'monthly' as const,
      priority: '0.8',
    })),
  ];
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), buildSitemapXml(sitemapEntries));

  // 7b. IndexNow: the deploy-succeeded Netlify function reads this file (it has no git history).
  const indexNowPending = buildIndexNowPending({
    commit,
    deployedCommit: process.env.DEPLOYED_COMMIT,
    publishedUrls: sitemapEntries.map((entry) => entry.loc),
    git: (args) => execFileSync('git', args, { cwd: SITE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
  });
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'indexnow-pending.json'),
    JSON.stringify(indexNowPending, null, 2) + '\n',
  );

  // 8. Static OG Images (1200x630 PNG) in public/og/ — generated for ALL pages (every page keeps
  // an accessible URL and a share image is not a content distribution channel).
  if (!skipOg) {
    const ogConceptsDir = path.join(PUBLIC_DIR, 'og', 'concepts');
    const ogAutopsiesDir = path.join(PUBLIC_DIR, 'og', 'autopsies');
    const ogVsDir = path.join(PUBLIC_DIR, 'og', 'vs');
    fs.mkdirSync(ogConceptsDir, { recursive: true });
    fs.mkdirSync(ogAutopsiesDir, { recursive: true });
    fs.mkdirSync(ogVsDir, { recursive: true });

    for (const c of allConcepts) {
      const png = await renderConceptOgPng(c);
      fs.writeFileSync(path.join(ogConceptsDir, `${c.frontmatter.id}.png`), png);
    }
    for (const a of allAutopsies) {
      const png = await renderAutopsyOgPng(a, conceptTitles);
      fs.writeFileSync(path.join(ogAutopsiesDir, `${a.frontmatter.id}.png`), png);
      const coverPng = await renderAutopsyCoverPng(a, conceptTitles);
      fs.writeFileSync(path.join(ogAutopsiesDir, `${a.frontmatter.id}-cover.png`), coverPng);
    }
    for (const pair of allVsPairs) {
      const png = await renderVsOgPng(pair);
      fs.writeFileSync(path.join(ogVsDir, `${pair.slug}.png`), png);
    }
  }

  // 9. Static Search Index (public/search-index.json)
  const searchIndex = buildSearchIndex({
    includeStaticPages: true,
    conceptsInput: concepts,
    autopsiesInput: autopsies,
    symptomsInput: symptoms,
    vsPairsInput: vsPairs,
    includeDigests: false,
  });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'search-index.json'), JSON.stringify(searchIndex));

  // 10. Public Audit Rules Catalog (public/audit-rules.json & packages/public-skill/references/audit-catalog.md)
  const auditCatalog = buildAuditRulesCatalog({
    concepts,
    autopsies,
    symptoms,
    onMissingReference: 'skip',
  });
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'audit-rules.json'),
    JSON.stringify(auditCatalog, null, 2),
  );
  fs.mkdirSync(PUBLIC_SKILL_REFS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PUBLIC_SKILL_REFS_DIR, 'audit-catalog.md'),
    renderAuditCatalogMarkdown(auditCatalog),
  );

  const twinCount = concepts.length + autopsies.length + vsPairs.length;
  const ogCount = skipOg
    ? 0
    : allConcepts.length + allAutopsies.length * 2 + allVsPairs.length;
  console.log(
    `✅ Generated exports (published ${concepts.length + autopsies.length + symptoms.length + vsPairs.length} / total ${allConcepts.length + allAutopsies.length + PRODUCTION_SYMPTOMS.length + allVsPairs.length}): llms.txt, llms-full.txt, graph.json (${concepts.length} nodes), audit-rules.json (${auditCatalog.rule_count} rules), packages/public-skill/references/audit-catalog.md, rss.xml (0 items), search-index.json (${searchIndex.length} items), ${twinCount} .md twins, robots.txt, sitemap.xml (${sitemapEntries.length} URLs), ${skipOg ? 'OG PNGs skipped' : `and ${ogCount} OG PNGs`}.`,
  );
}

main().catch((err) => {
  console.error('Failed to generate exports:', err);
  process.exit(1);
});
