import React from 'react';
import type { ProofMdxContext } from '@/components/proof/mdx-components';
import { loadChallenge } from '@/lib/proof/challenge-loader';
import { loadExperimentBundle } from '@/lib/proof/experiment-bundles';
import { getProofResults } from '@/lib/proof/results-loader';
import { ExperimentLab } from './ExperimentLab';
import { computeLabPresentation, extractRecordedResults } from './logic';

export interface ExperimentProps {
  id: string;
  layout?: 'single' | 'side-by-side';
  figureNumber?: number;
  initialParams?: Record<string, number | boolean | string>;
  initialVariant?: 'treatment' | 'control';
  ctx?: ProofMdxContext;
}

export function Experiment({
  id,
  layout = 'single',
  figureNumber,
  initialParams,
  initialVariant,
  ctx,
}: ExperimentProps) {
  const loaded = loadExperimentBundle(id);
  const { view, ...bundle } = loaded;
  const challenge = loadChallenge(id);
  const recorded = extractRecordedResults(id, getProofResults());
  const { mode, labels, highlightColor } = computeLabPresentation(bundle, ctx);

  return (
    <ExperimentLab
      bundle={bundle}
      view={view}
      challenge={challenge}
      recorded={recorded}
      mode={mode}
      layout={layout}
      labels={labels}
      highlightColor={highlightColor}
      figureNumber={figureNumber}
      initialParams={initialParams}
      initialVariant={initialVariant}
    />
  );
}
