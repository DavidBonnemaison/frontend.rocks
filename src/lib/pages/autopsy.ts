import type { ConceptPreviewData } from '@/components/concepts/ConceptInlineLink';
import { getAllAutopsies, getAllConcepts, getAutopsyById } from '@/lib/content-loader';
import { getSnapshotsForExperiment } from '@/lib/design/schematics-loader';
import { summarizePageProof } from '@/lib/proof/page-proof';
import { buildAutopsyJsonLd } from '@/lib/seo-schema';
import { extractAutopsyChapters } from '@/lib/validators/autopsy-validator';
import { computeReadingMinutes } from './reading-time';
import type { AutopsyNavItem, AutopsyPageView } from './view-models';

function slugifyChapter(heading: string, index: number): string {
  const base = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `chapter-${index + 1}`;
}

function stripLegacyInlineWidgets(mdx: string): string {
  return mdx
    .replace(/^\s*<CaseFile\s*\/>\s*$/gm, '')
    .replace(/^\s*<CausalChainStepper\s*\/>\s*$/gm, '')
    .replace(/^\s*<FailureSimulator\s*\/>\s*$/gm, '')
    .trim();
}

export function buildAutopsyPageView(id: string): AutopsyPageView | null {
  const autopsy = getAutopsyById(id);
  if (!autopsy) return null;

  const allAutopsies = getAllAutopsies();
  const allConcepts = getAllConcepts();
  const conceptMap = new Map(allConcepts.map((c) => [c.frontmatter.id, c.frontmatter]));

  const conceptPreviews: Record<string, ConceptPreviewData> = {};
  for (const c of allConcepts) {
    conceptPreviews[c.frontmatter.id] = {
      id: c.frontmatter.id,
      title: c.frontmatter.title,
      domain: c.frontmatter.domain,
      maturity_status: c.frontmatter.maturity_status,
      summary_tldr: c.frontmatter.summary_tldr,
    };
  }

  const { frontmatter, lab } = autopsy;
  const cf = frontmatter.case_file;

  // Read optional EPIC-35 field if present without depending on EPIC-35 schema changes.
  const fmRecord = frontmatter as unknown as Record<string, unknown>;
  const reproExperimentId =
    typeof fmRecord.repro_experiment_id === 'string' ? fmRecord.repro_experiment_id : null;
  const heroSnapshot = reproExperimentId
    ? (getSnapshotsForExperiment(reproExperimentId)[0] ?? null)
    : null;

  const caseFile: Array<{ key: string; value: string }> = [
    { key: 'Trigger', value: cf.trigger },
    { key: 'Symptom', value: cf.symptom },
    { key: 'Root cause', value: cf.root_cause },
    { key: 'Fix', value: cf.fix },
    { key: 'How to spot', value: cf.how_to_spot },
    ...(cf.deleted ? [{ key: 'Deleted', value: cf.deleted }] : []),
  ];

  const { chapters: rawChapters } = extractAutopsyChapters(autopsy.body);
  const usedIds = new Set<string>();
  const chapters = rawChapters.map((ch, idx) => {
    let chId = slugifyChapter(ch.heading, idx);
    if (usedIds.has(chId)) chId = `${chId}-${idx + 1}`;
    usedIds.add(chId);
    return {
      id: chId,
      title: ch.heading,
      mdx: stripLegacyInlineWidgets(ch.body),
    };
  });

  const causalSteps = [...frontmatter.traversed_concepts]
    .sort((a, b) => a.step_order - b.step_order)
    .map((tc) => ({
      order: tc.step_order,
      conceptId: tc.concept_id,
      conceptTitle: conceptMap.get(tc.concept_id)?.title ?? tc.concept_id,
      role: tc.role_in_chain,
    }));

  const currentIdx = allAutopsies.findIndex((a) => a.frontmatter.id === frontmatter.id);
  const toNav = (item: (typeof allAutopsies)[number] | undefined): AutopsyNavItem | null => {
    if (!item) return null;
    return {
      id: item.frontmatter.id,
      number: `#${String(item.frontmatter.case_number).padStart(2, '0')}`,
      title: item.frontmatter.title,
      pieceColor: item.frontmatter.piece_color,
      dek: item.frontmatter.symptom,
    };
  };

  const prev = currentIdx > 0 ? toNav(allAutopsies[currentIdx - 1]) : null;
  const next =
    currentIdx >= 0 && currentIdx < allAutopsies.length - 1
      ? toNav(allAutopsies[currentIdx + 1])
      : null;

  const proof = summarizePageProof(frontmatter.id, frontmatter.proof_status);

  return {
    id: frontmatter.id,
    number: `#${String(frontmatter.case_number).padStart(2, '0')}`,
    title: frontmatter.title,
    symptom: frontmatter.symptom,
    failureMode: frontmatter.failure_mode,
    pieceColor: frontmatter.piece_color,
    proofStatus: frontmatter.proof_status,
    heroSnapshot,
    caseFile,
    caseFileRaw: cf,
    badFixes: cf.bad_fixes.map((b) => ({ label: b.label, outcome: b.outcome })),
    chapters,
    causalSteps,
    isComposite: frontmatter.case_type === 'composite',
    legacyLab: frontmatter.proof_status === 'unverified' ? lab : null,
    reproExperimentId,
    proof,
    readingMinutes: computeReadingMinutes(autopsy.body),
    sources: frontmatter.sources,
    lastVerifiedAt: frontmatter.last_verified_at,
    prev,
    next,
    conceptPreviews,
    jsonLd: buildAutopsyJsonLd(autopsy),
  };
}
