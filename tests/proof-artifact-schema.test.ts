import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProofArtifact, writeProofArtifact } from '@/lib/proof/artifact-io';
import {
  ARTIFACT_KINDS,
  ProofArtifactSchema,
  type ArtifactKind,
  type ProofArtifact,
} from '@/lib/proof/artifact-schema';

function makeArtifact(kind: ArtifactKind): ProofArtifact {
  return {
    schemaVersion: 1,
    kind,
    generatedAt: '2026-11-25T09:00:00Z',
    mode: 'offline',
    tooling: { verifier: '1.0.0' },
    claims: {
      'css-container-queries/size-containment': {
        claimId: 'css-container-queries/size-containment',
        status: 'proven',
        reason: null,
        message: null,
        details: { sectionSha256: 'abc123' },
        checkedAt: '2026-11-25T09:00:00Z',
      },
    },
    pages: {
      'css-container-queries': {
        pageId: 'css-container-queries',
        status: 'pass',
        enforced: false,
        violations: [],
        stats: { totalSentences: 10 },
        foreignClaimIds: [],
      },
    },
  };
}

describe('proof artifact schema and IO', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-artifact-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('validates a valid artifact for every artifact kind', () => {
    for (const kind of ARTIFACT_KINDS) {
      const res = ProofArtifactSchema.safeParse(makeArtifact(kind));
      expect(res.success).toBe(true);
    }
  });

  it('rejects status "pending" in claims (reserved for the runner)', () => {
    const artifact = makeArtifact('spec-quotes');
    const invalid = {
      ...artifact,
      claims: {
        'css-container-queries/size-containment': {
          ...artifact.claims['css-container-queries/size-containment'],
          status: 'pending',
        },
      },
    };
    expect(ProofArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it('round-trips through writeProofArtifact and readProofArtifact', () => {
    const dir = makeTempDir();
    const outPath = path.join(dir, 'nested', 'spec-quotes.json');
    const artifact = makeArtifact('spec-quotes');

    writeProofArtifact(artifact, outPath);
    expect(fs.existsSync(outPath)).toBe(true);

    const loaded = readProofArtifact(outPath);
    expect(loaded).toEqual(artifact);
  });

  it('throws and writes nothing when writeProofArtifact receives an invalid artifact', () => {
    const dir = makeTempDir();
    const outPath = path.join(dir, 'never-written', 'bad.json');
    const invalid = { ...makeArtifact('support'), schemaVersion: 2 } as unknown as ProofArtifact;

    expect(() => writeProofArtifact(invalid, outPath)).toThrow();
    expect(fs.existsSync(outPath)).toBe(false);
    expect(fs.existsSync(path.dirname(outPath))).toBe(false);
  });

  it('throws with file path when readProofArtifact reads an invalid file', () => {
    const dir = makeTempDir();
    const badPath = path.join(dir, 'invalid.json');
    fs.writeFileSync(badPath, JSON.stringify({ schemaVersion: 1, kind: 'unknown' }));

    expect(() => readProofArtifact(badPath)).toThrow(new RegExp(`Invalid proof artifact ${badPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
});
