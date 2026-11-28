import { getSymptomBySlug, PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { summarizePageProof } from '@/lib/proof/page-proof';
import { buildSymptomJsonLd } from '@/lib/seo-schema';
import type { SymptomPageView } from './view-models';

export function buildSymptomPageView(slug: string): SymptomPageView | null {
  const symptom = getSymptomBySlug(slug);
  if (!symptom) return null;

  const allConcepts = getAllConcepts();
  const allAutopsies = getAllAutopsies();

  const conceptMap = new Map(allConcepts.map((c) => [c.frontmatter.id, c]));
  const autopsyMap = new Map(allAutopsies.map((a) => [a.frontmatter.id, a]));

  const primaryAutopsy = symptom.autopsy_ids
    .map((aid) => autopsyMap.get(aid))
    .find((a): a is NonNullable<typeof a> => Boolean(a));

  const causes = symptom.concept_ids.map((cid, idx) => {
    const concept = conceptMap.get(cid);
    const matchingAutopsy =
      symptom.autopsy_ids
        .map((aid) => autopsyMap.get(aid))
        .find((a) => a?.frontmatter.traversed_concepts.some((tc) => tc.concept_id === cid)) ??
      (idx === 0 ? primaryAutopsy : undefined);

    return {
      rank: idx + 1,
      title: concept?.frontmatter.title ?? cid,
      check:
        concept?.frontmatter.summary_tldr ??
        `Inspect ${cid} in browser DevTools to verify whether this mechanism causes the symptom.`,
      conceptId: concept ? cid : undefined,
      autopsyId: matchingAutopsy?.frontmatter.id,
      autopsyNumber: matchingAutopsy
        ? `#${String(matchingAutopsy.frontmatter.case_number).padStart(2, '0')}`
        : undefined,
      autopsyTitle: matchingAutopsy?.frontmatter.title,
    };
  });

  // Related symptoms: share at least one concept or autopsy, capped at 3.
  const conceptSet = new Set(symptom.concept_ids);
  const autopsySet = new Set(symptom.autopsy_ids);
  const related = PRODUCTION_SYMPTOMS.filter((other) => other.slug !== symptom.slug)
    .map((other) => {
      const overlap =
        other.concept_ids.filter((id) => conceptSet.has(id)).length +
        other.autopsy_ids.filter((id) => autopsySet.has(id)).length;
      return { other, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ other }) => ({
      slug: other.slug,
      title: other.search_title,
    }));

  const sources = Array.from(
    new Set([
      ...symptom.concept_ids.flatMap((cid) => conceptMap.get(cid)?.frontmatter.sources ?? []),
      ...symptom.autopsy_ids.flatMap((aid) => autopsyMap.get(aid)?.frontmatter.sources ?? []),
    ])
  );

  const proof = summarizePageProof(symptom.slug, symptom.proof_status);

  return {
    slug: symptom.slug,
    title: symptom.search_title,
    proofStatus: symptom.proof_status,
    signature: symptom.devtools_signature,
    signatureEngines: null,
    summary: symptom.summary,
    causes,
    related,
    proof,
    sources,
    jsonLd: buildSymptomJsonLd({
      slug: symptom.slug,
      title: symptom.search_title,
      summary: symptom.summary,
      devtoolsSignature: symptom.devtools_signature,
      sources,
    }),
  };
}
