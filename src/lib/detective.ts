import type { FailureMode } from './schemas';

export interface DetectiveOption {
  id: string;
  label: string;
  isRootCause: boolean;
  outcome?: string;
}

interface FallbackDistractor {
  label: string;
  outcome: string;
}

const FALLBACK_DISTRACTORS_BY_MODE: Record<FailureMode, FallbackDistractor[]> = {
  'silent-data-corruption': [
    {
      label: 'Add a client-side `try / catch` retry loop with exponential backoff',
      outcome:
        'Retrying without fixing the underlying state boundary replays the same stale mutation and widens the corruption window.',
    },
    {
      label: 'Insert a `setTimeout` delay before committing shared client state',
      outcome:
        'Artificial timing delays shift the race window on fast machines without closing it under slow networks or concurrent tabs.',
    },
  ],
  'main-thread-freeze': [
    {
      label: 'Wrap callbacks in `useCallback` and memoize leaf components',
      outcome:
        'Memoizing props does not eliminate synchronous layout invalidation, forced reflows, or blocking main-thread work per frame.',
    },
    {
      label: 'Defer the handler inside `setTimeout(..., 0)` to yield the call stack',
      outcome:
        'Moving the same synchronous work to the next macrotask still blocks the main thread and stalls input responsiveness.',
    },
  ],
  'memory-exhaustion': [
    {
      label: 'Force periodic cache clears on a 60-second `setInterval`',
      outcome:
        'Clearing application caches does not release retained native roots, detached DOM trees, or over-allocated GPU layers.',
    },
    {
      label: 'Lower the page size limit and rely on V8 minor GC to reclaim buffers',
      outcome:
        'Smaller batches delay the threshold slightly, but strong references and promoted compositor layers still accumulate until the tab crashes.',
    },
  ],
  'cascading-latency': [
    {
      label: 'Increase the HTTP client timeout and add automatic request retries',
      outcome:
        'Longer timeouts and blind retries keep sockets occupied and amplify the request storm instead of removing its trigger.',
    },
    {
      label: 'Cache responses in `localStorage` to skip repeated network calls',
      outcome:
        'Synchronous storage reads block the main thread and do not stop the underlying trigger loop or reconnect storm.',
    },
  ],
  'hydration-desync': [
    {
      label: 'Force a second client render in `useEffect` to overwrite mismatched nodes',
      outcome:
        'A post-mount re-render introduces layout shift and discards user input entered during hydration instead of keeping SSR and CSR identical.',
    },
    {
      label: 'Disable SSR for the entire route and render a loading skeleton',
      outcome:
        'Dropping server rendering hides the mismatch at the cost of delayed First Contentful Paint and degraded crawlability.',
    },
  ],
  'false-positive-ci': [
    {
      label: 'Add `waitFor` polling and increase the test suite timeout',
      outcome:
        'Waiting longer in a simulated DOM cannot surface layout, hit-testing, or compositor bugs that only occur in a real browser engine.',
    },
    {
      label: 'Raise unit test coverage thresholds across component mocks',
      outcome:
        'More assertions against mocked browser APIs validate the mocks rather than actual engine behavior.',
    },
  ],
};

const DEFAULT_FALLBACK_DISTRACTORS: FallbackDistractor[] = [
  {
    label: 'Wrap the failing path in a `setTimeout` retry handler',
    outcome:
      'Masking the symptom with a timer leaves the underlying browser mechanism untouched and fails again under production latency.',
  },
  {
    label: 'Guard the call site with a local boolean flag in component state',
    outcome:
      'Component state updates asynchronously on the next render and does not resolve engine-level scheduling, layout, or storage locks.',
  },
];

const MAX_BAD_FIXES = 3;
const MIN_BAD_FIXES = 2;

/**
 * 32-bit FNV-1a hash used to derive a deterministic PRNG seed from an autopsy slug.
 */
export function hashSlugFnv1a(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic Mulberry32 PRNG returning floats in [0, 1).
 */
function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(items: readonly T[], slug: string): T[] {
  const result = [...items];
  const nextRand = createMulberry32(hashSlugFnv1a(slug));
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Builds 3 to 4 diagnostic hypotheses for DevTools Detective from an autopsy's case file.
 * Combines 2 to 3 distractors (from `case_file.bad_fixes`, topped up with failure-mode
 * distractors when an autopsy lists fewer than 2 bad fixes) plus `case_file.root_cause`,
 * shuffled deterministically from `slug` to guarantee SSR/client hydration parity.
 */
export function buildDetectiveOptions(
  slug: string,
  caseFile: { root_cause: string; bad_fixes: ReadonlyArray<{ label: string; outcome: string }> },
  failureMode?: FailureMode
): DetectiveOption[] {
  const seenLabels = new Set<string>([normalizeLabel(caseFile.root_cause)]);
  const distractors: DetectiveOption[] = [];

  for (let i = 0; i < caseFile.bad_fixes.length && distractors.length < MAX_BAD_FIXES; i += 1) {
    const badFix = caseFile.bad_fixes[i];
    const normalized = normalizeLabel(badFix.label);
    if (!normalized || seenLabels.has(normalized)) continue;
    seenLabels.add(normalized);
    distractors.push({
      id: `bad-fix-${i}`,
      label: badFix.label.trim(),
      isRootCause: false,
      outcome: badFix.outcome.trim(),
    });
  }

  if (distractors.length < MIN_BAD_FIXES) {
    const pool = failureMode
      ? [...FALLBACK_DISTRACTORS_BY_MODE[failureMode], ...DEFAULT_FALLBACK_DISTRACTORS]
      : DEFAULT_FALLBACK_DISTRACTORS;

    let fallbackIdx = 0;
    for (const candidate of pool) {
      if (distractors.length >= MIN_BAD_FIXES) break;
      const normalized = normalizeLabel(candidate.label);
      if (seenLabels.has(normalized)) continue;
      seenLabels.add(normalized);
      distractors.push({
        id: `distractor-${fallbackIdx}`,
        label: candidate.label,
        isRootCause: false,
        outcome: candidate.outcome,
      });
      fallbackIdx += 1;
    }
  }

  const rootCauseOption: DetectiveOption = {
    id: 'root-cause',
    label: caseFile.root_cause.trim(),
    isRootCause: true,
  };

  return deterministicShuffle([rootCauseOption, ...distractors], slug);
}
