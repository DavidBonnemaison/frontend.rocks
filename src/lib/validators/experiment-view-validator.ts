import type { ExperimentDefinition } from '../proof/define-experiment';
import { selectPath } from '../proof/select-path';
import { ExperimentViewSchema, type ExperimentView } from '../proof/view-schema';

export interface ViewValidationError {
  experimentId: string;
  message: string;
}

/**
 * Pure static validation of an Experiment's view.json against its declared ExperimentDefinition.
 * Never reads proof results.
 */
export function validateExperimentView(
  experimentId: string,
  rawView: unknown,
  experiment: Pick<ExperimentDefinition, 'kind' | 'expect'>,
): { ok: true; view: ExperimentView } | { ok: false; errors: ViewValidationError[] } {
  const parsed = ExperimentViewSchema.safeParse(rawView);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.map(String).join('.') : '(root)'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      errors: [{ experimentId, message: `Invalid view.json: ${issues}` }],
    };
  }

  const view = parsed.data;
  const errors: ViewValidationError[] = [];

  if (view.instrument === 'frame-budget') {
    if (experiment.kind !== 'measured') {
      errors.push({
        experimentId,
        message: `Instrument "frame-budget" requires experiment kind "measured" (got "${experiment.kind}")`,
      });
    }
    return errors.length === 0 ? { ok: true, view } : { ok: false, errors };
  }

  // Check that observedPath exists in each declared expect case's treatment shape.
  for (const [expectKey, expectCase] of Object.entries(experiment.expect)) {
    const res = selectPath(expectCase.treatment, view.observedPath);
    if (!res.ok) {
      errors.push({
        experimentId,
        message: `observedPath "${view.observedPath}" not found in expect["${expectKey}"].treatment (stopped at "${res.at}")`,
      });
    }
  }

  return errors.length === 0 ? { ok: true, view } : { ok: false, errors };
}
