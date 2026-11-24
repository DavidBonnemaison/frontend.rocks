import type { LoadedConcept, LoadedAutopsy } from './content-loader';
import type { ProductionSymptomConfig } from '../config/symptoms';
import { extractVsPairs, type VsPair } from './vs-pairs';
import { publishedAutopsies, publishedConcepts, publishedSymptoms, publishedVsPairs } from './publication';

/**
 * Everything machine-facing exports may publish. `extractVsPairs` receives ALL concepts
 * (it needs both sides of a pair to compute its status), then the result is filtered.
 */
export function selectPublishableContent(input: {
  concepts: LoadedConcept[];
  autopsies: LoadedAutopsy[];
  symptoms: ProductionSymptomConfig[];
}): {
  concepts: LoadedConcept[];
  autopsies: LoadedAutopsy[];
  symptoms: ProductionSymptomConfig[];
  vsPairs: VsPair[];
} {
  return {
    concepts: publishedConcepts(input.concepts),
    autopsies: publishedAutopsies(input.autopsies),
    symptoms: publishedSymptoms(input.symptoms),
    vsPairs: publishedVsPairs(extractVsPairs(input.concepts, input.autopsies)),
  };
}
