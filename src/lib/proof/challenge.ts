import type { ExperimentDefinition, Json } from './define-experiment';
import type { ExperimentBundle } from './experiment-schema';
import type { Challenge } from './challenge-schema';
import { jsonEqual } from './runtime/canonical-json';

export function targetVariant(challenge: Challenge): 'treatment' | 'control' {
  return challenge.startFrom === 'treatment' ? 'control' : 'treatment';
}

export function getStartingCode(
  bundle: Pick<ExperimentBundle, 'variants'>,
  challenge: Challenge,
): string {
  return bundle.variants[challenge.startFrom][challenge.editable] ?? '';
}

export function getReferenceSolution(
  bundle: Pick<ExperimentBundle, 'variants'>,
  challenge: Challenge,
): string {
  return bundle.variants[targetVariant(challenge)][challenge.editable] ?? '';
}

/**
 * Returns a copy of `bundle` where the editable part of `challenge.startFrom`
 * is replaced by `code`.
 */
export function buildChallengeBundle(
  bundle: ExperimentBundle,
  challenge: Challenge,
  code: string,
): ExperimentBundle {
  const startVariant = bundle.variants[challenge.startFrom];
  return {
    ...bundle,
    variants: {
      ...bundle.variants,
      [challenge.startFrom]: {
        ...startVariant,
        [challenge.editable]: code,
      },
    },
  };
}

/**
 * Returns the first forbidden substring present in `code`, or null if clean.
 */
export function checkForbidden(challenge: Challenge, code: string): string | null {
  for (const token of challenge.forbid) {
    if (token.length > 0 && code.includes(token)) {
      return token;
    }
  }
  return null;
}

/**
 * Checks whether the reader's observation matches the target variant's expectation
 * using canonical JSON equality.
 */
export function isSuccess(
  bundle: Pick<ExperimentBundle, 'expect'>,
  challenge: Challenge,
  observed: Json,
): boolean {
  const exp = bundle.expect[challenge.expectKey];
  if (!exp) return false;
  const expected = exp[targetVariant(challenge)];
  return jsonEqual(observed, expected);
}

/**
 * Validates static challenge rules against an Experiment definition or bundle:
 * 1. Measured experiments cannot have challenges.
 * 2. expectKey must exist and treatment/control expectations must differ.
 */
export function validateChallengeAgainstExperiment(
  experiment: Pick<ExperimentDefinition, 'id' | 'kind' | 'expect'>,
  challenge: Challenge,
): string[] {
  const errors: string[] = [];
  if (experiment.kind === 'measured') {
    errors.push(`Experiment "${experiment.id}" is measured and cannot define a challenge.`);
  }
  const exp = experiment.expect[challenge.expectKey];
  if (!exp) {
    errors.push(
      `Challenge expectKey "${challenge.expectKey}" does not exist in experiment "${experiment.id}".`,
    );
  } else if (jsonEqual(exp.treatment, exp.control)) {
    errors.push(
      `Challenge expectKey "${challenge.expectKey}" in "${experiment.id}" has identical treatment and control expectations.`,
    );
  }
  return errors;
}
