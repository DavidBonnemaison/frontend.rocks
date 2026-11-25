import fs from 'node:fs';
import path from 'node:path';
import {
  ExperimentBundleSchema,
  type ExperimentBundle,
  type ExperimentBundleIndexEntry,
} from './experiment-schema';
import { SITE_ROOT } from '../paths';

/** FR_PROOF_BUILD_DIR overrides the default directory (tests and self-tests). Read on each call. */
export function experimentBuildDir(): string {
  return process.env.FR_PROOF_BUILD_DIR ?? path.join(SITE_ROOT, '.proof-build', 'experiments');
}

export function loadExperimentBundle(id: string): ExperimentBundle {
  const file = path.join(experimentBuildDir(), `${id}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing experiment bundle "${id}". Run "npm run proof:build" first.`);
  }
  return ExperimentBundleSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

export function loadExperimentIndex(): ExperimentBundleIndexEntry[] {
  const file = path.join(experimentBuildDir(), 'index.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as ExperimentBundleIndexEntry[];
}
