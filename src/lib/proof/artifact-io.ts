import fs from 'node:fs';
import path from 'node:path';
import { ProofArtifactSchema, type ProofArtifact } from './artifact-schema';

/** Validates, creates parent directories, and writes 2-space indented JSON with a trailing newline. */
export function writeProofArtifact(artifact: ProofArtifact, outPath: string): void {
  const parsed = ProofArtifactSchema.parse(artifact);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + '\n');
}

/** Reads and validates a proof artifact from disk, including the file path in any error. */
export function readProofArtifact(filePath: string): ProofArtifact {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const result = ProofArtifactSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid proof artifact ${filePath}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  return result.data;
}
