import {
  getAllAutopsies,
  getAllConcepts,
  type LoadedAutopsy,
  type LoadedConcept,
} from './content-loader';
import type { MaturityStatus, PageProofStatus } from './schemas';
import { vsPairStatus } from './publication';

export type VsRelationType = 'replaces' | 'contrasts_with';

export interface VsPair {
  slug: string;
  proof_status: PageProofStatus;
  relationType: VsRelationType;
  note: string;
  primary: LoadedConcept;
  secondary: LoadedConcept;
  relatedAutopsies: LoadedAutopsy[];
  dateModified: string;
  sources: string[];
}

const MATURITY_RANK: Record<MaturityStatus, number> = {
  'baseline-widely': 0,
  'baseline-newly': 1,
  'interop-experimental': 2,
  'legacy-pattern': 4,
  superseded: 5,
};

function maturityRank(status: MaturityStatus | null): number {
  return status ? MATURITY_RANK[status] : 3;
}

export function hasRequiredVsFields(concept: LoadedConcept): boolean {
  const { frontmatter, sections } = concept;
  return (
    frontmatter.title.trim().length > 0 &&
    frontmatter.summary_tldr.trim().length > 0 &&
    frontmatter.sources.length > 0 &&
    sections.under_the_hood.trim().length > 0 &&
    sections.production_pitfalls.trim().length > 0
  );
}

function normalizeContrastOrder(
  a: LoadedConcept,
  b: LoadedConcept
): [LoadedConcept, LoadedConcept] {
  const rankA = maturityRank(a.frontmatter.maturity_status);
  const rankB = maturityRank(b.frontmatter.maturity_status);
  if (rankA !== rankB) {
    return rankA < rankB ? [a, b] : [b, a];
  }
  return a.frontmatter.id.localeCompare(b.frontmatter.id) <= 0 ? [a, b] : [b, a];
}

function getPairAutopsies(
  idA: string,
  idB: string,
  autopsies: LoadedAutopsy[]
): LoadedAutopsy[] {
  return autopsies.filter((a) =>
    a.frontmatter.traversed_concepts.some(
      (tc) => tc.concept_id === idA || tc.concept_id === idB
    )
  );
}

export function extractVsPairs(
  conceptsInput?: LoadedConcept[],
  autopsiesInput?: LoadedAutopsy[]
): VsPair[] {
  const concepts = conceptsInput ?? getAllConcepts();
  const autopsies = autopsiesInput ?? getAllAutopsies();

  const conceptById = new Map(concepts.map((c) => [c.frontmatter.id, c]));
  const seenUnordered = new Set<string>();
  const pairs: VsPair[] = [];

  // 1. Process `replaces` edges first: A replaces B => A-vs-B
  for (const source of concepts) {
    if (!hasRequiredVsFields(source)) continue;
    for (const rel of source.frontmatter.relations) {
      if (rel.type !== 'replaces') continue;
      if (rel.target_id === source.frontmatter.id) continue;

      const target = conceptById.get(rel.target_id);
      if (!target || !hasRequiredVsFields(target)) continue;

      const unorderedKey = [source.frontmatter.id, target.frontmatter.id].sort().join('::');
      if (seenUnordered.has(unorderedKey)) continue;
      seenUnordered.add(unorderedKey);

      const dateModified =
        source.frontmatter.last_verified_at >= target.frontmatter.last_verified_at
          ? source.frontmatter.last_verified_at
          : target.frontmatter.last_verified_at;

      pairs.push({
        slug: `${source.frontmatter.id}-vs-${target.frontmatter.id}`,
        proof_status: vsPairStatus(source, target),
        relationType: 'replaces',
        note: rel.note,
        primary: source,
        secondary: target,
        relatedAutopsies: getPairAutopsies(
          source.frontmatter.id,
          target.frontmatter.id,
          autopsies
        ),
        dateModified,
        sources: Array.from(
          new Set([...source.frontmatter.sources, ...target.frontmatter.sources])
        ),
      });
    }
  }

  // 2. Process `contrasts_with` edges, normalizing order & deduplicating symmetric pairs
  for (const source of concepts) {
    if (!hasRequiredVsFields(source)) continue;
    for (const rel of source.frontmatter.relations) {
      if (rel.type !== 'contrasts_with') continue;
      if (rel.target_id === source.frontmatter.id) continue;

      const target = conceptById.get(rel.target_id);
      if (!target || !hasRequiredVsFields(target)) continue;

      const unorderedKey = [source.frontmatter.id, target.frontmatter.id].sort().join('::');
      if (seenUnordered.has(unorderedKey)) continue;
      seenUnordered.add(unorderedKey);

      const [primary, secondary] = normalizeContrastOrder(source, target);

      // Prefer the note defined on primary -> secondary if available
      const primaryToSecondary = primary.frontmatter.relations.find(
        (r) => r.type === 'contrasts_with' && r.target_id === secondary.frontmatter.id
      );
      const note = primaryToSecondary?.note ?? rel.note;

      const dateModified =
        primary.frontmatter.last_verified_at >= secondary.frontmatter.last_verified_at
          ? primary.frontmatter.last_verified_at
          : secondary.frontmatter.last_verified_at;

      pairs.push({
        slug: `${primary.frontmatter.id}-vs-${secondary.frontmatter.id}`,
        proof_status: vsPairStatus(primary, secondary),
        relationType: 'contrasts_with',
        note,
        primary,
        secondary,
        relatedAutopsies: getPairAutopsies(
          primary.frontmatter.id,
          secondary.frontmatter.id,
          autopsies
        ),
        dateModified,
        sources: Array.from(
          new Set([...primary.frontmatter.sources, ...secondary.frontmatter.sources])
        ),
      });
    }
  }

  return pairs.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getVsPairBySlug(
  slug: string,
  conceptsInput?: LoadedConcept[],
  autopsiesInput?: LoadedAutopsy[]
): VsPair | null {
  return extractVsPairs(conceptsInput, autopsiesInput).find((p) => p.slug === slug) ?? null;
}

export function getVsPairsForConcept(
  conceptId: string,
  conceptsInput?: LoadedConcept[],
  autopsiesInput?: LoadedAutopsy[]
): VsPair[] {
  return extractVsPairs(conceptsInput, autopsiesInput).filter(
    (p) =>
      p.primary.frontmatter.id === conceptId || p.secondary.frontmatter.id === conceptId
  );
}
