import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const DEFAULT_BASE_URL = 'https://frontend.rocks';
export const DEFAULT_TTL_MS = 3_600_000; // 1 hour

export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  maturity_status: z.string().nullable(),
  superseded_by: z.array(z.string()).default([]),
  summary_tldr: z.string(),
  last_verified_at: z.string().optional(),
  url: z.string().optional(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
  note: z.string().default(''),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const KnowledgeGraphSchema = z.object({
  generated_at: z.string().optional(),
  node_count: z.number().optional(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema).default([]),
});

export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

export const AuditRuleCanonicalUrlsSchema = z.object({
  autopsies: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  symptoms: z.array(z.string()).default([]),
});

export const AuditRuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  severity: z.string(),
  detection_signals: z.array(z.string()).default([]),
  pattern_hints: z.array(z.string()).default([]),
  trigger: z.string(),
  root_cause: z.string(),
  how_to_spot: z.string(),
  fix: z.string(),
  autopsy_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  symptom_slugs: z.array(z.string()).default([]),
  canonical_urls: AuditRuleCanonicalUrlsSchema.default({
    autopsies: [],
    concepts: [],
    symptoms: [],
  }),
});

export type AuditRule = z.infer<typeof AuditRuleSchema>;

export const AuditRulesCatalogSchema = z.object({
  generated_at: z.string().optional(),
  version: z.string().optional(),
  rule_count: z.number().optional(),
  categories: z.array(z.string()).default([]),
  rules: z.array(AuditRuleSchema),
});

export type AuditRulesCatalog = z.infer<typeof AuditRulesCatalogSchema>;

export interface ParsedAutopsySummary {
  id: string;
  title: string;
  case_number: string;
  failure_mode: string;
  production_symptom: string;
  canonical_url: string;
  failure_simulator_url: string;
  last_verified: string;
  trigger: string;
  symptom: string;
  root_cause: string;
  bad_fixes: string[];
  fix: string;
  how_to_spot: string;
  deleted_or_replaced: string;
  traversed_concepts: string[];
}

export interface FrontendRocksDataSourceOptions {
  /** Base URL for public frontend.rocks artifacts (default: https://frontend.rocks). */
  baseUrl?: string;
  /** In-memory cache TTL in milliseconds (default: 3_600_000 = 1 hour). */
  ttlMs?: number;
  /** Optional local public/ directory used for offline fallback or preferLocal mode. */
  localPublicDir?: string;
  /** When true and localPublicDir is configured, read local files before hitting network. */
  preferLocal?: boolean;
  /** Optional custom fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
  /** HTTP request timeout in milliseconds (default: 10_000). */
  timeoutMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

const EMBEDDED_FALLBACK_GRAPH: KnowledgeGraph = {
  generated_at: '1970-01-01T00:00:00.000Z',
  node_count: 0,
  nodes: [],
  edges: [],
};

const EMBEDDED_FALLBACK_AUDIT_RULES: AuditRulesCatalog = {
  generated_at: '1970-01-01T00:00:00.000Z',
  version: '1.0.0',
  rule_count: 0,
  categories: [],
  rules: [],
};

function sanitizeSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!SAFE_SLUG_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

function detectRepoPublicDir(): string | undefined {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    // packages/mcp-server/src -> repo root -> public
    return path.resolve(currentDir, '..', '..', '..', 'public');
  } catch {
    return undefined;
  }
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, '');
}

export function parseAutopsyMarkdown(
  slug: string,
  markdown: string,
  baseUrl: string = DEFAULT_BASE_URL
): ParsedAutopsySummary {
  const cleanBase = normalizeBaseUrl(baseUrl);
  const lines = markdown.split(/\r?\n/);

  const headingLine = lines.find((line) => line.startsWith('# '));
  const title = headingLine ? headingLine.replace(/^#\s+/, '').trim() : slug;

  const extractMeta = (label: string): string => {
    const prefix = `- **${label}:**`;
    const line = lines.find((l) => l.trim().startsWith(prefix));
    return line ? line.trim().slice(prefix.length).trim() : '';
  };

  const canonicalUrl =
    extractMeta('Canonical URL') || `${cleanBase}/autopsies/${slug}/`;
  const caseNumber = extractMeta('Case');
  const failureMode = extractMeta('Failure Mode');
  const productionSymptom = extractMeta('Production Symptom');
  const lastVerified = extractMeta('Last Verified');

  const trigger = extractMeta('Trigger');
  const symptom = extractMeta('Symptom') || productionSymptom;
  const rootCause = extractMeta('Root cause');
  const fix = extractMeta('Fix');
  const howToSpot = extractMeta('How to spot it');
  const deletedOrReplaced = extractMeta('Deleted / Replaced');

  const badFixes: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const badFixMatch = trimmed.match(/^-\s+\*\*(Bad fix[^*]*):\*\*\s*(.+)$/i);
    if (badFixMatch) {
      badFixes.push(`${badFixMatch[1].trim()}: ${badFixMatch[2].trim()}`);
    }
  }

  // Extract traversed concept slugs from Causal Chain section links
  const traversedConcepts: string[] = [];
  const causalChainIndex = lines.findIndex((l) =>
    /^##\s+Causal Chain/i.test(l.trim())
  );
  if (causalChainIndex !== -1) {
    for (let i = causalChainIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('## ') || line === '---') break;
      const conceptMatch = line.match(/\/concepts\/([a-z0-9-]+)(?:\.md|\/)?\)/i);
      if (conceptMatch && !traversedConcepts.includes(conceptMatch[1])) {
        traversedConcepts.push(conceptMatch[1]);
      }
    }
  }

  return {
    id: slug,
    title,
    case_number: caseNumber,
    failure_mode: failureMode,
    production_symptom: productionSymptom,
    canonical_url: canonicalUrl,
    failure_simulator_url: `${canonicalUrl.replace(/\/?$/, '/')}#failure-simulator`,
    last_verified: lastVerified,
    trigger,
    symptom,
    root_cause: rootCause,
    bad_fixes: badFixes,
    fix,
    how_to_spot: howToSpot,
    deleted_or_replaced: deletedOrReplaced,
    traversed_concepts: traversedConcepts,
  };
}

export class FrontendRocksDataSource {
  public readonly baseUrl: string;
  public readonly ttlMs: number;
  private readonly localPublicDir?: string;
  private readonly preferLocal: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: FrontendRocksDataSourceOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ??
        process.env.FRONTEND_ROCKS_BASE_URL ??
        DEFAULT_BASE_URL
    );
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.localPublicDir =
      options.localPublicDir ??
      process.env.FRONTEND_ROCKS_LOCAL_PUBLIC_DIR ??
      detectRepoPublicDir();
    this.preferLocal = options.preferLocal ?? false;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private setCached<T>(key: string, value: T): T {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }

  private async readLocalFile(relativePath: string): Promise<string | null> {
    if (!this.localPublicDir) return null;
    const normalizedRel = relativePath.replace(/^\/+/, '');
    const fullPath = path.resolve(this.localPublicDir, normalizedRel);
    const resolvedRoot = path.resolve(this.localPublicDir);
    if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
      return null;
    }
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async fetchRemoteText(relativePath: string): Promise<string | null> {
    const url = `${this.baseUrl}/${relativePath.replace(/^\/+/, '')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/markdown, text/plain;q=0.9',
          'User-Agent': '@frontend-rocks/mcp/1.0.0',
        },
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async loadTextArtifact(relativePath: string): Promise<string | null> {
    const cacheKey = `text:${relativePath}`;
    const cached = this.getCached<string | null>(cacheKey);
    if (cached !== undefined) return cached;

    let text: string | null = null;
    if (this.preferLocal) {
      text = await this.readLocalFile(relativePath);
      if (text === null) {
        text = await this.fetchRemoteText(relativePath);
      }
    } else {
      text = await this.fetchRemoteText(relativePath);
      if (text === null) {
        text = await this.readLocalFile(relativePath);
      }
    }

    return this.setCached(cacheKey, text);
  }

  public async getGraph(): Promise<KnowledgeGraph> {
    const cacheKey = 'json:graph.json';
    const cached = this.getCached<KnowledgeGraph>(cacheKey);
    if (cached) return cached;

    const raw = await this.loadTextArtifact('graph.json');
    if (raw) {
      try {
        const parsed = KnowledgeGraphSchema.parse(JSON.parse(raw));
        return this.setCached(cacheKey, parsed);
      } catch {
        // Fall through to embedded fallback
      }
    }
    return this.setCached(cacheKey, EMBEDDED_FALLBACK_GRAPH);
  }

  public async getAuditRules(): Promise<AuditRulesCatalog> {
    const cacheKey = 'json:audit-rules.json';
    const cached = this.getCached<AuditRulesCatalog>(cacheKey);
    if (cached) return cached;

    const raw = await this.loadTextArtifact('audit-rules.json');
    if (raw) {
      try {
        const parsed = AuditRulesCatalogSchema.parse(JSON.parse(raw));
        return this.setCached(cacheKey, parsed);
      } catch {
        // Fall through to embedded fallback
      }
    }
    return this.setCached(cacheKey, EMBEDDED_FALLBACK_AUDIT_RULES);
  }

  public async getConceptMarkdown(slug: string): Promise<string | null> {
    const safe = sanitizeSlug(slug);
    if (!safe) return null;
    return this.loadTextArtifact(`concepts/${safe}.md`);
  }

  public async getAutopsyMarkdown(slug: string): Promise<string | null> {
    const safe = sanitizeSlug(slug);
    if (!safe) return null;
    return this.loadTextArtifact(`autopsies/${safe}.md`);
  }

  public async getAutopsySummary(
    slug: string
  ): Promise<ParsedAutopsySummary | null> {
    const safe = sanitizeSlug(slug);
    if (!safe) return null;
    const cacheKey = `autopsy-summary:${safe}`;
    const cached = this.getCached<ParsedAutopsySummary | null>(cacheKey);
    if (cached !== undefined) return cached;

    const md = await this.getAutopsyMarkdown(safe);
    if (!md) {
      return this.setCached(cacheKey, null);
    }
    return this.setCached(cacheKey, parseAutopsyMarkdown(safe, md, this.baseUrl));
  }

  public async getVsMarkdown(slug: string): Promise<string | null> {
    const safe = sanitizeSlug(slug);
    if (!safe) return null;
    return this.loadTextArtifact(`vs/${safe}.md`);
  }

  public async hasVsComparison(slug: string): Promise<boolean> {
    const md = await this.getVsMarkdown(slug);
    return md !== null;
  }

  public async listAutopsySlugs(): Promise<string[]> {
    const cacheKey = 'list:autopsy-slugs';
    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const slugs = new Set<string>();
    const catalog = await this.getAuditRules();
    for (const rule of catalog.rules) {
      for (const id of rule.autopsy_ids) {
        const safe = sanitizeSlug(id);
        if (safe) slugs.add(safe);
      }
    }

    if (this.localPublicDir) {
      try {
        const entries = await fs.readdir(
          path.join(this.localPublicDir, 'autopsies')
        );
        for (const entry of entries) {
          if (entry.endsWith('.md')) {
            const safe = sanitizeSlug(entry.slice(0, -3));
            if (safe) slugs.add(safe);
          }
        }
      } catch {
        // Local directory may not exist in remote-only environments
      }
    }

    return this.setCached(cacheKey, Array.from(slugs).sort());
  }
}
