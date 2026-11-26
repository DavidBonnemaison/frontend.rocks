import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR, SITE_ROOT } from '../../src/lib/paths';
import {
  GeometrySnapshotSchema,
  SchematicSpecSchema,
  type GeometrySnapshot,
  type SchematicSpec,
} from '../../src/lib/design/schematic-snapshot';
import { encodeParams, startTestServer } from '../proof/test-server';

const EXPERIMENTS_DIR = path.join(CONTENT_DIR, 'experiments');
const SCHEMATICS_DIR = path.join(CONTENT_DIR, 'schematics');
const PROOF_BUILD_DIR = path.join(SITE_ROOT, '.proof-build', 'experiments');

interface DeclaredSchematic {
  experimentId: string;
  spec: SchematicSpec;
  sourceHash: string;
}

function computeExperimentSourceHash(experimentId: string): string {
  const bundlePath = path.join(PROOF_BUILD_DIR, `${experimentId}.json`);
  const expPath = path.join(EXPERIMENTS_DIR, experimentId, 'experiment.ts');
  if (fs.existsSync(expPath)) {
    return crypto.createHash('sha256').update(fs.readFileSync(expPath, 'utf-8')).digest('hex');
  }
  if (fs.existsSync(bundlePath)) {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as { sourceHash: string };
    return bundle.sourceHash;
  }
  throw new Error(`Missing experiment.ts for "${experimentId}"`);
}

function discoverDeclaredSchematics(): DeclaredSchematic[] {
  if (!fs.existsSync(EXPERIMENTS_DIR)) return [];
  const dirs = fs
    .readdirSync(EXPERIMENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const out: DeclaredSchematic[] = [];
  for (const experimentId of dirs) {
    const specPath = path.join(EXPERIMENTS_DIR, experimentId, 'schematic.json');
    if (!fs.existsSync(specPath)) continue;
    const raw = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as unknown;
    const spec = SchematicSpecSchema.parse(raw);
    const sourceHash = computeExperimentSourceHash(experimentId);
    out.push({ experimentId, spec, sourceHash });
  }
  return out;
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function runCheck(): void {
  const declared = discoverDeclaredSchematics();
  const expectedIds = new Set<string>();
  const errors: string[] = [];

  for (const entry of declared) {
    for (const snap of entry.spec.snapshots) {
      if (expectedIds.has(snap.id)) {
        errors.push(`Duplicate schematic snapshot id "${snap.id}"`);
        continue;
      }
      expectedIds.add(snap.id);
      const outPath = path.join(SCHEMATICS_DIR, `${snap.id}.json`);
      if (!fs.existsSync(outPath)) {
        errors.push(`Schematic "${snap.id}" is missing: run npm run design:snapshots`);
        continue;
      }
      let existing: GeometrySnapshot;
      try {
        existing = GeometrySnapshotSchema.parse(JSON.parse(fs.readFileSync(outPath, 'utf-8')));
      } catch (err) {
        errors.push(
          `Schematic "${snap.id}" is invalid (${err instanceof Error ? err.message : String(err)}): run npm run design:snapshots`
        );
        continue;
      }
      if (existing.sourceHash !== entry.sourceHash) {
        errors.push(`Schematic "${snap.id}" is stale: run npm run design:snapshots`);
      }
    }
  }

  if (fs.existsSync(SCHEMATICS_DIR)) {
    const files = fs
      .readdirSync(SCHEMATICS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      if (!expectedIds.has(id)) {
        errors.push(`Orphan schematic file "content/schematics/${file}" has no schematic.json declaration`);
      }
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log(`Schematics check passed (${expectedIds.size} snapshot(s) up to date).`);
}

async function runCapture(): Promise<void> {
  const declared = discoverDeclaredSchematics();
  if (declared.length === 0) {
    console.log('No schematic.json files found.');
    return;
  }

  // Ensure experiment bundles exist before starting test server
  const missingBundle = declared.some(
    (d) => !fs.existsSync(path.join(PROOF_BUILD_DIR, `${d.experimentId}.json`))
  );
  if (missingBundle) {
    execSync('npm run proof:build', { cwd: SITE_ROOT, stdio: 'inherit' });
  }

  fs.mkdirSync(SCHEMATICS_DIR, { recursive: true });
  const server = await startTestServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const engineVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    for (const entry of declared) {
      const bundlePath = path.join(PROOF_BUILD_DIR, `${entry.experimentId}.json`);
      const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as {
        sourceHash: string;
        viewport?: { width: number; height: number };
      };
      const viewport = bundle.viewport ?? { width: 1280, height: 800 };
      await page.setViewportSize(viewport);

      for (const snapSpec of entry.spec.snapshots) {
        const paramsQuery = encodeParams(snapSpec.params);
        const url = `${server.selfOrigin}/__exp/${entry.experimentId}/${snapSpec.variant}?params=${paramsQuery}`;
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => Boolean((window as unknown as { __frResult?: unknown }).__frResult), {
          timeout: 10_000,
        });

        const measuredBoxes: GeometrySnapshot['boxes'] = [];
        const boxByKey = new Map<string, GeometrySnapshot['boxes'][number]>();

        for (const boxSpec of snapSpec.boxes) {
          const rect = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }, boxSpec.selector);

          if (!rect) {
            throw new Error(
              `Snapshot "${snapSpec.id}" (${entry.experimentId}): selector "${boxSpec.selector}" not found`
            );
          }

          const box: GeometrySnapshot['boxes'][number] = {
            key: boxSpec.key,
            label: boxSpec.label,
            x: roundHalf(rect.x),
            y: roundHalf(rect.y),
            w: roundHalf(rect.w),
            h: roundHalf(rect.h),
            ...(boxSpec.dashed ? { dashed: true } : {}),
            ...(boxSpec.highlight ? { highlight: true } : {}),
          };
          measuredBoxes.push(box);
          boxByKey.set(box.key, box);
        }

        const measuredDimensions: GeometrySnapshot['dimensions'] = [];
        for (const dimSpec of snapSpec.dimensions) {
          const fromBox = boxByKey.get(dimSpec.fromKey);
          const toBox = boxByKey.get(dimSpec.toKey);
          if (!fromBox || !toBox) {
            throw new Error(
              `Snapshot "${snapSpec.id}": dimension references unknown box key "${dimSpec.fromKey}" -> "${dimSpec.toKey}"`
            );
          }
          if (dimSpec.axis === 'x') {
            measuredDimensions.push({
              from: [fromBox.x, fromBox.y],
              to: [roundHalf(toBox.x + toBox.w), fromBox.y],
              label: dimSpec.label,
            });
          } else {
            measuredDimensions.push({
              from: [fromBox.x, fromBox.y],
              to: [fromBox.x, roundHalf(toBox.y + toBox.h)],
              label: dimSpec.label,
            });
          }
        }

        const snapshot: GeometrySnapshot = GeometrySnapshotSchema.parse({
          id: snapSpec.id,
          source: {
            experimentId: entry.experimentId,
            variant: snapSpec.variant,
            params: snapSpec.params,
          },
          engine: {
            name: 'chromium',
            version: engineVersion,
          },
          viewport,
          boxes: measuredBoxes,
          dimensions: measuredDimensions,
          caption: `${snapSpec.caption} · Measured in Chromium ${engineVersion}`,
          sourceHash: bundle.sourceHash,
        });

        const outPath = path.join(SCHEMATICS_DIR, `${snapshot.id}.json`);
        fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
        console.log(`Captured content/schematics/${snapshot.id}.json`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), { check: 'boolean' });
  if (args.check) {
    runCheck();
  } else {
    await runCapture();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
