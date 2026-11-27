import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import {
  buildChallengeBundle,
  getReferenceSolution,
  isSuccess,
  validateChallengeAgainstExperiment,
} from '../../src/lib/proof/challenge';
import { loadChallenge } from '../../src/lib/proof/challenge-loader';
import { loadExperimentBundle } from '../../src/lib/proof/experiment-bundles';
import { resolveParams } from '../../src/lib/proof/runtime/compose';
import { runSingleVariantInEngine } from './runner-core';
import { startStaticServer, type StaticServer } from './static-server';
import { startTestServer, type TestServer } from './test-server';

interface ChallengeCheckEntry {
  experimentId: string;
  expectKey: string;
  ok: boolean;
  startFails: boolean;
  solutionPasses: boolean;
  error: string | null;
}

function listChallengeExperimentIds(): string[] {
  const dir = path.join(CONTENT_DIR, 'experiments');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'challenge.json')))
    .map((d) => d.name)
    .sort();
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    out: 'string',
  });
  const outPath = args.out ?? path.join(SITE_ROOT, 'artifacts', 'proof', 'challenges.json');
  const ids = listChallengeExperimentIds();

  if (ids.length === 0) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), challenges: [] }, null, 2) + '\n',
    );
    console.log('✅ Challenges check passed: 0 challenge(s) found.');
    return;
  }

  const harnessDir = path.join(SITE_ROOT, '.proof-build', 'harness');
  if (!fs.existsSync(path.join(harnessDir, 'index.html'))) {
    throw new Error('Missing .proof-build/harness/index.html. Run "npm run proof:build" first.');
  }

  const harnessServer: StaticServer = await startStaticServer(harnessDir, { host: '127.0.0.1' });
  let labServer: StaticServer | null = null;
  let testServer: TestServer | null = null;
  const browser = await chromium.launch({ headless: true });

  const results: ChallengeCheckEntry[] = [];

  try {
    for (const id of ids) {
      const challenge = loadChallenge(id);
      if (!challenge) continue;

      const loaded = loadExperimentBundle(id);
      const { view: _view, ...bundle } = loaded;
      void _view;

      const staticErrors = validateChallengeAgainstExperiment(bundle, challenge);
      if (staticErrors.length > 0) {
        results.push({
          experimentId: id,
          expectKey: challenge.expectKey,
          ok: false,
          startFails: false,
          solutionPasses: false,
          error: staticErrors.join('; '),
        });
        continue;
      }

      if (bundle.host === 'origin' && !labServer) {
        const labDir = path.join(SITE_ROOT, 'dist-lab-dev');
        if (fs.existsSync(labDir)) {
          labServer = await startStaticServer(labDir, { host: '127.0.0.1' });
        }
      }
      if (bundle.network?.mode === 'server' && !testServer) {
        testServer = await startTestServer();
      }

      const params = resolveParams(bundle, bundle.expect[challenge.expectKey]?.params);

      // (a) Starting variant unchanged must NOT satisfy target
      const startRun = await runSingleVariantInEngine(
        {
          browser,
          engine: 'chromium',
          bundle,
          harnessOrigin: harnessServer.origin,
          labOrigin: labServer?.origin ?? null,
          testServer,
          timeoutMs: 15_000,
        },
        challenge.startFrom,
        params,
        challenge.expectKey,
      );

      const startFails = startRun.ok ? !isSuccess(bundle, challenge, startRun.value) : false;

      // (b) Reference solution applied to startFrom MUST satisfy target
      const solutionCode = getReferenceSolution(bundle, challenge);
      const solvedBundle = buildChallengeBundle(bundle, challenge, solutionCode);
      const solvedRun = await runSingleVariantInEngine(
        {
          browser,
          engine: 'chromium',
          bundle: solvedBundle,
          harnessOrigin: harnessServer.origin,
          labOrigin: labServer?.origin ?? null,
          testServer,
          timeoutMs: 15_000,
        },
        challenge.startFrom,
        params,
        challenge.expectKey,
      );

      const solutionPasses = solvedRun.ok ? isSuccess(bundle, challenge, solvedRun.value) : false;
      const ok = startFails && solutionPasses;

      let error: string | null = null;
      if (!startRun.ok) error = `start variant error: ${startRun.error}`;
      else if (!startFails) error = 'starting variant already satisfies target expectation';
      else if (!solvedRun.ok) error = `reference solution error: ${solvedRun.error}`;
      else if (!solutionPasses) error = 'reference solution did not produce target expectation';

      results.push({
        experimentId: id,
        expectKey: challenge.expectKey,
        ok,
        startFails,
        solutionPasses,
        error,
      });

      if (ok) {
        console.log(`✅ challenge ${id} (${challenge.expectKey})`);
      } else {
        console.error(`❌ challenge ${id} (${challenge.expectKey}): ${error}`);
      }
    }
  } finally {
    await browser.close();
    await harnessServer.close();
    if (labServer) await labServer.close();
    if (testServer) await testServer.close();
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        challenges: results,
      },
      null,
      2,
    ) + '\n',
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`❌ Challenges check failed: ${failed.length}/${results.length} failed.`);
    process.exit(1);
  }
  console.log(`✅ Challenges check passed: ${results.length}/${results.length} challenge(s) verified.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
