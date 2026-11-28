import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '../../src/lib/paths';
import { ENGINE_IDS, type Claim, type EngineId } from '../../src/lib/proof/claim-schema';
import { getAllClaims } from '../../src/lib/proof/claims-loader';
import { readCheckResults } from '../../src/lib/proof/check-results';
import { toClaimId } from '../../src/lib/proof/coverage/claim-refs';
import type { ExperimentDefinition } from '../../src/lib/proof/define-experiment';
import type { ProofResults } from '../../src/lib/proof/results-schema';
import { getAllSymptoms, type LoadedSymptom } from '../../src/lib/symptoms/loader';

const METRIC_THRESHOLD_RE = />\s*\d/;
const METRIC_NUMBER_UNIT_RE = /(\d+(?:\.\d+)?)\s*(ms|s|MB|KB|fps|%)(?![A-Za-z])/g;

export interface SignatureCheckOutcome {
  violations: string[];
  notYetChecked: string[];
}

export interface CheckSymptomSignaturesOptions {
  symptoms?: LoadedSymptom[];
  claimsById?: ReadonlyMap<string, Claim>;
  results?: ProofResults;
  loadExperiment?: (experimentId: string) => ExperimentDefinition | null;
}

function defaultLoadExperiment(experimentId: string): ExperimentDefinition | null {
  const filePath = path.join(CONTENT_DIR, 'experiments', experimentId, 'experiment.ts');
  if (!fs.existsSync(filePath)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(filePath) as { default?: ExperimentDefinition };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

function numbersInNormativeClaimsForPage(
  pageId: string,
  claimsById: ReadonlyMap<string, Claim>
): Set<string> {
  const allowed = new Set<string>();
  const prefix = `${pageId}/`;
  for (const [id, claim] of claimsById) {
    if (!id.startsWith(prefix)) continue;
    if (claim.type === 'normative' && claim.proof.kind === 'spec-quote') {
      for (const m of claim.proof.quote.matchAll(/\d+(?:\.\d+)?/g)) {
        allowed.add(m[0]);
      }
    }
  }
  return allowed;
}

/**
 * Verifies every signature on every `proven` symptom (EPIC-35 §4.7).
 */
export function checkSymptomSignatures(
  opts: CheckSymptomSignaturesOptions = {}
): SignatureCheckOutcome {
  const symptoms = opts.symptoms ?? getAllSymptoms();
  const claimsById =
    opts.claimsById ?? new Map<string, Claim>(getAllClaims().map((c) => [c.id, c]));
  const results = opts.results ?? readCheckResults();
  const loadExperiment = opts.loadExperiment ?? defaultLoadExperiment;

  const violations: string[] = [];
  const notYetChecked: string[] = [];

  for (const loaded of symptoms) {
    const fm = loaded.frontmatter;
    if (fm.proof_status !== 'proven') continue;

    if (fm.signatures.length === 0) {
      violations.push(`[symptoms/${fm.id}] proven symptom has no signatures`);
      continue;
    }

    const normativeNumbers = numbersInNormativeClaimsForPage(fm.id, claimsById);

    for (const [idx, sig] of fm.signatures.entries()) {
      const label = `[symptoms/${fm.id}] signatures[${idx}] (${sig.kind})`;
      const fullClaimId = toClaimId(fm.id, sig.claim);
      const claim = claimsById.get(fullClaimId);
      if (!claim) {
        violations.push(`${label} references unknown claim "${sig.claim}"`);
        continue;
      }

      if (sig.kind === 'console') {
        if (claim.type !== 'observable' || claim.proof.kind !== 'experiment') {
          violations.push(`${label} must reference an observable claim backed by an experiment`);
          continue;
        }
        const expId = claim.proof.experimentId;
        const expDef = loadExperiment(expId);
        if (!expDef) {
          violations.push(`${label} experiment "${expId}" could not be loaded`);
          continue;
        }
        if (expDef.kind !== 'console') {
          violations.push(`${label} experiment "${expId}" has kind "${expDef.kind}", expected "console"`);
          continue;
        }
        const expectKey = claim.proof.expectKeys[0];
        const expectCase = expDef.expect[expectKey];
        const treatmentObj =
          expectCase && typeof expectCase.treatment === 'object' && expectCase.treatment !== null
            ? (expectCase.treatment as Record<string, unknown>)
            : null;
        const expectedMessage =
          treatmentObj && typeof treatmentObj.message === 'string' ? treatmentObj.message : null;
        if (expectedMessage === null) {
          violations.push(
            `${label} experiment "${expId}" expect["${expectKey}"].treatment.message is missing`
          );
          continue;
        }
        if (sig.text !== expectedMessage) {
          violations.push(
            `${label} text "${sig.text}" does not match expect["${expectKey}"].treatment.message "${expectedMessage}"`
          );
        }

        const expResults = results.experiments[expId]?.[expectKey];
        if (!expResults || Object.keys(expResults).length === 0) {
          notYetChecked.push(`${label} experiment "${expId}" expect "${expectKey}" not yet checked`);
          continue;
        }

        const declared = new Set<EngineId>(sig.engines);
        for (const engine of ENGINE_IDS) {
          const status = expResults[engine]?.status;
          if (declared.has(engine)) {
            if (status !== 'pass') {
              violations.push(
                `${label} declares engine "${engine}" but ${expId}/${expectKey} status is "${status ?? 'missing'}"`
              );
            }
          } else if (status === 'pass') {
            violations.push(
              `${label} omits engine "${engine}" even though ${expId}/${expectKey} passes on "${engine}"`
            );
          }
        }
        continue;
      }

      if (sig.kind === 'devtools-ui') {
        if (
          claim.type !== 'implementation' ||
          claim.proof.kind !== 'source-quote' ||
          claim.proof.repo !== 'ChromeDevTools/devtools-frontend'
        ) {
          violations.push(
            `${label} must reference an implementation claim with a source-quote in ChromeDevTools/devtools-frontend`
          );
          continue;
        }
        if (!claim.proof.quote.includes(sig.text)) {
          violations.push(`${label} text "${sig.text}" is not an exact substring of the verified source quote`);
        }
        if (sig.engines.length !== 1 || sig.engines[0] !== 'chromium') {
          violations.push(
            `${label} must declare engines: ["chromium"] (got [${sig.engines.join(', ')}])`
          );
        }
        continue;
      }

      // kind === 'metric'
      if (claim.type !== 'observable' && claim.type !== 'measured') {
        violations.push(`${label} must reference an observable or measured claim`);
        continue;
      }
      if (METRIC_THRESHOLD_RE.test(sig.text)) {
        violations.push(`${label} contains a numeric threshold ("${sig.text}")`);
        continue;
      }
      for (const m of sig.text.matchAll(METRIC_NUMBER_UNIT_RE)) {
        if (!normativeNumbers.has(m[1])) {
          violations.push(
            `${label} contains "${m[0]}" which is not backed by a normative spec quote on this page`
          );
        }
      }
    }
  }

  return { violations, notYetChecked };
}

async function main(): Promise<void> {
  const { violations, notYetChecked } = checkSymptomSignatures();
  for (const msg of notYetChecked) {
    console.warn(`⚠️  ${msg}`);
  }
  if (violations.length > 0) {
    console.error(`❌ Symptom signature check failed (${violations.length} violation(s)):`);
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log('✅ Symptom signatures check passed.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
