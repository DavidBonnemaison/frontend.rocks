import { getAllSymptoms, getSymptomById, primarySignatureText } from '@/lib/symptoms/loader';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { summarizePageProof } from '@/lib/proof/page-proof';
import { buildSymptomJsonLd } from '@/lib/seo-schema';
import type { SymptomPageView } from './view-models';

export function buildSymptomPageView(slug: string): SymptomPageView | null {
  const loaded = getSymptomById(slug);
  if (!loaded) return null;
  const symptom = loaded.frontmatter;

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
  const related = getAllSymptoms()
    .filter((other) => other.frontmatter.id !== symptom.id)
    .map((other) => {
      const overlap =
        other.frontmatter.concept_ids.filter((id) => conceptSet.has(id)).length +
        other.frontmatter.autopsy_ids.filter((id) => autopsySet.has(id)).length;
      return { other: other.frontmatter, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ other }) => ({
      slug: other.id,
      title: other.title,
    }));

  const sources = Array.from(
    new Set([
      ...symptom.concept_ids.flatMap((cid) => conceptMap.get(cid)?.frontmatter.sources ?? []),
      ...symptom.autopsy_ids.flatMap((aid) => autopsyMap.get(aid)?.frontmatter.sources ?? []),
    ])
  );

  const signature = primarySignatureText(symptom);
  const signatureEngines =
    symptom.signatures.length > 0
      ? Array.from(new Set(symptom.signatures.flatMap((s) => s.engines)))
      : null;

  const proof = summarizePageProof(symptom.id, symptom.proof_status);

  return {
    slug: symptom.id,
    title: symptom.title,
    proofStatus: symptom.proof_status,
    signature,
    signatureEngines,
    summary: symptom.summary,
    causes,
    related,
    proof,
    sources,
    jsonLd: buildSymptomJsonLd({
      slug: symptom.id,
      title: symptom.title,
      summary: symptom.summary,
      devtoolsSignature: signature,
      sources,
    }),
  };
}
