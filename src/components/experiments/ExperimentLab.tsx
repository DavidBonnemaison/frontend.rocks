'use client';

import React, { useCallback, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { RenderInstrument } from '@/components/instruments/RenderInstrument';
import { ExperimentFrame, type FrameState } from '@/components/proof/ExperimentFrame';
import { InstrumentPanel } from '@/components/ui/Instrument/InstrumentPanel';
import { ModeSelector } from '@/components/ui/Instrument/ModeSelector';
import { RangeControl } from '@/components/ui/Instrument/RangeControl';
import { SelectControl } from '@/components/ui/Instrument/SelectControl';
import { SlideSwitch } from '@/components/ui/Instrument/SlideSwitch';
import { track, trackOnce } from '@/lib/analytics';
import {
  buildChallengeBundle,
  checkForbidden,
  getStartingCode,
  isSuccess,
  targetVariant,
} from '@/lib/proof/challenge';
import type { EngineId } from '@/lib/proof/claim-schema';
import type { Json } from '@/lib/proof/define-experiment';
import type { UaData } from '@/lib/proof/detect-browser';
import { ENGINE_LABELS } from '@/lib/proof/engine-labels';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import {
  clearChallengeDraft,
  getChallengeDraft,
  isChallengeSolved,
  markChallengeSolved,
  saveChallengeDraft,
} from '@/lib/progress';
import type { CodeEditorProps } from './CodeEditor';
import {
  buildControlsList,
  canTryItYourself,
  checkLiveAgainstExpect,
  computeLabStatus,
  DEFAULT_VIEW,
  extractRecordedObservation,
  formatLiveBrowserCaption,
  formatRecordedCaption,
  getAvailableRecordedEngines,
  getDefaultParams,
  isRecordedOnly,
  selectRecordedCase,
  summarizeEngineStatuses,
  type ParamValues,
} from './logic';
import type { ExperimentLabProps } from './types';
import './ExperimentLab.css';

function subscribeWideViewport(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(min-width: 720px)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getWideViewportSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(min-width: 720px)').matches;
}

function getWideViewportServerSnapshot(): boolean {
  return true;
}

function readBrowserCaption(): string {
  if (typeof navigator === 'undefined') return 'Recorded in your browser';
  const nav = navigator as Navigator & { userAgentData?: UaData };
  return formatLiveBrowserCaption(navigator.userAgent, nav.userAgentData);
}

function mapRawStatus(state: FrameState | null, fallbackValue: Json | undefined): string {
  if (state) {
    if (state.status === 'ok') return 'ok';
    if (state.status === 'error' || state.status === 'blocked') return 'error';
    if (state.status === 'not-runnable') return 'not-runnable';
    return 'pending';
  }
  return fallbackValue !== undefined ? 'recorded' : 'pending';
}

function formatRawJson(state: FrameState | null, fallbackValue: Json | undefined): string {
  if (state?.status === 'ok' && state.result?.ok) {
    return JSON.stringify(state.result.value, null, 2);
  }
  if (state?.status === 'error') {
    return `Error: ${state.reason ?? 'unknown error'}`;
  }
  if (fallbackValue !== undefined) {
    return JSON.stringify(fallbackValue, null, 2);
  }
  return 'Pending...';
}

export function ExperimentLab({
  bundle,
  view,
  challenge,
  recorded,
  mode,
  layout,
  labels,
  highlightColor,
  figureNumber,
  initialParams,
  initialVariant = 'treatment',
  params: controlledParams,
  variant: controlledVariant,
  onObserved,
}: ExperimentLabProps) {
  const uid = useId();
  const isWide = useSyncExternalStore(
    subscribeWideViewport,
    getWideViewportSnapshot,
    getWideViewportServerSnapshot,
  );

  const [internalParams, setInternalParams] = useState<ParamValues>(() =>
    getDefaultParams(bundle, initialParams),
  );
  const [internalVariant, setInternalVariant] = useState<'treatment' | 'control'>(initialVariant);
  const [runId, setRunId] = useState(0);
  const [tryInteractive, setTryInteractive] = useState(false);

  const recordedEngines = useMemo(() => getAvailableRecordedEngines(recorded), [recorded]);
  const [selectedEngine, setSelectedEngine] = useState<EngineId>(
    () => recordedEngines[0] ?? 'chromium',
  );

  const [treatmentState, setTreatmentState] = useState<FrameState | null>(null);
  const [controlState, setControlState] = useState<FrameState | null>(null);

  // Break it / Fix it state (US-37.2)
  const [editorOpen, setEditorOpen] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<CodeEditorProps> | null>(
    null,
  );
  const [editorLoading, setEditorLoading] = useState(false);
  const [challengeCode, setChallengeCode] = useState<string>(() =>
    challenge ? getStartingCode(bundle, challenge) : '',
  );
  const [challengeRunBundle, setChallengeRunBundle] = useState<ExperimentBundle | null>(null);
  const [challengeRunKey, setChallengeRunKey] = useState(0);
  const [challengeStatus, setChallengeStatus] = useState<
    'idle' | 'running' | 'success' | 'fail' | 'forbidden' | 'error'
  >('idle');
  const [challengeMessage, setChallengeMessage] = useState<string>('');
  const [challengeObserved, setChallengeObserved] = useState<Json | undefined>(undefined);
  const [challengeFailures, setChallengeFailures] = useState(0);
  const [challengeSolved, setChallengeSolved] = useState<boolean>(() =>
    challenge ? isChallengeSolved(bundle.id) : false,
  );

  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeParams = controlledParams ?? internalParams;
  const activeVariant = controlledVariant ?? internalVariant;
  const otherVariant: 'treatment' | 'control' =
    activeVariant === 'treatment' ? 'control' : 'treatment';

  const recordedOnly = isRecordedOnly(bundle);
  const allowTryItYourself = recordedOnly && canTryItYourself(bundle);
  const showSideBySide = !recordedOnly && mode === 'explore' && layout === 'side-by-side' && isWide;

  const controlsList = useMemo(() => buildControlsList(bundle), [bundle]);
  const labStatus = useMemo(() => computeLabStatus(bundle, recorded), [bundle, recorded]);
  const engineRows = useMemo(() => summarizeEngineStatuses(bundle, recorded), [bundle, recorded]);
  const effectiveView = view ?? DEFAULT_VIEW;

  const selectedRecorded = useMemo(
    () => selectRecordedCase(bundle, recorded, activeParams, selectedEngine),
    [bundle, recorded, activeParams, selectedEngine],
  );
  const recordedObs = useMemo(
    () => extractRecordedObservation(selectedRecorded?.entry ?? null, activeVariant),
    [selectedRecorded, activeVariant],
  );

  const handleParamChange = useCallback(
    (name: string, nextValue: number | boolean | string) => {
      trackOnce('experiment_interact', bundle.id);
      setInternalParams((prev) => ({ ...prev, [name]: nextValue }));
    },
    [bundle.id],
  );

  const handleVariantChange = useCallback(
    (next: 'treatment' | 'control') => {
      trackOnce('experiment_interact', bundle.id);
      setInternalVariant(next);
    },
    [bundle.id],
  );

  const handleRunAgain = useCallback(() => {
    trackOnce('experiment_interact', bundle.id);
    setRunId((n) => n + 1);
  }, [bundle.id]);

  const handleTreatmentState = useCallback(
    (state: FrameState) => {
      setTreatmentState(state);
      if (state.status === 'ok' && state.result?.ok) {
        onObserved?.({
          variant: 'treatment',
          params: activeParams,
          value: state.result.value,
          source: 'live',
        });
      }
    },
    [activeParams, onObserved],
  );

  const handleControlState = useCallback(
    (state: FrameState) => {
      setControlState(state);
      if (state.status === 'ok' && state.result?.ok) {
        onObserved?.({
          variant: 'control',
          params: activeParams,
          value: state.result.value,
          source: 'live',
        });
      }
    },
    [activeParams, onObserved],
  );

  const handleOpenEditor = useCallback(async () => {
    if (!challenge) return;
    if (editorOpen) {
      setEditorOpen(false);
      return;
    }
    const draft = getChallengeDraft(bundle.id);
    setChallengeCode(draft ?? getStartingCode(bundle, challenge));
    setEditorOpen(true);
    if (!EditorComponent) {
      setEditorLoading(true);
      try {
        const mod = await import('./CodeEditor');
        setEditorComponent(() => mod.default);
      } finally {
        setEditorLoading(false);
      }
    }
  }, [bundle, challenge, editorOpen, EditorComponent]);

  const handleEditorChange = useCallback(
    (next: string) => {
      setChallengeCode(next);
      saveChallengeDraft(bundle.id, next);
    },
    [bundle.id],
  );

  const handleResetChallenge = useCallback(() => {
    if (!challenge) return;
    const start = getStartingCode(bundle, challenge);
    setChallengeCode(start);
    clearChallengeDraft(bundle.id);
    setChallengeStatus('idle');
    setChallengeMessage('');
    setChallengeObserved(undefined);
    setChallengeRunBundle(null);
  }, [bundle, challenge]);

  const handleCheckFix = useCallback(() => {
    if (!challenge) return;
    const forbidden = checkForbidden(challenge, challengeCode);
    if (forbidden !== null) {
      setChallengeStatus('forbidden');
      setChallengeMessage(`Not allowed in this challenge: "${forbidden}"`);
      return;
    }
    const nextBundle = buildChallengeBundle(bundle, challenge, challengeCode);
    setChallengeStatus('running');
    setChallengeMessage('Checking your fix in your browser…');
    setChallengeRunBundle(nextBundle);
    setChallengeRunKey((k) => k + 1);
  }, [bundle, challenge, challengeCode]);

  const handleChallengeFrameState = useCallback(
    (state: FrameState) => {
      if (!challenge) return;
      if (state.status === 'ok' && state.result?.ok) {
        const val = state.result.value;
        setChallengeObserved(val);
        if (isSuccess(bundle, challenge, val)) {
          setChallengeStatus('success');
          setChallengeMessage('Fixed! Your browser produced the target observation.');
          setChallengeSolved(true);
          markChallengeSolved(bundle.id);
          clearChallengeDraft(bundle.id);
          track('experiment_fix_success', bundle.id);
        } else {
          setChallengeStatus('fail');
          setChallengeFailures((n) => n + 1);
          setChallengeMessage('Not quite yet. Compare your observation with the target below.');
        }
      } else if (state.status === 'error' || state.status === 'blocked') {
        setChallengeStatus('error');
        setChallengeFailures((n) => n + 1);
        setChallengeMessage(`Your browser threw: ${state.reason ?? 'execution error'}`);
      }
    },
    [bundle, challenge],
  );

  // Resolve primary and secondary states for readout
  const primaryFrameState = activeVariant === 'treatment' ? treatmentState : controlState;
  const secondaryFrameState = activeVariant === 'treatment' ? controlState : treatmentState;

  const storageBlocked =
    primaryFrameState?.status === 'blocked' || secondaryFrameState?.status === 'blocked';
  const livePrimaryOk =
    !recordedOnly && primaryFrameState?.status === 'ok' && primaryFrameState.result?.ok;
  const liveSecondaryOk =
    !recordedOnly &&
    showSideBySide &&
    secondaryFrameState?.status === 'ok' &&
    secondaryFrameState.result?.ok;
  const interactiveOk =
    allowTryItYourself &&
    tryInteractive &&
    primaryFrameState?.status === 'ok' &&
    primaryFrameState.result?.ok;

  const displayedObserved: Json | undefined = interactiveOk
    ? primaryFrameState.result!.ok
      ? primaryFrameState.result!.value
      : undefined
    : livePrimaryOk
      ? primaryFrameState.result!.ok
        ? primaryFrameState.result!.value
        : undefined
      : recordedObs.observed;

  const displayedCompareObserved: Json | undefined = liveSecondaryOk
    ? secondaryFrameState.result!.ok
      ? secondaryFrameState.result!.value
      : undefined
    : recordedObs.compareObserved;

  const displayedPresented: Json | null =
    (interactiveOk || livePrimaryOk) && primaryFrameState?.result?.ok
      ? (primaryFrameState.result.presented ?? null)
      : recordedObs.presented;

  const displayedComparePresented: Json | null =
    liveSecondaryOk && secondaryFrameState?.result?.ok
      ? (secondaryFrameState.result.presented ?? null)
      : recordedObs.comparePresented;

  const displayedTrace: Json[] | null =
    (interactiveOk || livePrimaryOk) && primaryFrameState?.result?.ok
      ? primaryFrameState.result.trace
      : null;

  const displayedCompareTrace: Json[] | null =
    liveSecondaryOk && secondaryFrameState?.result?.ok ? secondaryFrameState.result.trace : null;

  const sourceCaption = useMemo(() => {
    if (interactiveOk) return 'Your run (not part of the proof)';
    if (livePrimaryOk) return readBrowserCaption();
    if (selectedRecorded && recorded) {
      return formatRecordedCaption(
        selectedRecorded.engine,
        recorded.engines[selectedRecorded.engine],
        recorded.generatedAt,
      );
    }
    return 'Not recorded yet';
  }, [interactiveOk, livePrimaryOk, selectedRecorded, recorded]);

  const expectMatch = useMemo(() => {
    if (!livePrimaryOk || displayedObserved === undefined) return null;
    return checkLiveAgainstExpect(bundle, activeParams, activeVariant, displayedObserved);
  }, [livePrimaryOk, displayedObserved, bundle, activeParams, activeVariant]);

  const aspectRatioStyle: React.CSSProperties = {
    aspectRatio: `${bundle.viewport.width} / ${bundle.viewport.height}`,
  };

  const challengeExpectParams = useMemo(() => {
    if (!challenge) return undefined;
    return {
      ...getDefaultParams(bundle),
      ...(bundle.expect[challenge.expectKey]?.params ?? {}),
    };
  }, [bundle, challenge]);

  const challengeExpectedTarget = useMemo(() => {
    if (!challenge) return undefined;
    return bundle.expect[challenge.expectKey]?.[targetVariant(challenge)];
  }, [bundle, challenge]);

  const stageNode = (
    <div
      className="experiment-lab-stage"
      data-testid="experiment-lab-stage"
      data-side-by-side={showSideBySide ? 'true' : 'false'}
    >
      {recordedOnly && !tryInteractive ? (
        <div className="experiment-stage-recorded-banner" data-testid="experiment-recorded-only">
          <span>
            {recorded
              ? 'This experiment runs in the CI proof runner. Inspect the recorded observations below.'
              : 'Not recorded yet'}
          </span>
          {allowTryItYourself ? (
            <div>
              <button
                type="button"
                className="experiment-btn"
                data-testid="experiment-try-it-yourself"
                onClick={() => {
                  trackOnce('experiment_interact', bundle.id);
                  setTryInteractive(true);
                }}
              >
                Try it yourself
              </button>
            </div>
          ) : null}
        </div>
      ) : showSideBySide ? (
        <>
          <div className="experiment-stage-slot">
            <span className="experiment-stage-label">{labels.treatment}</span>
            <div className="experiment-stage-box" style={aspectRatioStyle}>
              <ExperimentFrame
                key={`t-${runId}`}
                bundle={bundle}
                variant="treatment"
                params={activeParams}
                interactive={false}
                onState={handleTreatmentState}
              />
            </div>
          </div>
          <div className="experiment-stage-slot">
            <span className="experiment-stage-label">{labels.control}</span>
            <div className="experiment-stage-box" style={aspectRatioStyle}>
              <ExperimentFrame
                key={`c-${runId}`}
                bundle={bundle}
                variant="control"
                params={activeParams}
                interactive={false}
                onState={handleControlState}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="experiment-stage-slot">
          <span className="experiment-stage-label">{labels[activeVariant]}</span>
          <div className="experiment-stage-box" style={aspectRatioStyle}>
            <ExperimentFrame
              key={`${activeVariant}-${runId}`}
              bundle={bundle}
              variant={activeVariant}
              params={activeParams}
              interactive={tryInteractive}
              onState={activeVariant === 'treatment' ? handleTreatmentState : handleControlState}
            />
          </div>
        </div>
      )}
    </div>
  );

  const hasVariantControl = controlledVariant === undefined && !showSideBySide;
  const hasParamControls = controlledParams === undefined && controlsList.length > 0;
  const hasEngineSelector = recordedOnly && recordedEngines.length > 1;

  const controlsNode =
    hasVariantControl || hasParamControls || hasEngineSelector ? (
      <div className="experiment-controls" data-testid="experiment-controls">
        {hasVariantControl && mode === 'repro' ? (
          <SlideSwitch
            id={`${uid}-apply-fix`}
            label="Apply fix"
            offLabel={labels.treatment}
            onLabel={labels.control}
            checked={activeVariant === 'control'}
            testId="experiment-apply-fix"
            onChange={(checked) => handleVariantChange(checked ? 'control' : 'treatment')}
          />
        ) : null}

        {hasVariantControl && mode === 'explore' ? (
          <ModeSelector<'treatment' | 'control'>
            id={`${uid}-variant`}
            label="Variant"
            options={[
              { value: 'treatment', label: labels.treatment },
              { value: 'control', label: labels.control },
            ]}
            value={activeVariant}
            onChange={handleVariantChange}
          />
        ) : null}

        {hasEngineSelector ? (
          <ModeSelector<EngineId>
            id={`${uid}-engine`}
            label="Recorded engine"
            options={recordedEngines.map((e) => ({ value: e, label: ENGINE_LABELS[e] }))}
            value={selectedEngine}
            onChange={setSelectedEngine}
          />
        ) : null}

        {hasParamControls
          ? controlsList.map(({ name, def }) => {
              const controlId = `${uid}-param-${name}`;
              const val = activeParams[name] ?? def.default;
              if (def.kind === 'range') {
                return (
                  <RangeControl
                    key={name}
                    id={controlId}
                    label={def.label}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    unit={def.unit}
                    value={Number(val)}
                    testId={`experiment-param-${name}`}
                    onChange={(v) => handleParamChange(name, v)}
                  />
                );
              }
              if (def.kind === 'toggle') {
                return (
                  <SlideSwitch
                    key={name}
                    id={controlId}
                    label={def.label}
                    offLabel="Off"
                    onLabel="On"
                    checked={Boolean(val)}
                    testId={`experiment-param-${name}`}
                    onChange={(v) => handleParamChange(name, v)}
                  />
                );
              }
              return (
                <SelectControl
                  key={name}
                  id={controlId}
                  label={def.label}
                  options={def.options}
                  value={String(val)}
                  testId={`experiment-param-${name}`}
                  onChange={(v) => handleParamChange(name, v)}
                />
              );
            })
          : null}
      </div>
    ) : undefined;

  const readoutsNode = (
    <div className="experiment-readouts" data-testid="experiment-readouts">
      <div className="experiment-status-line">
        <span data-testid="experiment-source-caption">
          {primaryFrameState?.status === 'running' ? 'Running in your browser…' : sourceCaption}
        </span>
        {expectMatch ? (
          <span
            className="experiment-expect-badge"
            data-testid="experiment-expect-status"
            data-match={expectMatch}
          >
            {expectMatch === 'matches'
              ? 'Matches the claim'
              : 'Differs from the claim in your browser'}
          </span>
        ) : null}
      </div>

      {storageBlocked ? (
        <div className="experiment-notice-box" data-testid="experiment-storage-blocked">
          Your browser blocks storage in embedded frames. Showing the results recorded by the
          nightly run.
        </div>
      ) : null}

      {primaryFrameState?.status === 'error' ? (
        <div className="experiment-error-box" data-testid="experiment-error">
          Your browser threw: {primaryFrameState.reason ?? 'unknown error'}
        </div>
      ) : null}

      {recordedOnly && !recorded && !interactiveOk ? (
        <div className="experiment-notice-box" data-testid="experiment-not-recorded">
          Not recorded yet
        </div>
      ) : (
        <RenderInstrument
          view={effectiveView}
          observed={displayedObserved}
          compareObserved={displayedCompareObserved}
          presented={displayedPresented}
          comparePresented={displayedComparePresented}
          trace={displayedTrace}
          compareTrace={displayedCompareTrace}
          measured={recordedObs.measured}
          labels={{
            primary: labels[activeVariant],
            secondary: labels[otherVariant],
          }}
          caption={effectiveView.captionHint ?? bundle.title}
          figureNumber={figureNumber}
          highlightColor={highlightColor ?? undefined}
        />
      )}

      <details className="experiment-raw-details">
        <summary>Raw observation</summary>
        <pre
          data-testid="experiment-observed-treatment"
          data-status={mapRawStatus(
            treatmentState,
            selectedRecorded?.entry && !recordedObs.measured
              ? (selectedRecorded.entry.observed as { treatment: Json; control: Json }).treatment
              : undefined,
          )}
        >
          {formatRawJson(
            treatmentState,
            selectedRecorded?.entry && !recordedObs.measured
              ? (selectedRecorded.entry.observed as { treatment: Json; control: Json }).treatment
              : undefined,
          )}
        </pre>
        <pre
          data-testid="experiment-observed-control"
          data-status={mapRawStatus(
            controlState,
            selectedRecorded?.entry && !recordedObs.measured
              ? (selectedRecorded.entry.observed as { treatment: Json; control: Json }).control
              : undefined,
          )}
        >
          {formatRawJson(
            controlState,
            selectedRecorded?.entry && !recordedObs.measured
              ? (selectedRecorded.entry.observed as { treatment: Json; control: Json }).control
              : undefined,
          )}
        </pre>
      </details>

      {challenge && editorOpen ? (
        <div className="experiment-challenge-panel" data-testid="challenge-panel">
          <p className="experiment-challenge-goal">
            {challenge.goal} {challengeSolved ? ' (Solved)' : ''}
          </p>
          {editorLoading ? (
            <p className="experiment-notice-box">Loading editor…</p>
          ) : EditorComponent ? (
            <EditorComponent
              value={challengeCode}
              language={challenge.editable}
              label={`Edit ${challenge.editable.toUpperCase()} for ${bundle.title}`}
              onChange={handleEditorChange}
              onEscape={() => {
                setEditorOpen(false);
                editButtonRef.current?.focus();
              }}
            />
          ) : null}

          <div className="experiment-challenge-actions">
            <button
              type="button"
              className="experiment-btn experiment-btn-primary"
              data-testid="challenge-check-fix"
              onClick={handleCheckFix}
              disabled={challengeStatus === 'running'}
            >
              Check my fix
            </button>
            <button
              type="button"
              className="experiment-btn"
              data-testid="challenge-reset"
              onClick={handleResetChallenge}
            >
              Reset
            </button>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="experiment-challenge-feedback"
            data-testid="challenge-feedback"
            data-outcome={challengeStatus}
          >
            {challengeMessage}
          </div>

          {challengeStatus === 'fail' &&
          challengeObserved !== undefined &&
          challengeExpectedTarget !== undefined ? (
            <RenderInstrument
              view={DEFAULT_VIEW}
              observed={challengeObserved}
              compareObserved={challengeExpectedTarget}
              labels={{ primary: 'Your result', secondary: 'Target' }}
              caption="Your observation vs target"
            />
          ) : null}

          {challenge.hint && challengeFailures >= 2 && challengeStatus !== 'success' ? (
            <div className="experiment-challenge-hint" data-testid="challenge-hint">
              Hint: {challenge.hint}
            </div>
          ) : null}

          {challengeRunBundle ? (
            <div className="experiment-challenge-runner-hidden" aria-hidden="true">
              <ExperimentFrame
                key={`challenge-${challengeRunKey}`}
                bundle={challengeRunBundle}
                variant={challenge.startFrom}
                params={challengeExpectParams}
                onState={handleChallengeFrameState}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const footerNode = (
    <div className="experiment-footer">
      <div className="experiment-footer-actions">
        {!recordedOnly ? (
          <button
            type="button"
            className="experiment-btn"
            data-testid="experiment-run-again"
            onClick={handleRunAgain}
          >
            Don&apos;t take our word for it · Run again
          </button>
        ) : null}
        {challenge ? (
          <button
            ref={editButtonRef}
            type="button"
            className="experiment-btn"
            data-testid="experiment-edit-code"
            aria-expanded={editorOpen}
            onClick={() => void handleOpenEditor()}
          >
            {editorOpen ? 'Close editor' : 'Edit the code'}
          </button>
        ) : null}
      </div>

      {engineRows.length > 0 ? (
        <div className="experiment-engines-row" data-testid="experiment-engines-row">
          {engineRows.map((row) => (
            <span
              key={row.engine}
              className="experiment-engine-pill"
              data-engine={row.engine}
              data-status={row.status}
            >
              <span className="experiment-engine-sym" aria-hidden="true">
                {row.symbol}
              </span>
              <span>
                {row.label}
                {row.version ? ` ${row.version.split('.')[0]}` : ''}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="experiment-lab" data-testid="experiment-lab" data-experiment-id={bundle.id}>
      <InstrumentPanel
        experimentId={bundle.id}
        status={labStatus}
        question={bundle.question}
        figureNumber={figureNumber}
        caption={bundle.title}
        stage={stageNode}
        controls={controlsNode}
        readouts={readoutsNode}
        footer={footerNode}
      />
    </div>
  );
}
