import { UNANCHORED, type Claim, type ClaimsFile } from '../proof/claim-schema';
import type { PageIdCollision, PageRef } from '../proof/page-registry';

export interface ClaimsValidationInput {
  claimsFiles: ClaimsFile[];
  pages: PageRef[];
  collisions: PageIdCollision[];
  /** Directory ids present under content/experiments/ (empty if the directory does not exist). */
  experimentIds: Set<string>;
}

export interface ClaimsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: { files: number; claims: number; byType: Record<string, number> };
}

export function validateClaimsCorpus(input: ClaimsValidationInput): ClaimsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pageById = new Map(input.pages.map((p) => [p.id, p]));
  const claimsFileIds = new Set(input.claimsFiles.map((f) => f.pageId));

  // 0. Page ids shared across multiple content types.
  for (const c of input.collisions) {
    const blocking =
      claimsFileIds.has(c.id) || input.pages.some((p) => p.id === c.id && p.proofStatus === 'proven');
    const msg = `[pages] page id "${c.id}" is used by several content types: ${c.kinds.join(', ')}`;
    (blocking ? errors : warnings).push(msg);
  }
  const claimById = new Map<string, Claim>();
  const byType: Record<string, number> = {};

  // 1. Each file matches an existing page; claim ids are globally unique.
  for (const file of input.claimsFiles) {
    if (!pageById.has(file.pageId)) {
      errors.push(`[claims/${file.pageId}.claims.json] orphan claims file: no page with id "${file.pageId}"`);
    }
    for (const claim of file.claims) {
      if (claimById.has(claim.id)) {
        errors.push(`[claims/${file.pageId}.claims.json] duplicate claim id "${claim.id}" across files`);
      }
      claimById.set(claim.id, claim);
      byType[claim.type] = (byType[claim.type] ?? 0) + 1;
    }
  }

  // 2. References: derived.from and experimentId.
  for (const claim of claimById.values()) {
    const label = `[claim ${claim.id}]`;
    if (claim.proof.kind === 'derived') {
      for (const ref of claim.proof.from) {
        if (!claimById.has(ref)) errors.push(`${label} derived.from references unknown claim "${ref}"`);
      }
    }
    if (claim.proof.kind === 'experiment' && !input.experimentIds.has(claim.proof.experimentId)) {
      errors.push(
        `${label} references missing experiment "content/experiments/${claim.proof.experimentId}/experiment.ts"`
      );
    }
  }

  // 3. No cycle among derived claims.
  for (const cycle of findDerivedCycles(claimById)) {
    errors.push(`[claims] derived cycle: ${cycle.join(' -> ')}`);
  }

  // 4. Proven pages: claims file required (except changelog entries), no sentinel anchor.
  const filesByPage = new Map(input.claimsFiles.map((f) => [f.pageId, f]));
  for (const page of input.pages) {
    if (page.proofStatus !== 'proven' || page.kind === 'changelog') continue;
    const file = filesByPage.get(page.id);
    if (!file) {
      errors.push(
        `[${page.kind} ${page.id}] proof_status is "proven" but content/claims/${page.id}.claims.json is missing`
      );
      continue;
    }
    for (const claim of file.claims) {
      if (claim.proof.kind === 'spec-quote' && claim.proof.anchor === UNANCHORED) {
        errors.push(`[${page.kind} ${page.id}] proven page has unanchored spec quote "${claim.id}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { files: input.claimsFiles.length, claims: claimById.size, byType },
  };
}

/** Three-color DFS. Returns each cycle as a list of ids (first id repeated at the end). */
export function findDerivedCycles(claims: Map<string, Claim>): string[][] {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const stack: string[] = [];

  const edges = (id: string): string[] => {
    const c = claims.get(id);
    return c && c.proof.kind === 'derived' ? c.proof.from.filter((r) => claims.has(r)) : [];
  };

  const visit = (id: string): void => {
    color.set(id, GREY);
    stack.push(id);
    for (const next of edges(id)) {
      const state = color.get(next) ?? WHITE;
      if (state === GREY) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start), next]);
      } else if (state === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of [...claims.keys()].sort()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
  return cycles;
}
