import fs from 'node:fs';
import path from 'node:path';
import {
  ExperimentBundleSchema,
  type ExperimentBundle,
  type ExperimentBundleIndexEntry,
} from './experiment-schema';
import { ExperimentViewSchema, type ExperimentView } from './view-schema';
import { CONTENT_DIR, SITE_ROOT } from '../paths';

export type LoadedExperimentBundle = ExperimentBundle & { view: ExperimentView | null };

/** FR_PROOF_BUILD_DIR overrides the default directory (tests and self-tests). Read on each call. */
export function experimentBuildDir(): string {
  return process.env.FR_PROOF_BUILD_DIR ?? path.join(SITE_ROOT, '.proof-build', 'experiments');
}

/** Reads optional `content/experiments/<id>/view.json`. Returns null when absent. */
export function loadExperimentView(id: string): ExperimentView | null {
  const viewFile = path.join(CONTENT_DIR, 'experiments', id, 'view.json');
  if (!fs.existsSync(viewFile)) return null;
  return ExperimentViewSchema.parse(JSON.parse(fs.readFileSync(viewFile, 'utf-8')));
}

export function loadExperimentBundle(id: string): LoadedExperimentBundle {
  const file = path.join(experimentBuildDir(), `${id}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing experiment bundle "${id}". Run "npm run proof:build" first.`);
  }
  const bundle = ExperimentBundleSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  return { ...bundle, view: loadExperimentView(id) };
}

export function loadExperimentIndex(): ExperimentBundleIndexEntry[] {
  const file = path.join(experimentBuildDir(), 'index.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as ExperimentBundleIndexEntry[];
}
