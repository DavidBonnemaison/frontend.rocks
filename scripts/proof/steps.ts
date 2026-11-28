export interface ProofStep {
  name: string;
  script: string;
  args?: string[];
  passThroughRunnerArgs?: boolean;
  optional?: boolean;
  verifier?: boolean;
  artifact?: string;
  check?: boolean;
}

export const PROOF_STEPS: ProofStep[] = [
  { name: 'build-experiments', script: 'scripts/proof/build-experiments.ts' },
  { name: 'build-vendor', script: 'scripts/proof/build-vendor.ts' },
  { name: 'build-harness', script: 'scripts/proof/build-harness.ts' },
  {
    name: 'build-lab-dev',
    script: 'scripts/proof/build-lab-site.ts',
    args: ['--dev'],
    optional: true,
  },
  {
    name: 'run',
    script: 'scripts/proof/run-experiments.ts',
    passThroughRunnerArgs: true,
    artifact: 'experiments.json',
  },
  {
    name: 'verify-specs',
    script: 'scripts/proof/verify-spec-quotes.ts',
    optional: true,
    verifier: true,
    artifact: 'spec-quotes.json',
  },
  {
    name: 'verify-sources',
    script: 'scripts/proof/verify-source-quotes.ts',
    optional: true,
    verifier: true,
    artifact: 'source-quotes.json',
  },
  {
    name: 'support',
    script: 'scripts/proof/check-support.ts',
    optional: true,
    verifier: true,
    artifact: 'support.json',
  },
  {
    name: 'coverage',
    script: 'scripts/proof/check-coverage.ts',
    optional: true,
    verifier: true,
    artifact: 'coverage.json',
  },
  { name: 'aggregate', script: 'scripts/proof/aggregate-results.ts' },
  {
    name: 'observations',
    script: 'scripts/proof/check-observations.ts',
    optional: true,
    check: true,
  },
  {
    name: 'recorded-results',
    script: 'scripts/proof/check-recorded-results.ts',
    optional: true,
    check: true,
  },
  {
    name: 'challenges',
    script: 'scripts/proof/check-challenges.ts',
    optional: true,
    check: true,
  },
  {
    name: 'symptom-signatures',
    script: 'scripts/proof/check-symptom-signatures.ts',
    optional: true,
    check: true,
  },
  { name: 'gate', script: 'scripts/proof/gate.ts' },
];
