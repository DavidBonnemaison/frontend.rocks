import type { EngineId } from '@/lib/proof/claim-schema';
import type { Challenge } from '@/lib/proof/challenge-schema';
import type { Json } from '@/lib/proof/define-experiment';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import type { CaseStatus, MeasuredObserved } from '@/lib/proof/results-schema';
import type { ExperimentView } from '@/lib/proof/view-schema';

export interface RecordedCaseEngineEntry {
  status: CaseStatus;
  observed: { treatment: Json; control: Json } | MeasuredObserved;
  presented: { treatment: Json | null; control: Json | null } | null;
}

export interface RecordedResults {
  generatedAt: string;
  engines: Partial<Record<EngineId, string>>;
  cases: Record<string, Partial<Record<EngineId, RecordedCaseEngineEntry>>>;
}

export interface ExperimentLabProps {
  bundle: ExperimentBundle;
  view: ExperimentView | null;
  challenge: Challenge | null;
  recorded: RecordedResults | null;
  mode: 'explore' | 'repro';
  layout: 'single' | 'side-by-side';
  labels: { treatment: string; control: string };
  highlightColor: string | null;
  figureNumber?: number;
  initialParams?: Record<string, number | boolean | string>;
  initialVariant?: 'treatment' | 'control';
  params?: Record<string, number | boolean | string>;
  variant?: 'treatment' | 'control';
  onObserved?: (r: {
    variant: 'treatment' | 'control';
    params: Record<string, number | boolean | string>;
    value: Json | null;
    source: 'live' | 'recorded';
  }) => void;
}
