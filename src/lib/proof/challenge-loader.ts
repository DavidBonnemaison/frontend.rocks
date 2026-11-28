import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '../paths';
import { ChallengeSchema, type Challenge } from './challenge-schema';

/** Reads optional `content/experiments/<id>/challenge.json`. Returns null when absent. */
export function loadChallenge(id: string): Challenge | null {
  const file = path.join(CONTENT_DIR, 'experiments', id, 'challenge.json');
  if (!fs.existsSync(file)) return null;
  return ChallengeSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
}
