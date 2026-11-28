import type { ConceptPreviewData } from '@/components/concepts/ConceptInlineLink';
import type { MiniGraphNode } from '@/components/concepts/NeighborhoodMiniGraph';
import type { PathProgressMeta } from '@/components/concepts/PathProgressBar';
import {
  getAllConcepts,
  getAutopsiesForConcept,
  getConceptById,
  getLearningPaths,
} from '@/lib/content-loader';
import { summarizePageProof } from '@/lib/proof/page-proof';
import { buildConceptJsonLd, splitProductionPitfalls } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';
import { getVsPairsForConcept } from '@/lib/vs-pairs';
import { computeReadingMinutes } from './reading-time';
import type { ConceptConnectionItem, ConceptPageView } from './view-models';

export function buildConceptPageView(id: string): ConceptPageView | null {
  const concept = getConceptById(id);
  if (!concept) return null;

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

  const { frontmatter, sections, lab } = concept;
  const associatedAutopsies = getAutopsiesForConcept(frontmatter.id);
  const vsPairsRaw = getVsPairsForConcept(frontmatter.id, allConcepts, associatedAutopsies);

  const isObsolete =
    frontmatter.maturity_status === 'legacy-pattern' ||
    frontmatter.maturity_status === 'superseded';

  const requires = frontmatter.relations.filter((r) => r.type === 'requires');
  const underHood = frontmatter.relations.filter((r) => r.type === 'under_the_hood');
  const replaces = frontmatter.relations.filter((r) => r.type === 'replaces');
  const contrasts = frontmatter.relations.filter((r) => r.type === 'contrasts_with');

  const incomingRequires = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'requires')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  const incomingReplaces = allConcepts
    .filter((c) => c.frontmatter.id !== frontmatter.id)
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.target_id === frontmatter.id && r.type === 'replaces')
        .map((r) => ({ source: c.frontmatter, note: r.note }))
    );

  const prerequisites: ConceptConnectionItem[] = [];
  const seenPrereqs = new Set<string>();
  for (const r of requires) {
    if (seenPrereqs.has(r.target_id)) continue;
    seenPrereqs.add(r.target_id);
    const target = conceptMap.get(r.target_id);
    prerequisites.push({
      id: r.target_id,
      title: target?.title ?? r.target_id,
      domain: target?.domain ?? frontmatter.domain,
      groupLabel: UI_STRINGS.relations.usefulPrerequisites,
      note: r.note,
    });
  }
  for (const r of underHood) {
    if (seenPrereqs.has(r.target_id)) continue;
    seenPrereqs.add(r.target_id);
    const target = conceptMap.get(r.target_id);
    prerequisites.push({
      id: r.target_id,
      title: target?.title ?? r.target_id,
      domain: target?.domain ?? frontmatter.domain,
      groupLabel: UI_STRINGS.relations.underTheHood,
      note: r.note,
    });
  }

  const followUps: ConceptConnectionItem[] = [];
  const seenFollowUps = new Set<string>();
  for (const item of incomingRequires) {
    if (seenFollowUps.has(item.source.id)) continue;
    seenFollowUps.add(item.source.id);
    followUps.push({
      id: item.source.id,
      title: item.source.title,
      domain: item.source.domain,
      groupLabel: UI_STRINGS.relations.whatThisUnlocks,
      note: item.note,
    });
  }
  for (const r of replaces) {
    if (seenFollowUps.has(r.target_id)) continue;
    seenFollowUps.add(r.target_id);
    const target = conceptMap.get(r.target_id);
    followUps.push({
      id: r.target_id,
      title: target?.title ?? r.target_id,
      domain: target?.domain ?? frontmatter.domain,
      groupLabel: UI_STRINGS.relations.replaces,
      note: r.note,
    });
  }
  for (const r of contrasts) {
    if (seenFollowUps.has(r.target_id)) continue;
    seenFollowUps.add(r.target_id);
    const target = conceptMap.get(r.target_id);
    followUps.push({
      id: r.target_id,
      title: target?.title ?? r.target_id,
      domain: target?.domain ?? frontmatter.domain,
      groupLabel: UI_STRINGS.relations.oftenConfusedWith,
      note: r.note,
    });
  }

  const neighbors: MiniGraphNode[] = [
    ...prerequisites.map((p) => ({
      id: p.id,
      title: p.title,
      domain: p.domain,
      relationLabel: p.groupLabel,
    })),
    ...followUps.map((f) => ({
      id: f.id,
      title: f.title,
      domain: f.domain,
      relationLabel: f.groupLabel,
    })),
  ];

  const { mainPitfalls, whenNotToUse } = splitProductionPitfalls(sections.production_pitfalls);

  const orderedSections: Array<{ id: string; title: string; mdx: string }> = [];
  if (sections.under_the_hood.trim()) {
    orderedSections.push({
      id: 'under-the-hood',
      title: UI_STRINGS.sections.underTheHood,
      mdx: sections.under_the_hood,
    });
  }
  if (sections.genealogy.trim()) {
    orderedSections.push({
      id: 'genealogy',
      title: 'Problem Genealogy',
      mdx: sections.genealogy,
    });
  }
  if (mainPitfalls.trim()) {
    orderedSections.push({
      id: 'production-pitfalls',
      title: UI_STRINGS.toc.productionPitfalls,
      mdx: mainPitfalls,
    });
  }

  const paths: PathProgressMeta[] = getLearningPaths()
    .filter((p) => p.concepts.includes(frontmatter.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      concepts: p.concepts,
    }));

  const pathConceptTitles: Record<string, string> = {};
  for (const p of paths) {
    for (const cid of p.concepts) {
      if (!pathConceptTitles[cid]) {
        pathConceptTitles[cid] = conceptMap.get(cid)?.title ?? cid;
      }
    }
  }

  const supersededIds =
    frontmatter.superseded_by && frontmatter.superseded_by.length > 0
      ? frontmatter.superseded_by
      : incomingReplaces.map((item) => item.source.id);

  const proof = summarizePageProof(frontmatter.id, frontmatter.proof_status);

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    domain: frontmatter.domain,
    tldr: frontmatter.summary_tldr,
    sections: orderedSections,
    whenNotToUse: whenNotToUse.trim() || null,
    proofStatus: frontmatter.proof_status,
    legacyLab: frontmatter.proof_status === 'unverified' ? lab : null,
    webFeatureId: frontmatter.web_feature_id ?? null,
    maturityStatus: frontmatter.maturity_status,
    proof,
    readingMinutes: computeReadingMinutes(concept.body),
    neighbors,
    prerequisites,
    followUps,
    relatedAutopsies: associatedAutopsies.map((a) => {
      const step = a.frontmatter.traversed_concepts.find(
        (tc) => tc.concept_id === frontmatter.id
      );
      return {
        id: a.frontmatter.id,
        number: `#${String(a.frontmatter.case_number).padStart(2, '0')}`,
        title: a.frontmatter.title,
        pieceColor: a.frontmatter.piece_color,
        dek: step?.role_in_chain ?? a.frontmatter.symptom,
      };
    }),
    vsPairs: vsPairsRaw.map((pair) => ({
      slug: pair.slug,
      title: `${pair.primary.frontmatter.title} vs ${pair.secondary.frontmatter.title}`,
      note: pair.note,
      relationLabel: pair.relationType === 'replaces' ? 'Replaces' : 'Contrasts With',
    })),
    paths,
    pathConceptTitles,
    conceptPreviews,
    isObsolete,
    supersededTargets: supersededIds.map((sid) => ({
      id: sid,
      title: conceptMap.get(sid)?.title ?? sid,
    })),
    replacesTargets: replaces.map((r) => ({
      id: r.target_id,
      title: conceptMap.get(r.target_id)?.title ?? r.target_id,
    })),
    sources: frontmatter.sources,
    lastVerifiedAt: frontmatter.last_verified_at,
    jsonLd: buildConceptJsonLd(concept),
  };
}
