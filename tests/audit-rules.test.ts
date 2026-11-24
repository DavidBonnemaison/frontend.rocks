import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_CATEGORIES,
  AuditRulesCatalogSchema,
  buildAuditRulesCatalog,
  renderAuditCatalogMarkdown,
  scanProjectFilesForAuditRules,
} from '@/lib/audit-rules';
import {
  buildPublicSkillBundle,
  PUBLIC_SKILL_WHITELIST,
} from '@/lib/public-skill-bundle';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { extractVsPairs } from '@/lib/vs-pairs';
import { SITE_URL } from '@/lib/seo-exports';

// Synthetic artifacts (tests/fixtures/build-public-fixtures.ts): real public/ files are generated and filtered at build time.
const FIXTURE_PUBLIC_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'public');
const PUBLIC_AUDIT_RULES_PATH = path.join(FIXTURE_PUBLIC_DIR, 'audit-rules.json');
const PUBLIC_SKILL_DIR = path.join(process.cwd(), 'packages', 'public-skill');
const PUBLIC_SKILL_CATALOG_MD_PATH = path.join(FIXTURE_PUBLIC_DIR, 'audit-catalog.md');

// packages/public-skill/references/audit-catalog.md is generated at build time and never exported
// to the public repo, so the bundle tests build their source from the tracked skill files plus the
// fixture catalog.
function makePublicSkillSource(): string {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-rocks-skill-src-'));
  for (const rel of ['LICENSE', 'README.md', 'SKILL.md']) {
    fs.copyFileSync(path.join(PUBLIC_SKILL_DIR, rel), path.join(src, rel));
  }
  fs.mkdirSync(path.join(src, 'references'), { recursive: true });
  fs.copyFileSync(PUBLIC_SKILL_CATALOG_MD_PATH, path.join(src, 'references', 'audit-catalog.md'));
  return src;
}

function buildValidSiteRouteSet(): Set<string> {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const vsPairs = extractVsPairs(concepts, autopsies);

  const validUrls = new Set<string>([
    `${SITE_URL}/`,
    `${SITE_URL}/agents/`,
    `${SITE_URL}/autopsies/`,
    `${SITE_URL}/concepts/`,
    `${SITE_URL}/digest/`,
    `${SITE_URL}/graph/`,
    `${SITE_URL}/index-list/`,
    `${SITE_URL}/obsolescence/`,
    `${SITE_URL}/symptoms/`,
    `${SITE_URL}/vs/`,
    `${SITE_URL}/audit-rules.json`,
    `${SITE_URL}/graph.json`,
    `${SITE_URL}/llms.txt`,
    `${SITE_URL}/llms-full.txt`,
  ]);

  for (const c of concepts) {
    validUrls.add(`${SITE_URL}/concepts/${c.frontmatter.id}/`);
    validUrls.add(`${SITE_URL}/concepts/${c.frontmatter.id}.md`);
  }
  for (const a of autopsies) {
    validUrls.add(`${SITE_URL}/autopsies/${a.frontmatter.id}/`);
    validUrls.add(`${SITE_URL}/autopsies/${a.frontmatter.id}.md`);
  }
  for (const s of PRODUCTION_SYMPTOMS) {
    validUrls.add(`${SITE_URL}/symptoms/${s.slug}/`);
  }
  for (const p of vsPairs) {
    validUrls.add(`${SITE_URL}/vs/${p.slug}/`);
    validUrls.add(`${SITE_URL}/vs/${p.slug}.md`);
  }

  return validUrls;
}

describe('US-19.1: Deterministic Audit Rules Catalog & Public Skill', () => {
  // The generator is tested on the full, unfiltered content (publication filtering is tested elsewhere).
  const buildFull = (generatedAt: string) =>
    buildAuditRulesCatalog({
      concepts: getAllConcepts(),
      autopsies: getAllAutopsies(),
      symptoms: PRODUCTION_SYMPTOMS,
      generatedAt,
    });
  const catalog = buildFull('2026-11-21T00:00:00.000Z');
  const autopsies = getAllAutopsies();

  it('validates buildAuditRulesCatalog() against the schema and a published-style fixture catalog', () => {
    expect(() => AuditRulesCatalogSchema.parse(catalog)).not.toThrow();
    expect(catalog.rule_count).toBeGreaterThanOrEqual(20);
    expect(catalog.rule_count).toBeLessThanOrEqual(30);
    expect(catalog.rules).toHaveLength(catalog.rule_count);

    // All expected categories are populated
    for (const category of AUDIT_CATEGORIES) {
      expect(catalog.categories).toContain(category);
      expect(catalog.rules.some((r) => r.category === category)).toBe(true);
    }

    // All 14 autopsies are covered by at least one audit rule
    const coveredAutopsies = new Set(catalog.rules.flatMap((r) => r.autopsy_ids));
    for (const autopsy of autopsies) {
      expect(
        coveredAutopsies.has(autopsy.frontmatter.id),
        `Missing audit rule coverage for autopsy ${autopsy.frontmatter.id}`
      ).toBe(true);
    }

    // All 7 explicit US-19.1 signatures are present
    const ruleIds = new Set(catalog.rules.map((r) => r.id));
    expect(ruleIds.has('idb-open-without-versionchange')).toBe(true);
    expect(ruleIds.has('sw-uncoordinated-skipwaiting-claim')).toBe(true);
    expect(ruleIds.has('unload-listener-blocks-bfcache')).toBe(true);
    expect(ruleIds.has('css-static-will-change-on-lists')).toBe(true);
    expect(ruleIds.has('checkout-mutation-without-idempotency')).toBe(true);
    expect(ruleIds.has('useeffect-fetch-without-abort-or-stable-deps')).toBe(true);
    expect(ruleIds.has('css-zindex-trapped-in-stacking-context')).toBe(true);

    // A quarantined (nothing published) catalog is empty and valid
    const empty = buildAuditRulesCatalog({
      concepts: [],
      autopsies: [],
      symptoms: [],
      onMissingReference: 'skip',
    });
    expect(empty.rule_count).toBe(0);
    expect(() => AuditRulesCatalogSchema.parse(empty)).not.toThrow();

    // Without 'skip', a missing reference still throws
    expect(() => buildAuditRulesCatalog({ concepts: [], autopsies: [], symptoms: [] })).toThrow();

    // Fixture catalog passes the schema
    expect(fs.existsSync(PUBLIC_AUDIT_RULES_PATH)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(PUBLIC_AUDIT_RULES_PATH, 'utf-8'));
    expect(AuditRulesCatalogSchema.parse(persisted).rule_count).toBe(2);
  });

  it('renders deterministic Markdown for packages/public-skill/references/audit-catalog.md', () => {
    const md1 = renderAuditCatalogMarkdown(buildFull('2026-01-01T00:00:00.000Z'));
    const md2 = renderAuditCatalogMarkdown(buildFull('2026-12-31T23:59:59.000Z'));
    expect(md1).toBe(md2);

    // The fixture Markdown is rendered by the same function from the fixture catalog
    expect(fs.existsSync(PUBLIC_SKILL_CATALOG_MD_PATH)).toBe(true);
    const persistedMd = fs.readFileSync(PUBLIC_SKILL_CATALOG_MD_PATH, 'utf-8');
    const fixtureCatalog = AuditRulesCatalogSchema.parse(
      JSON.parse(fs.readFileSync(PUBLIC_AUDIT_RULES_PATH, 'utf-8'))
    );
    expect(persistedMd).toBe(renderAuditCatalogMarkdown(fixtureCatalog));
  });

  it('verifies 100% of https://frontend.rocks/... URLs generated from real content correspond to real routes', () => {
    const validRoutes = buildValidSiteRouteSet();
    const urlRegex = /https:\/\/frontend\.rocks\/[a-z0-9\-/._]+/gi;

    // 1. Markdown rendered from the full catalog
    const mdUrls = Array.from(new Set(renderAuditCatalogMarkdown(catalog).match(urlRegex) ?? []));
    expect(mdUrls.length).toBeGreaterThan(30);
    for (const url of mdUrls) {
      expect(validRoutes.has(url), `Dead or unknown URL in audit catalog Markdown: ${url}`).toBe(true);
    }

    // 2. Canonical URLs of every rule
    for (const rule of catalog.rules) {
      for (const url of [
        ...rule.canonical_urls.autopsies,
        ...rule.canonical_urls.concepts,
        ...rule.canonical_urls.symptoms,
      ]) {
        expect(validRoutes.has(url), `Dead or unknown URL (${rule.id}): ${url}`).toBe(true);
      }
    }
  });

  it('fixture Markdown and JSON only link to fixture routes', () => {
    const urlRegex = /https:\/\/frontend\.rocks\/[a-z0-9\-/._]+/gi;
    const fixtureRoute = /^https:\/\/frontend\.rocks\/(concepts|autopsies|symptoms)\/fixture-[a-z0-9-]+(\/|\.md)$/;
    const md = fs.readFileSync(PUBLIC_SKILL_CATALOG_MD_PATH, 'utf-8');
    const urls = Array.from(new Set(md.match(urlRegex) ?? []));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      // The intro paragraph quotes real example routes, ignore the two generic ones.
      if (/bfcache-navigation|indexeddb-versionchange-deadlock/.test(url)) continue;
      expect(fixtureRoute.test(url), `Unexpected URL in fixture catalog: ${url}`).toBe(true);
    }
  });

  it('packages public skill bundle with strict whitelist and zero private repo leakage', () => {
    const tmpSrc = makePublicSkillSource();
    const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-rocks-public-skill-'));
    try {
      const result = buildPublicSkillBundle({
        sourceDir: tmpSrc,
        outputDir: tmpOut,
      });

      expect(result.files).toEqual([...PUBLIC_SKILL_WHITELIST]);

      // Verify SKILL.md frontmatter contract
      const skillMd = fs.readFileSync(path.join(tmpOut, 'SKILL.md'), 'utf-8');
      expect(skillMd).toContain('name: frontend-rocks-audit');
      expect(skillMd).toContain('license: MIT');
      expect(skillMd).toContain('references/audit-catalog.md');

      // Verify README.md has 1-line install command and /agents/ link
      const readmeMd = fs.readFileSync(path.join(tmpOut, 'README.md'), 'utf-8');
      expect(readmeMd).toContain('npx skills add DavidBonnemaison/frontend-rocks-skills --skill frontend-rocks-audit');
      expect(readmeMd).toContain('https://frontend.rocks/agents/');

      // Ensure no private repo paths or internal scripts leaked into any exported file
      const forbiddenPatterns = [
        /content\/autopsies\//,
        /content\/concepts\//,
        /scripts\/generate-exports\.ts/,
        /\.agents\/editorial-queue\.json/,
      ];
      for (const relFile of result.files) {
        const fileContent = fs.readFileSync(path.join(tmpOut, relFile), 'utf-8');
        for (const pattern of forbiddenPatterns) {
          expect(
            pattern.test(fileContent),
            `Private reference ${pattern} leaked into exported file ${relFile}`
          ).toBe(false);
        }
      }
    } finally {
      fs.rmSync(tmpSrc, { recursive: true, force: true });
      fs.rmSync(tmpOut, { recursive: true, force: true });
    }
  });

  it('rejects any non-whitelisted or private file when building the public skill bundle', () => {
    const tmpSrc = makePublicSkillSource();
    const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-rocks-dirty-out-'));
    try {
      fs.mkdirSync(path.join(tmpSrc, 'content'), { recursive: true });
      fs.writeFileSync(path.join(tmpSrc, 'content', 'secret.mdx'), 'private');

      expect(() =>
        buildPublicSkillBundle({ sourceDir: tmpSrc, outputDir: tmpOut })
      ).toThrow(/Forbidden private path|Non-whitelisted file/);
    } finally {
      fs.rmSync(tmpSrc, { recursive: true, force: true });
      fs.rmSync(tmpOut, { recursive: true, force: true });
    }
  });

  it('detects all 4 deliberate anti-patterns in a mini-repo fixture with exact Autopsy links', () => {
    const buggyFixtureRepo = [
      {
        path: 'src/db/workspace.ts',
        content: `
export function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('workspace-db', 4);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
`,
      },
      {
        path: 'src/styles/cards.css',
        content: `
.catalog-grid .card-item {
  border-radius: 12px;
  backdrop-filter: blur(12px);
  will-change: transform, opacity;
}
`,
      },
      {
        path: 'src/components/CatalogFilter.tsx',
        content: `
import { useEffect, useState } from 'react';

export function CatalogFilter({ status }: { status: string }) {
  const [items, setItems] = useState([]);
  const filter = { status };

  useEffect(() => {
    fetch('/api/items?status=' + filter.status)
      .then((res) => res.json())
      .then((data) => setItems(data));
  }, [filter]);

  return <div>{items.length}</div>;
}
`,
      },
      {
        path: 'public/sw.js',
        content: `
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
`,
      },
    ];

    const findings = scanProjectFilesForAuditRules(buggyFixtureRepo, catalog);
    expect(findings).toHaveLength(4);

    const byRule = new Map(findings.map((f) => [f.ruleId, f]));

    // 1. IndexedDB open without onversionchange -> Autopsy #14
    const idbFinding = byRule.get('idb-open-without-versionchange');
    expect(idbFinding).toBeDefined();
    expect(idbFinding?.filePath).toBe('src/db/workspace.ts');
    expect(idbFinding?.autopsyUrls).toContain(
      `${SITE_URL}/autopsies/indexeddb-versionchange-deadlock/`
    );

    // 2. Static will-change on cards -> Autopsy #9
    const willChangeFinding = byRule.get('css-static-will-change-on-lists');
    expect(willChangeFinding).toBeDefined();
    expect(willChangeFinding?.filePath).toBe('src/styles/cards.css');
    expect(willChangeFinding?.autopsyUrls).toContain(
      `${SITE_URL}/autopsies/mobile-scroll-jank-vram-explosion/`
    );

    // 3. useEffect fetch without AbortController -> Autopsy #13
    const effectFinding = byRule.get('useeffect-fetch-without-abort-or-stable-deps');
    expect(effectFinding).toBeDefined();
    expect(effectFinding?.filePath).toBe('src/components/CatalogFilter.tsx');
    expect(effectFinding?.autopsyUrls).toContain(
      `${SITE_URL}/autopsies/useeffect-dependency-loop-ddos/`
    );

    // 4. Uncoordinated skipWaiting + clients.claim -> Autopsies #4 & #14
    const swFinding = byRule.get('sw-uncoordinated-skipwaiting-claim');
    expect(swFinding).toBeDefined();
    expect(swFinding?.filePath).toBe('public/sw.js');
    expect(swFinding?.autopsyUrls).toContain(
      `${SITE_URL}/autopsies/zombie-bundle-after-deploy/`
    );
    expect(swFinding?.autopsyUrls).toContain(
      `${SITE_URL}/autopsies/indexeddb-versionchange-deadlock/`
    );
  });

  it('produces zero false positives on a properly mitigated fixture repo', () => {
    const cleanFixtureRepo = [
      {
        path: 'src/db/workspace.ts',
        content: `
export function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('workspace-db', 4);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      window.addEventListener('pagehide', () => db.close(), { once: true });
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}
`,
      },
      {
        path: 'src/styles/cards.css',
        content: `
.catalog-grid .card-item {
  contain: layout paint;
  content-visibility: auto;
}
`,
      },
      {
        path: 'src/components/CatalogFilter.tsx',
        content: `
import { useEffect, useState } from 'react';

export function CatalogFilter({ status }: { status: string }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/items?status=' + status, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItems(data));
    return () => controller.abort();
  }, [status]);

  return <div>{items.length}</div>;
}
`,
      },
      {
        path: 'public/sw.js',
        content: `
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
`,
      },
    ];

    const findings = scanProjectFilesForAuditRules(cleanFixtureRepo, catalog);
    expect(findings).toHaveLength(0);
  });
});
