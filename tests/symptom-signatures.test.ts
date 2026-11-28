import { describe, expect, it } from 'vitest';
import type { Claim } from '@/lib/proof/claim-schema';
import type { ExperimentDefinition } from '@/lib/proof/define-experiment';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';
import type { LoadedSymptom } from '@/lib/symptoms/loader';
import { checkSymptomSignatures } from '../scripts/proof/check-symptom-signatures';

function makeSymptom(
  id: string,
  signatures: LoadedSymptom['frontmatter']['signatures'],
  proofStatus: 'proven' | 'unverified' = 'proven'
): LoadedSymptom {
  return {
    frontmatter: {
      id,
      title: 'A production symptom title long enough',
      featured: false,
      summary: 'A production symptom summary long enough for schema validation.',
      summary_claims: [`${id}/sig-claim`],
      signatures,
      keywords: [],
      concept_ids: ['css-stacking-context'],
      autopsy_ids: [],
      proof_status: proofStatus,
    },
    body: '## What you see\n',
    filePath: `content/symptoms/${id}.mdx`,
  };
}

function makeConsoleExperiment(
  id: string,
  expectMap: Record<string, string>
): ExperimentDefinition {
  const expectObj: ExperimentDefinition['expect'] = {};
  for (const [key, message] of Object.entries(expectMap)) {
    expectObj[key] = { treatment: { message }, control: { message: null } };
  }
  return {
    id,
    title: 'Console experiment',
    question: 'What does the engine log?',
    kind: 'console',
    fixture: { html: '<div/>' },
    variants: { treatment: { label: 'As shipped' }, control: { label: 'With the fix' } },
    mutation: { variant: 'treatment', remove: 'x' },
    observe: () => ({ message: null }),
    expect: expectObj,
  };
}

describe('checkSymptomSignatures (US-35.6)', () => {
  it('accepts a valid console signature and rejects a mismatched message or engine set', () => {
    const exp = makeConsoleExperiment('console-chunk-err', {
      'message-chromium': 'TypeError: Failed to fetch dynamically imported module',
      'message-firefox': 'TypeError: error loading dynamically imported module',
    });

    const claims = new Map<string, Claim>([
      [
        'chunk-err/cr',
        {
          id: 'chunk-err/cr',
          type: 'observable',
          statement: 'Chromium rejects dynamic import with a TypeError message.',
          scope: { engines: ['chromium'] },
          proof: { kind: 'experiment', experimentId: exp.id, expectKeys: ['message-chromium'] },
        },
      ],
      [
        'chunk-err/ff',
        {
          id: 'chunk-err/ff',
          type: 'observable',
          statement: 'Firefox rejects dynamic import with its own TypeError message.',
          scope: { engines: ['firefox'] },
          proof: { kind: 'experiment', experimentId: exp.id, expectKeys: ['message-firefox'] },
        },
      ],
    ]);

    const results: ProofResults = {
      ...emptyProofResults(),
      experiments: {
        [exp.id]: {
          'message-chromium': {
            chromium: { status: 'pass', observed: { treatment: { message: 'TypeError: Failed to fetch dynamically imported module' }, control: { message: null } }, presented: null, error: null },
            firefox: { status: 'fail', observed: { treatment: { message: 'other' }, control: { message: null } }, presented: null, error: null },
          },
          'message-firefox': {
            firefox: { status: 'pass', observed: { treatment: { message: 'TypeError: error loading dynamically imported module' }, control: { message: null } }, presented: null, error: null },
          },
        },
      },
    };

    // Valid: distinct message per engine
    const ok = checkSymptomSignatures({
      symptoms: [
        makeSymptom('chunk-err', [
          { kind: 'console', text: 'TypeError: Failed to fetch dynamically imported module', claim: 'cr', engines: ['chromium'] },
          { kind: 'console', text: 'TypeError: error loading dynamically imported module', claim: 'ff', engines: ['firefox'] },
        ]),
      ],
      claimsById: claims,
      results,
      loadExperiment: () => exp,
    });
    expect(ok.violations).toEqual([]);

    // Rejected: text mismatch + wrong engine declared
    const bad = checkSymptomSignatures({
      symptoms: [
        makeSymptom('chunk-err', [
          { kind: 'console', text: 'Invented console message', claim: 'cr', engines: ['chromium', 'firefox'] },
        ]),
      ],
      claimsById: claims,
      results,
      loadExperiment: () => exp,
    });
    expect(bad.violations.some((v) => v.includes('does not match'))).toBe(true);
    expect(bad.violations.some((v) => v.includes('declares engine "firefox"'))).toBe(true);
  });

  it('reports not-yet-checked console experiments without failing', () => {
    const exp = makeConsoleExperiment('console-fresh', {
      'message-all': 'TypeError: Cannot read properties of null',
    });
    const claims = new Map<string, Claim>([
      [
        'fresh/c',
        {
          id: 'fresh/c',
          type: 'observable',
          statement: 'Dereferencing null throws a TypeError in the console.',
          proof: { kind: 'experiment', experimentId: exp.id, expectKeys: ['message-all'] },
        },
      ],
    ]);

    const res = checkSymptomSignatures({
      symptoms: [
        makeSymptom('fresh', [
          { kind: 'console', text: 'TypeError: Cannot read properties of null', claim: 'c', engines: ['chromium'] },
        ]),
      ],
      claimsById: claims,
      results: emptyProofResults(),
      loadExperiment: () => exp,
    });
    expect(res.violations).toEqual([]);
    expect(res.notYetChecked).toHaveLength(1);
  });

  it('accepts a DevTools UI template with {PH1} from devtools-frontend and rejects non-matching quotes or engines', () => {
    const claims = new Map<string, Claim>([
      [
        'reflow/dt',
        {
          id: 'reflow/dt',
          type: 'implementation',
          statement: 'DevTools reports forced reflow duration using a localized template.',
          proof: {
            kind: 'source-quote',
            repo: 'ChromeDevTools/devtools-frontend',
            commit: 'b'.repeat(40),
            path: 'front_end/models/issues_manager/ForcedReflow.ts',
            lines: [12, 16],
            quote: 'Forced reflow while executing JavaScript took {PH1}ms',
          },
        },
      ],
    ]);

    const ok = checkSymptomSignatures({
      symptoms: [
        makeSymptom('reflow', [
          {
            kind: 'devtools-ui',
            text: 'Forced reflow while executing JavaScript took {PH1}ms',
            claim: 'dt',
            engines: ['chromium'],
          },
        ]),
      ],
      claimsById: claims,
      results: emptyProofResults(),
    });
    expect(ok.violations).toEqual([]);

    const bad = checkSymptomSignatures({
      symptoms: [
        makeSymptom('reflow', [
          {
            kind: 'devtools-ui',
            text: 'Forced reflow took 180ms',
            claim: 'dt',
            engines: ['chromium', 'firefox'],
          },
        ]),
      ],
      claimsById: claims,
      results: emptyProofResults(),
    });
    expect(bad.violations.some((v) => v.includes('exact substring'))).toBe(true);
    expect(bad.violations.some((v) => v.includes('engines: ["chromium"]'))).toBe(true);
  });

  it('accepts qualitative metric signatures and normative-backed numbers, and rejects invented thresholds', () => {
    const claims = new Map<string, Claim>([
      [
        'inp/m',
        {
          id: 'inp/m',
          type: 'observable',
          statement: 'A synchronous loop delays the next animation frame.',
          proof: { kind: 'experiment', experimentId: 'repro-inp', expectKeys: ['bug-reproduces'] },
        },
      ],
      [
        'inp/long-task-spec',
        {
          id: 'inp/long-task-spec',
          type: 'normative',
          statement: 'The Long Tasks spec defines a long task as exceeding 50 ms.',
          proof: {
            kind: 'spec-quote',
            url: 'https://w3c.github.io/longtasks/',
            anchor: 'long-task',
            quote: 'A long task is any task whose duration exceeds 50 ms on the main thread.',
          },
        },
      ],
    ]);

    const ok = checkSymptomSignatures({
      symptoms: [
        makeSymptom('inp', [
          { kind: 'metric', text: 'Main thread stalls during click handler', claim: 'm', engines: ['chromium'] },
          { kind: 'metric', text: 'Long task exceeding 50 ms blocks input', claim: 'm', engines: ['chromium'] },
        ]),
      ],
      claimsById: claims,
      results: emptyProofResults(),
    });
    expect(ok.violations).toEqual([]);

    const bad = checkSymptomSignatures({
      symptoms: [
        makeSymptom('inp', [
          { kind: 'metric', text: 'DevTools Layers panel > 400 MB GPU memory', claim: 'm', engines: ['chromium'] },
          { kind: 'metric', text: 'Frame paint takes 35 ms on scroll', claim: 'm', engines: ['chromium'] },
        ]),
      ],
      claimsById: claims,
      results: emptyProofResults(),
    });
    expect(bad.violations).toHaveLength(2);
  });
});
