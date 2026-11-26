import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '@/lib/paths';
import { GeometrySnapshotSchema, type GeometrySnapshot } from './schematic-snapshot';

const SCHEMATICS_DIR = path.join(CONTENT_DIR, 'schematics');

export function getSnapshot(id: string): GeometrySnapshot | null {
  const filePath = path.join(SCHEMATICS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  return GeometrySnapshotSchema.parse(raw);
}

export function getSnapshotsForExperiment(experimentId: string): GeometrySnapshot[] {
  if (!fs.existsSync(SCHEMATICS_DIR)) return [];
  const files = fs
    .readdirSync(SCHEMATICS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const out: GeometrySnapshot[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SCHEMATICS_DIR, file), 'utf-8')) as unknown;
    const snap = GeometrySnapshotSchema.parse(raw);
    if (snap.source.experimentId === experimentId) {
      out.push(snap);
    }
  }
  return out;
}
