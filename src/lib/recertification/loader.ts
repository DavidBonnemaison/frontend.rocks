import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from '../paths';
import { RecertSummarySchema, type RecertSummary } from './summary-schema';

export function getRecertSummary(contentDir = CONTENT_DIR): RecertSummary | null {
  const filePath = path.join(contentDir, 'recertification', 'summary.json');
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return RecertSummarySchema.parse(raw);
}
