import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { features as webFeatures } from 'web-features';
import {
  ConceptFrontmatterSchema,
  EvidenceDossierSchema,
  WeeklyDigestSchema,
  type ConceptFrontmatter,
  type MaturityStatus,
  type WeeklyDigest,
} from './schemas';

export type WebFeatureBaseline = 'high' | 'low' | false;

export interface WebFeatureSupport {
  chrome?: string;
  firefox?: string;
  safari?: string;
  edge?: string;
  [browser: string]: string | undefined;
}

export interface WebFeatureRecord {
  kind?: string;
  name?: string;
  description?: string;
  spec?: string | string[];
  status?: {
    baseline?: WebFeatureBaseline;
    baseline_low_date?: string;
    baseline_high_date?: string;
    support?: WebFeatureSupport;
  };
}

export interface BrowserSupportSnapshot {
  baseline_status: MaturityStatus;
  chrome: string;
  firefox: string;
  safari: string;
  notes?: string;
}

export interface BaselineChange {
  conceptId: string;
  title: string;
  webFeatureId: string;
  previousMaturity: MaturityStatus;
  nextMaturity: MaturityStatus;
  maturityChanged: boolean;
  supportChanged: boolean;
  previousSupport?: BrowserSupportSnapshot;
  nextSupport: BrowserSupportSnapshot;
  baselineDate?: string;
  specUrl?: string;
}

export interface ObsolescenceCandidate {
  sourceConceptId: string;
  sourceTitle: string;
  sourceNextMaturity: MaturityStatus;
  targetConceptId: string;
  targetTitle?: string;
  targetCurrentMaturity?: MaturityStatus;
  relationNote: string;
}

export interface PublicationSignal {
  kind: 'concept' | 'autopsy';
  id: string;
  title: string;
  date: string;
  summary: string;
  sourceUrl: string;
  relatedConcepts: string[];
}

export interface BaselineRadarReport {
  generatedAt: string;
  dryRun: boolean;
  mappedConceptsCount: number;
  changes: BaselineChange[];
  obsolescenceCandidates: ObsolescenceCandidate[];
  newPublicationsSinceLastDigest: PublicationSignal[];
  latestDigestId: string | null;
  latestDigestDate: string | null;
  digestDraft: WeeklyDigest | null;
  updatedFiles: string[];
  durationMs: number;
}

/**
 * Maps a `web-features` baseline value to frontend.rocks `MaturityStatus`.
 */
export function mapBaselineToMaturity(baseline: WebFeatureBaseline | undefined): MaturityStatus {
  if (baseline === 'high') return 'baseline-widely';
  if (baseline === 'low') return 'baseline-newly';
  return 'interop-experimental';
}

/**
 * Formats a browser version from `web-features` support data into the EvidenceDossier string format.
 */
function formatBrowserVersion(version: string | undefined): string {
  if (!version) return 'Not supported';
  const cleaned = version.replace(/^≤/, '');
  return `${cleaned}+`;
}

/**
 * Builds a normalized `browser_support` snapshot from a `web-features` entry.
 */
export function extractBrowserSupport(
  feature: WebFeatureRecord,
  maturityStatus: MaturityStatus
): BrowserSupportSnapshot {
  const support = feature.status?.support ?? {};
  const notesParts: string[] = [];
  if (feature.status?.baseline === 'high' && feature.status.baseline_high_date) {
    notesParts.push(`Baseline Widely Available since ${feature.status.baseline_high_date}.`);
  } else if (feature.status?.baseline === 'low' && feature.status.baseline_low_date) {
    notesParts.push(`Baseline Newly Available since ${feature.status.baseline_low_date}.`);
  } else {
    notesParts.push('Limited availability across core browser engines.');
  }

  return {
    baseline_status: maturityStatus,
    chrome: formatBrowserVersion(support.chrome),
    firefox: formatBrowserVersion(support.firefox),
    safari: formatBrowserVersion(support.safari),
    notes: notesParts.join(' '),
  };
}

/**
 * Detects concepts targeted by `replaces` relations when the replacing concept
 * transitions into `baseline-newly` or `baseline-widely`.
 */
export function detectObsolescenceCandidates(
  concepts: ConceptFrontmatter[],
  changes: BaselineChange[]
): ObsolescenceCandidate[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const candidates: ObsolescenceCandidate[] = [];

  for (const change of changes) {
    if (!change.maturityChanged) continue;
    const reachedBaseline =
      (change.nextMaturity === 'baseline-newly' || change.nextMaturity === 'baseline-widely') &&
      change.previousMaturity !== change.nextMaturity;
    if (!reachedBaseline) continue;

    const source = byId.get(change.conceptId);
    if (!source) continue;

    for (const rel of source.relations) {
      if (rel.type !== 'replaces') continue;
      const target = byId.get(rel.target_id);
      if (target && target.maturity_status === 'superseded') continue;

      candidates.push({
        sourceConceptId: source.id,
        sourceTitle: source.title,
        sourceNextMaturity: change.nextMaturity,
        targetConceptId: rel.target_id,
        targetTitle: target?.title,
        targetCurrentMaturity: target?.maturity_status,
        relationNote: rel.note,
      });
    }
  }

  return candidates;
}

/**
 * Computes an ISO-8601 week identifier in `YYYY-wWW` format matching WeeklyDigestSchema.
 */
export function computeIsoWeekId(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-w${String(weekNo).padStart(2, '0')}`;
}

export interface BuildDigestDraftParams {
  now: Date;
  changes: BaselineChange[];
  obsolescenceCandidates: ObsolescenceCandidate[];
  newPublications: PublicationSignal[];
  allConcepts: ConceptFrontmatter[];
}

/**
 * Generates a structured WeeklyDigest draft conforming to `WeeklyDigestSchema`
 * whenever at least one significant Baseline change or new publication occurred.
 */
export function buildDigestDraft(params: BuildDigestDraftParams): WeeklyDigest | null {
  const significantChanges = params.changes.filter((c) => c.maturityChanged);
  if (significantChanges.length === 0 && params.newPublications.length === 0) {
    return null;
  }

  const weekId = computeIsoWeekId(params.now);
  const publishedAt = params.now.toISOString().slice(0, 10);
  const weekNumber = Number(weekId.split('-w')[1]);

  const entries: WeeklyDigest['entries'] = [];
  const usedTitles = new Set<string>();

  // 1. Obsolescence alerts first (highest architectural impact)
  for (const obs of params.obsolescenceCandidates) {
    if (entries.length >= 8) break;
    const title = `${obs.sourceTitle} reaches ${obs.sourceNextMaturity}: audit ${obs.targetTitle ?? obs.targetConceptId}`;
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);

    entries.push({
      title,
      source_url: 'https://web.dev/baseline',
      category: 'obsolescence-alert',
      impact_score: 9.2,
      editorial_take: `${obs.sourceTitle} transitioned to ${obs.sourceNextMaturity}, flagging ${obs.targetTitle ?? obs.targetConceptId} as an obsolescence candidate (${obs.relationNote}).`,
      related_concepts: [obs.sourceConceptId, obs.targetConceptId],
    });
  }

  // 2. Baseline status transitions
  for (const change of significantChanges) {
    if (entries.length >= 8) break;
    const title = `${change.title} moves from ${change.previousMaturity} to ${change.nextMaturity}`;
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);

    entries.push({
      title,
      source_url: change.specUrl ?? 'https://web.dev/baseline',
      category: change.nextMaturity === 'baseline-widely' ? 'browser-release' : 'spec-update',
      impact_score: change.nextMaturity === 'baseline-widely' ? 9.0 : 8.4,
      editorial_take: `Web-features telemetry confirms ${change.title} (${change.webFeatureId}) now ships across Chrome ${change.nextSupport.chrome}, Firefox ${change.nextSupport.firefox}, and Safari ${change.nextSupport.safari}.`,
      related_concepts: [change.conceptId],
    });
  }

  // 3. New publications (concepts / autopsies) since latest digest
  for (const pub of params.newPublications) {
    if (entries.length >= 8) break;
    const title =
      pub.kind === 'autopsy' ? `Architecture Autopsy: ${pub.title}` : `New Concept: ${pub.title}`;
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);

    entries.push({
      title,
      source_url: pub.sourceUrl,
      category: 'deep-dive',
      impact_score: 8.2,
      editorial_take:
        pub.summary.length >= 20
          ? pub.summary
          : `${pub.title} added to the frontend.rocks knowledge graph with verified engine internals.`,
      related_concepts: pub.relatedConcepts.length > 0 ? pub.relatedConcepts : [pub.id],
    });
  }

  // 4. Pad to minimum 5 entries required by WeeklyDigestSchema using mapped Baseline concepts
  if (entries.length < 5) {
    const mappedConcepts = params.allConcepts.filter((c) => Boolean(c.web_feature_id));
    for (const concept of mappedConcepts) {
      if (entries.length >= 5) break;
      const title = `Baseline Watch: ${concept.title} (${concept.maturity_status})`;
      if (usedTitles.has(title)) continue;
      usedTitles.add(title);

      entries.push({
        title,
        source_url: concept.sources[0] ?? 'https://web.dev/baseline',
        category: 'spec-update',
        impact_score: 7.5,
        editorial_take:
          concept.summary_tldr.length >= 20
            ? concept.summary_tldr
            : `${concept.title} remains tracked via web-features (${concept.web_feature_id}) with status ${concept.maturity_status}.`,
        related_concepts: [concept.id],
      });
    }
  }

  if (entries.length < 5) {
    return null;
  }

  const draft: WeeklyDigest = {
    id: weekId,
    title: `Issue #${weekNumber}: Living Baseline Radar & Architecture Watch`,
    published_at: publishedAt,
    summary: `Automated weekly curation from web-features telemetry (${significantChanges.length} Baseline transition(s), ${params.obsolescenceCandidates.length} obsolescence alert(s), ${params.newPublications.length} new publication(s)).`,
    entries: entries.slice(0, 8),
  };

  return WeeklyDigestSchema.parse(draft);
}

/**
 * Updates `maturity_status` and `last_verified_at` inside a concept's YAML frontmatter
 * without reformatting unrelated YAML keys or MDX body content.
 */
export function updateConceptFrontmatterRaw(
  rawMdx: string,
  updates: { maturity_status: MaturityStatus; last_verified_at: string }
): string {
  const match = rawMdx.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Missing YAML frontmatter delimiters');
  }

  let fm = match[1];
  fm = fm.replace(
    /^(maturity_status:\s*)(.+)$/m,
    `$1${updates.maturity_status}`
  );
  fm = fm.replace(
    /^(last_verified_at:\s*)(.+)$/m,
    `$1'${updates.last_verified_at}'`
  );

  return rawMdx.replace(match[1], fm);
}

export interface SyncBaselineRadarOptions {
  rootDir?: string;
  dryRun?: boolean;
  writeDigest?: boolean;
  now?: Date;
  featureCatalog?: Record<string, WebFeatureRecord>;
}

/**
 * Runs the Living Baseline Radar against `content/concepts/*.mdx`,
 * `content/evidence/*.evidence-dossier.json`, and `content/digests/*.json`.
 */
export function syncBaselineRadar(options: SyncBaselineRadarOptions = {}): BaselineRadarReport {
  const startedAt = Date.now();
  const rootDir = options.rootDir ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const writeDigest = options.writeDigest ?? false;
  const now = options.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const catalog: Record<string, WebFeatureRecord> =
    options.featureCatalog ?? (webFeatures as unknown as Record<string, WebFeatureRecord>);

  const conceptsDir = path.join(rootDir, 'content', 'concepts');
  const evidenceDir = path.join(rootDir, 'content', 'evidence');
  const digestsDir = path.join(rootDir, 'content', 'digests');
  const autopsiesDir = path.join(rootDir, 'content', 'autopsies');

  // Load latest digest date
  let latestDigestId: string | null = null;
  let latestDigestDate: string | null = null;
  if (fs.existsSync(digestsDir)) {
    const digestFiles = fs
      .readdirSync(digestsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of digestFiles) {
      const parsed = WeeklyDigestSchema.safeParse(
        JSON.parse(fs.readFileSync(path.join(digestsDir, file), 'utf-8'))
      );
      if (parsed.success) {
        if (!latestDigestDate || parsed.data.published_at > latestDigestDate) {
          latestDigestDate = parsed.data.published_at;
          latestDigestId = parsed.data.id;
        }
      }
    }
  }

  const conceptFiles = fs
    .readdirSync(conceptsDir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  const allConcepts: ConceptFrontmatter[] = [];
  const changes: BaselineChange[] = [];
  const updatedFiles: string[] = [];
  const newPublications: PublicationSignal[] = [];

  for (const file of conceptFiles) {
    const filePath = path.join(conceptsDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    const fmResult = ConceptFrontmatterSchema.safeParse(parsed.data);
    if (!fmResult.success) continue;

    const concept = fmResult.data;
    allConcepts.push(concept);

    if (latestDigestDate && concept.last_verified_at > latestDigestDate) {
      newPublications.push({
        kind: 'concept',
        id: concept.id,
        title: concept.title,
        date: concept.last_verified_at,
        summary: concept.summary_tldr,
        sourceUrl: concept.sources[0] ?? 'https://frontend.rocks/concepts/' + concept.id,
        relatedConcepts: [concept.id],
      });
    }

    if (!concept.web_feature_id) continue;
    const feature = catalog[concept.web_feature_id];
    if (!feature || feature.kind !== 'feature') continue;

    const nextMaturity = mapBaselineToMaturity(feature.status?.baseline);
    const nextSupport = extractBrowserSupport(feature, nextMaturity);
    const maturityChanged =
      concept.maturity_status !== 'legacy-pattern' &&
      concept.maturity_status !== 'superseded' &&
      concept.maturity_status !== nextMaturity;

    const evidencePath = path.join(evidenceDir, `${concept.id}.evidence-dossier.json`);
    let previousSupport: BrowserSupportSnapshot | undefined;
    let supportChanged = false;

    if (fs.existsSync(evidencePath)) {
      const evidenceRaw = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
      const evidenceParsed = EvidenceDossierSchema.safeParse(evidenceRaw);
      if (evidenceParsed.success) {
        previousSupport = evidenceParsed.data.browser_support;
        supportChanged =
          previousSupport.baseline_status !== nextSupport.baseline_status ||
          previousSupport.chrome !== nextSupport.chrome ||
          previousSupport.firefox !== nextSupport.firefox ||
          previousSupport.safari !== nextSupport.safari;
      }
    }

    if (maturityChanged || supportChanged) {
      const specUrl = Array.isArray(feature.spec) ? feature.spec[0] : feature.spec;
      changes.push({
        conceptId: concept.id,
        title: concept.title,
        webFeatureId: concept.web_feature_id,
        previousMaturity: concept.maturity_status,
        nextMaturity,
        maturityChanged,
        supportChanged,
        previousSupport,
        nextSupport,
        baselineDate: feature.status?.baseline_high_date ?? feature.status?.baseline_low_date,
        specUrl,
      });

      if (!dryRun) {
        if (maturityChanged) {
          const updatedMdx = updateConceptFrontmatterRaw(raw, {
            maturity_status: nextMaturity,
            last_verified_at: todayIso,
          });
          fs.writeFileSync(filePath, updatedMdx, 'utf-8');
          updatedFiles.push(path.relative(rootDir, filePath));
        }

        if (fs.existsSync(evidencePath) && (maturityChanged || supportChanged)) {
          const evidenceRaw = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
          evidenceRaw.browser_support = nextSupport;
          evidenceRaw.compiled_at = todayIso;
          fs.writeFileSync(evidencePath, `${JSON.stringify(evidenceRaw, null, 2)}\n`, 'utf-8');
          updatedFiles.push(path.relative(rootDir, evidencePath));
        }
      }
    }
  }

  // Check new autopsies since latest digest
  if (latestDigestDate && fs.existsSync(autopsiesDir)) {
    const autopsyFiles = fs
      .readdirSync(autopsiesDir)
      .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
      .sort();
    for (const file of autopsyFiles) {
      const raw = fs.readFileSync(path.join(autopsiesDir, file), 'utf-8');
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const publishedAt = typeof data.published_at === 'string' ? data.published_at : null;
      if (publishedAt && publishedAt > latestDigestDate && typeof data.id === 'string') {
        const traversed = Array.isArray(data.traversed_concepts)
          ? data.traversed_concepts.filter((c): c is string => typeof c === 'string')
          : [];
        const sources = Array.isArray(data.sources)
          ? data.sources.filter((s): s is string => typeof s === 'string')
          : [];
        newPublications.push({
          kind: 'autopsy',
          id: data.id,
          title: typeof data.title === 'string' ? data.title : data.id,
          date: publishedAt,
          summary: typeof data.summary_tldr === 'string' ? data.summary_tldr : '',
          sourceUrl: sources[0] ?? 'https://frontend.rocks/autopsies/' + data.id,
          relatedConcepts: traversed.slice(0, 3),
        });
      }
    }
  }

  const obsolescenceCandidates = detectObsolescenceCandidates(allConcepts, changes);
  const digestDraft = buildDigestDraft({
    now,
    changes,
    obsolescenceCandidates,
    newPublications,
    allConcepts,
  });

  if (!dryRun && writeDigest && digestDraft) {
    fs.mkdirSync(digestsDir, { recursive: true });
    const draftPath = path.join(digestsDir, `${digestDraft.id}.json`);
    if (!fs.existsSync(draftPath)) {
      fs.writeFileSync(draftPath, `${JSON.stringify(digestDraft, null, 2)}\n`, 'utf-8');
      updatedFiles.push(path.relative(rootDir, draftPath));
    }
  }

  const mappedConceptsCount = allConcepts.filter((c) => Boolean(c.web_feature_id)).length;

  return {
    generatedAt: now.toISOString(),
    dryRun,
    mappedConceptsCount,
    changes,
    obsolescenceCandidates,
    newPublicationsSinceLastDigest: newPublications,
    latestDigestId,
    latestDigestDate,
    digestDraft,
    updatedFiles,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Formats a BaselineRadarReport as Markdown suitable for PR descriptions or CLI stdout.
 */
export function formatBaselineRadarMarkdown(report: BaselineRadarReport): string {
  const lines: string[] = [];
  lines.push('# Living Baseline Radar — Weekly Sync Report');
  lines.push('');
  lines.push(
    `- **Mode**: ${report.dryRun ? 'dry-run (no files modified)' : 'write'} | **Mapped concepts**: ${report.mappedConceptsCount} | **Detected changes**: ${report.changes.length} | **Duration**: ${report.durationMs}ms`
  );
  lines.push('');

  if (report.changes.length === 0) {
    lines.push('No Baseline status or browser support drift detected.');
  } else {
    lines.push('## Baseline & Browser Support Changes');
    lines.push('');
    lines.push('| Concept | `web_feature_id` | Maturity | Chrome | Firefox | Safari |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const c of report.changes) {
      const maturityCell = c.maturityChanged
        ? `\`${c.previousMaturity}\` -> \`${c.nextMaturity}\``
        : `\`${c.nextMaturity}\` (support updated)`;
      lines.push(
        `| \`${c.conceptId}\` | \`${c.webFeatureId}\` | ${maturityCell} | ${c.nextSupport.chrome} | ${c.nextSupport.firefox} | ${c.nextSupport.safari} |`
      );
    }
  }

  if (report.obsolescenceCandidates.length > 0) {
    lines.push('');
    lines.push('## Obsolescence Candidates (`replaces` edges)');
    lines.push('');
    for (const obs of report.obsolescenceCandidates) {
      lines.push(
        `- **\`${obs.targetConceptId}\`** (currently \`${obs.targetCurrentMaturity ?? 'unknown'}\`) — replaced by \`${obs.sourceConceptId}\` which reached \`${obs.sourceNextMaturity}\`: ${obs.relationNote}`
      );
    }
  }

  if (report.digestDraft) {
    lines.push('');
    lines.push(`## Proposed Weekly Digest Draft (\`${report.digestDraft.id}\`)`);
    lines.push('');
    lines.push(`- **Title**: ${report.digestDraft.title}`);
    lines.push(`- **Entries**: ${report.digestDraft.entries.length}`);
    for (const entry of report.digestDraft.entries) {
      lines.push(`  - [${entry.category}] **${entry.title}** (${entry.related_concepts.join(', ')})`);
    }
  }

  if (report.updatedFiles.length > 0) {
    lines.push('');
    lines.push('## Updated Files');
    lines.push('');
    for (const f of report.updatedFiles) {
      lines.push(`- \`${f}\``);
    }
  }

  return lines.join('\n');
}
