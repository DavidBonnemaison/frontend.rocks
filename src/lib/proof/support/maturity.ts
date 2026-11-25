import type { ConceptFrontmatter, ConceptFrontmatterFile, MaturityStatus } from '../../schemas';
import { getBaseline } from './baseline';

export function computeConceptMaturity(fm: ConceptFrontmatterFile): MaturityStatus | null {
  if (fm.pattern_status) return fm.pattern_status;
  if (!fm.web_feature_id) return null;
  const b = getBaseline(fm.web_feature_id);
  if (!b.ok) return null; // The verifier reports the error; the page shows no badge.
  if (b.info.baseline === 'high') return 'baseline-widely';
  if (b.info.baseline === 'low') return 'baseline-newly';
  return 'interop-experimental';
}

export function withComputedMaturity(fm: ConceptFrontmatterFile): ConceptFrontmatter {
  return { ...fm, maturity_status: computeConceptMaturity(fm) };
}
