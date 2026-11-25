import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs } from '../../src/lib/cli-args';
import { SITE_ROOT } from '../../src/lib/paths';
import { PROOF_STEPS, type ProofStep } from './steps';

// Override reserved for tests: a module exporting PROOF_STEPS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STEPS: ProofStep[] = process.env.FR_PROOF_STEPS_FILE ? require(path.resolve(process.env.FR_PROOF_STEPS_FILE)).PROOF_STEPS : PROOF_STEPS;

function main(): void {
  const args = parseCliArgs(process.argv.slice(2), {
    'max-age-hours': 'string',
    'all-pages': 'boolean',
    'report-only': 'boolean',
    changed: 'string',
    engines: 'string',
    only: 'string',
    shard: 'string',
  });

  const maxAgeArgs = args['max-age-hours'] ? ['--max-age-hours', args['max-age-hours']] : [];
  const runnerArgs = (['changed', 'engines', 'only', 'shard'] as const).flatMap((k) =>
    args[k] ? [`--${k}`, args[k] as string] : []
  );
  const gateArgs = [
    ...(args['all-pages'] ? ['--all-pages'] : []),
    ...(args['report-only'] ? ['--report-only'] : []),
    ...(args.changed ? ['--changed-base', args.changed] : []),
  ];

  const artifactsDir = path.join(SITE_ROOT, 'artifacts', 'proof');
  fs.rmSync(artifactsDir, { recursive: true, force: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const failures: string[] = [];
  const checkFailures: string[] = [];

  for (const step of STEPS) {
    if (!fs.existsSync(path.join(SITE_ROOT, step.script))) {
      if (step.optional) {
        console.log(`⏭️  ${step.name}: not implemented yet (${step.script})`);
        continue;
      }
      console.error(`❌ ${step.name}: missing ${step.script}`);
      process.exit(2);
    }

    const stepArgs = [
      ...(step.args ?? []),
      ...(step.passThroughRunnerArgs ? runnerArgs : []),
      ...(step.verifier && (step.name === 'verify-specs' || step.name === 'verify-sources')
        ? maxAgeArgs
        : []),
      ...(step.name === 'gate' ? gateArgs : []),
    ];

    console.log(`▶️  ${step.name} ${stepArgs.join(' ')}`.trimEnd());
    const res = spawnSync('npx', ['tsx', step.script, ...stepArgs], {
      stdio: 'inherit',
      cwd: SITE_ROOT,
    });
    const code = res.status ?? 2;
    if (code === 0) continue;

    const producedArtifact = step.artifact && fs.existsSync(path.join(artifactsDir, step.artifact));
    if (code === 1 && producedArtifact) {
      console.log(`⚠️  ${step.name} finished with failures (recorded)`);
      failures.push(step.name);
      continue;
    }
    if (code === 1 && step.check) {
      console.error(`❌ ${step.name} found violations`);
      checkFailures.push(step.name);
      continue;
    }
    if (step.name === 'gate') {
      console.error('❌ proof gate failed');
      process.exit(1);
    }
    console.error(`❌ ${step.name} crashed (exit ${code})`);
    process.exit(2);
  }

  if (checkFailures.length > 0) {
    console.error(`❌ proof:all failed checks: ${checkFailures.join(', ')}`);
    process.exit(1);
  }
  console.log(
    failures.length > 0
      ? `✅ proof:all passed the gate (steps with recorded failures: ${failures.join(', ')})`
      : '✅ proof:all passed'
  );
}

main();
