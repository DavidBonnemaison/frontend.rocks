import {
  getAllAutopsies,
  getAllConcepts,
  type LoadedAutopsy,
  type LoadedConcept,
} from '../content-loader';
import { splitProductionPitfalls, stripMarkdown } from '../seo-schema';
import { extractVsPairs, type VsPair } from '../vs-pairs';
import {
  getAllSymptoms,
  primarySignatureText,
  type LoadedSymptom,
} from '../symptoms/loader';

export const MAX_NGRAM_OVERLAP = 0.65;

export function computeNgrams(text: string, n = 3): Set<string> {
  const tokens = stripMarkdown(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const ngrams = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length > 0) ngrams.add(tokens.join(' '));
    return ngrams;
  }

  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

export function computeNgramOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of smaller) {
    if (larger.has(gram)) intersection++;
  }
  return intersection / smaller.size;
}

export function assembleVsPageText(pair: VsPair): string {
  const pPitfalls = splitProductionPitfalls(pair.primary.sections.production_pitfalls);
  const sPitfalls = splitProductionPitfalls(pair.secondary.sections.production_pitfalls);

  return [
    pair.primary.frontmatter.title,
    pair.secondary.frontmatter.title,
    pair.note,
    pair.primary.frontmatter.summary_tldr,
    pair.secondary.frontmatter.summary_tldr,
    pPitfalls.whenNotToUse || pPitfalls.mainPitfalls,
    sPitfalls.whenNotToUse || sPitfalls.mainPitfalls,
    pair.primary.evidence?.engine_internals.mechanism_summary ??
      pair.primary.sections.under_the_hood.slice(0, 500),
    pair.secondary.evidence?.engine_internals.mechanism_summary ??
      pair.secondary.sections.under_the_hood.slice(0, 500),
    ...pair.relatedAutopsies.map((a) => `${a.frontmatter.title} ${a.frontmatter.symptom}`),
  ].join(' ');
}

export function assembleSymptomPageText(
  symptom: LoadedSymptom,
  conceptMap: Map<string, LoadedConcept>,
  autopsyMap: Map<string, LoadedAutopsy>
): string {
  const fm = symptom.frontmatter;
  const conceptTexts = fm.concept_ids.map((cid) => {
    const c = conceptMap.get(cid);
    return c ? `${c.frontmatter.title} ${c.frontmatter.summary_tldr}` : cid;
  });
  const autopsyTexts = fm.autopsy_ids.map((aid) => {
    const a = autopsyMap.get(aid);
    return a ? `${a.frontmatter.title} ${a.frontmatter.symptom}` : aid;
  });

  return [
    fm.title,
    fm.summary,
    primarySignatureText(fm),
    ...conceptTexts,
    ...autopsyTexts,
  ].join(' ');
}

export interface SeoValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    vsPairCount: number;
    maxVsOverlap: number;
    symptomCount: number;
    maxSymptomOverlap: number;
  };
}

export function validateProgrammaticSeo(options?: {
  concepts?: LoadedConcept[];
  autopsies?: LoadedAutopsy[];
  productionSymptoms?: LoadedSymptom[];
  maxNgramOverlap?: number;
}): SeoValidationResult {
  const concepts = options?.concepts ?? getAllConcepts();
  const autopsies = options?.autopsies ?? getAllAutopsies();
  const productionSymptoms = options?.productionSymptoms ?? getAllSymptoms();
  const maxOverlapThreshold = options?.maxNgramOverlap ?? MAX_NGRAM_OVERLAP;

  const errors: string[] = [];
  const conceptMap = new Map(concepts.map((c) => [c.frontmatter.id, c]));
  const autopsyMap = new Map(autopsies.map((a) => [a.frontmatter.id, a]));

  // 1. Validate /vs/ pairs mechanical density & n-gram uniqueness
  const vsPairs = extractVsPairs(concepts, autopsies);
  const vsNgrams = vsPairs.map((pair) => {
    if (pair.note.trim().length < 20) {
      errors.push(`[vs/${pair.slug}] Missing or too short relational note.`);
    }
    if (!pair.primary.frontmatter.summary_tldr || !pair.secondary.frontmatter.summary_tldr) {
      errors.push(`[vs/${pair.slug}] Missing summary_tldr for comparison matrix.`);
    }
    if (
      !pair.primary.sections.production_pitfalls ||
      !pair.secondary.sections.production_pitfalls
    ) {
      errors.push(`[vs/${pair.slug}] Missing production_pitfalls for contraindications.`);
    }
    if (!pair.primary.lab && !pair.secondary.lab) {
      errors.push(`[vs/${pair.slug}] Neither concept has an interactive #lab link.`);
    }
    return {
      slug: pair.slug,
      grams: computeNgrams(assembleVsPageText(pair), 3),
    };
  });

  let maxVsOverlap = 0;
  for (let i = 0; i < vsNgrams.length; i++) {
    for (let j = i + 1; j < vsNgrams.length; j++) {
      const overlap = computeNgramOverlap(vsNgrams[i].grams, vsNgrams[j].grams);
      if (overlap > maxVsOverlap) maxVsOverlap = overlap;
      if (overlap >= maxOverlapThreshold) {
        errors.push(
          `[Anti-Doorway /vs/] "${vsNgrams[i].slug}" and "${vsNgrams[j].slug}" share ${(overlap * 100).toFixed(1)}% 3-gram overlap (limit < ${(maxOverlapThreshold * 100).toFixed(0)}%)`
        );
      }
    }
  }

  // 2. Validate /symptoms/ config (count, zero orphans, n-gram uniqueness)
  if (productionSymptoms.length < 20 || productionSymptoms.length > 30) {
    errors.push(
      `[symptoms.ts] Expected 20 to 30 production symptoms, found ${productionSymptoms.length}.`
    );
  }

  const seenSymptomSlugs = new Set<string>();

  for (const s of productionSymptoms) {
    const fm = s.frontmatter;
    if (seenSymptomSlugs.has(fm.id)) {
      errors.push(`[symptoms] Duplicate symptom id "${fm.id}".`);
    }
    seenSymptomSlugs.add(fm.id);

    if (fm.concept_ids.length === 0) {
      errors.push(`[symptoms] Symptom "${fm.id}" must reference at least one concept_id.`);
    }
    for (const cid of fm.concept_ids) {
      if (!conceptMap.has(cid)) {
        errors.push(`[symptoms] Symptom "${fm.id}" references orphan concept_id "${cid}".`);
      }
    }
    for (const aid of fm.autopsy_ids) {
      if (!autopsyMap.has(aid)) {
        errors.push(`[symptoms] Symptom "${fm.id}" references orphan autopsy_id "${aid}".`);
      }
    }
  }

  const symptomNgrams = productionSymptoms.map((s) => ({
    slug: s.frontmatter.id,
    grams: computeNgrams(assembleSymptomPageText(s, conceptMap, autopsyMap), 3),
  }));

  let maxSymptomOverlap = 0;
  for (let i = 0; i < symptomNgrams.length; i++) {
    for (let j = i + 1; j < symptomNgrams.length; j++) {
      const overlap = computeNgramOverlap(symptomNgrams[i].grams, symptomNgrams[j].grams);
      if (overlap > maxSymptomOverlap) maxSymptomOverlap = overlap;
      if (overlap >= maxOverlapThreshold) {
        errors.push(
          `[Anti-Doorway /symptoms/] "${symptomNgrams[i].slug}" and "${symptomNgrams[j].slug}" share ${(overlap * 100).toFixed(1)}% 3-gram overlap (limit < ${(maxOverlapThreshold * 100).toFixed(0)}%)`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      vsPairCount: vsPairs.length,
      maxVsOverlap,
      symptomCount: productionSymptoms.length,
      maxSymptomOverlap,
    },
  };
}
