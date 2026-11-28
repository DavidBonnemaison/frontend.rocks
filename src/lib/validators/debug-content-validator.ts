import type { AutopsyFrontmatter } from '../schemas';
import type { SymptomFrontmatter } from '../symptoms/schema';
import type { VsPairEntry } from '../vs/schema';
import { splitClaimId } from '../proof/claim-schema';

/** A number followed by a unit, e.g. `180 ms`, `400MB`, `35%`, `60 fps`. */
const NUMBER_WITH_UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(ms|s|MB|KB|px|%|fps)(?![A-Za-z])/g;

/** Numbers (as written) that appear in a JSON-serialised `expect` block of a repro. */
export function numbersInExpect(expect: unknown): Set<string> {
  const text = JSON.stringify(expect ?? {});
  return new Set([...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]));
}

/** Returns one message per number-with-unit that is not backed by the repro's `expect`. */
export function findUnbackedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(NUMBER_WITH_UNIT_RE)) {
    const value = m[1].replace(',', '.');
    if (!allowed.has(value)) found.push(`${m[1]}${m[2] === '%' ? '' : ' '}${m[2]}`);
  }
  return found;
}

/**
 * Number rule (EPIC-35 §4.2): `root_cause`, `fix`, `how_to_spot` and every `role_in_chain` of a
 * proven autopsy contain no number with a unit unless it appears in the repro's `expect`.
 */
export function validateAutopsyNumberRule(
  fm: Pick<AutopsyFrontmatter, 'id' | 'proof_status' | 'case_file' | 'traversed_concepts'>,
  expect: unknown
): string[] {
  if (fm.proof_status !== 'proven') return [];
  const allowed = numbersInExpect(expect);
  const fields: Array<[string, string]> = [
    ['case_file.root_cause', fm.case_file.root_cause],
    ['case_file.fix', fm.case_file.fix],
    ['case_file.how_to_spot', fm.case_file.how_to_spot],
    ...fm.traversed_concepts.map((s, i): [string, string] => [
      `traversed_concepts[${i}].role_in_chain`,
      s.role_in_chain,
    ]),
  ];
  const errors: string[] = [];
  for (const [field, text] of fields) {
    for (const n of findUnbackedNumbers(text, allowed)) {
      errors.push(
        `[autopsies/${fm.id}] ${field} contains "${n}" which is not an expected value of the repro experiment`
      );
    }
  }
  return errors;
}

/** Every ClaimId cited by an autopsy frontmatter, with the field that cites it. */
export function collectAutopsyClaimRefs(fm: AutopsyFrontmatter): Array<{ field: string; id: string }> {
  const refs: Array<{ field: string; id: string }> = [];
  fm.traversed_concepts.forEach((s, i) =>
    (s.claim_ids ?? []).forEach((id) => refs.push({ field: `traversed_concepts[${i}].claim_ids`, id }))
  );
  const cf = fm.case_file;
  for (const key of ['root_cause_claims', 'fix_claims', 'how_to_spot_claims'] as const) {
    (cf[key] ?? []).forEach((id) => refs.push({ field: `case_file.${key}`, id }));
  }
  cf.bad_fixes.forEach((b, i) =>
    b.outcome_claims.forEach((id) => refs.push({ field: `case_file.bad_fixes[${i}].outcome_claims`, id }))
  );
  return refs;
}

export function collectSymptomClaimRefs(fm: SymptomFrontmatter): Array<{ field: string; id: string }> {
  const own = (c: string) => (c.includes('/') ? c : `${fm.id}/${c}`);
  return [
    ...fm.summary_claims.map((id) => ({ field: 'summary_claims', id })),
    ...fm.signatures.map((s, i) => ({ field: `signatures[${i}].claim`, id: own(s.claim) })),
    ...(fm.devtools_check ? [{ field: 'devtools_check.claim', id: own(fm.devtools_check.claim) }] : []),
  ];
}

export interface DebugReferenceContext {
  claimIds: ReadonlySet<string>;
  experimentIds: ReadonlySet<string>;
}

function checkClaims(
  label: string,
  refs: Array<{ field: string; id: string }>,
  ctx: DebugReferenceContext,
  errors: string[]
): void {
  for (const { field, id } of refs) {
    if (!ctx.claimIds.has(id)) {
      errors.push(`[${label}] ${field} references unknown claim "${id}"`);
    }
  }
}

export function validateAutopsyReferences(fm: AutopsyFrontmatter, ctx: DebugReferenceContext): string[] {
  const errors: string[] = [];
  checkClaims(`autopsies/${fm.id}`, collectAutopsyClaimRefs(fm), ctx, errors);
  if (fm.repro_experiment_id && !ctx.experimentIds.has(fm.repro_experiment_id)) {
    errors.push(
      `[autopsies/${fm.id}] repro_experiment_id "${fm.repro_experiment_id}" has no folder in content/experiments/`
    );
  }
  return errors;
}

export function validateSymptomReferences(fm: SymptomFrontmatter, ctx: DebugReferenceContext): string[] {
  const errors: string[] = [];
  checkClaims(`symptoms/${fm.id}`, collectSymptomClaimRefs(fm), ctx, errors);
  if (fm.repro_experiment_id && !ctx.experimentIds.has(fm.repro_experiment_id)) {
    errors.push(
      `[symptoms/${fm.id}] repro_experiment_id "${fm.repro_experiment_id}" has no folder in content/experiments/`
    );
  }
  return errors;
}

export function validateVsPairReferences(pair: VsPairEntry, ctx: DebugReferenceContext): string[] {
  const errors: string[] = [];
  const label = `vs/${pair.slug}`;
  checkClaims(label, pair.claim_ids.map((id) => ({ field: 'claim_ids', id })), ctx, errors);
  for (const id of pair.claim_ids) {
    const { pageId } = splitClaimId(id);
    if (pageId !== `vs-${pair.slug}`) {
      errors.push(`[${label}] claim_ids entry "${id}" must belong to page "vs-${pair.slug}"`);
    }
  }
  if (!ctx.experimentIds.has(pair.experimentId)) {
    errors.push(`[${label}] experimentId "${pair.experimentId}" has no folder in content/experiments/`);
  }
  return errors;
}
