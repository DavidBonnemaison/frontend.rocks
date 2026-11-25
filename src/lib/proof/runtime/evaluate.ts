import type { Json, RunVariant } from '../define-experiment';
import type { ExperimentBundle } from '../experiment-schema';
import type { ParamValues } from './compose';
import { jsonEqual } from './canonical-json';
import type { RunResult } from './protocol';

export interface CaseEvaluation {
  status: 'pass' | 'fail' | 'error';
  observed: { treatment: Json; control: Json };
  presented: { treatment: Json | null; control: Json | null };
  error: string | null;
}

/** Executes one variant and returns its RunResult. `expectKey` lets the caller apply case emulation. */
export type Executor = (
  variant: RunVariant,
  params: ParamValues,
  mutated: boolean,
  meta: { expectKey: string | null }
) => Promise<RunResult>;

/** Evaluates a non-measured expect case: treatment then control, compared by canonical JSON equality. */
export async function evaluateCase(
  bundle: ExperimentBundle,
  key: string,
  exec: Executor
): Promise<CaseEvaluation & { raw: { treatment: RunResult; control: RunResult } }> {
  const expectCase = bundle.expect[key];
  if (!expectCase) throw new Error(`unknown expect key "${key}"`);
  const params = expectCase.params ?? {};
  const t = await exec('treatment', params, false, { expectKey: key });
  const c = await exec('control', params, false, { expectKey: key });
  const error = !t.ok ? `treatment: ${t.error}` : !c.ok ? `control: ${c.error}` : null;
  const pass =
    t.ok &&
    c.ok &&
    jsonEqual(t.value, expectCase.treatment) &&
    jsonEqual(c.value, expectCase.control);
  return {
    status: error ? 'error' : pass ? 'pass' : 'fail',
    observed: { treatment: t.ok ? t.value : null, control: c.ok ? c.value : null },
    presented: { treatment: t.ok ? t.presented : null, control: c.ok ? c.presented : null },
    error,
    raw: { treatment: t, control: c },
  };
}
