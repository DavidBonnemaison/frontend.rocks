import path from 'node:path';
import { getAllAutopsies, getAllConcepts } from '../content-loader';
import { SITE_ROOT } from '../paths';
import { getAllSymptoms } from '../symptoms/loader';
import { extractVsPairs } from '../vs-pairs';
import type { PageProofStatus } from './claim-schema';

export const PAGE_KINDS = ['concept', 'autopsy', 'symptom', 'vs', 'deep-dive', 'myth', 'changelog'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export interface PageRef {
  id: string;
  kind: PageKind;
  proofStatus: PageProofStatus;
  /** Relative path of the MDX source file, or null for pages defined in TypeScript. */
  mdxPath: string | null;
}

const rel = (p: string) => path.relative(SITE_ROOT, p);

/** One provider per page kind. Future page kinds replace their null entry here. */
export const PAGE_REF_PROVIDERS: Record<PageKind, (() => PageRef[]) | null> = {
  concept: () =>
    getAllConcepts().map((c) => ({
      id: c.frontmatter.id,
      kind: 'concept',
      proofStatus: c.frontmatter.proof_status,
      mdxPath: rel(c.filePath),
    })),
  autopsy: () =>
    getAllAutopsies().map((a) => ({
      id: a.frontmatter.id,
      kind: 'autopsy',
      proofStatus: a.frontmatter.proof_status,
      mdxPath: rel(a.filePath),
    })),
  symptom: () =>
    getAllSymptoms().map((s) => ({
      id: s.frontmatter.id,
      kind: 'symptom',
      proofStatus: s.frontmatter.proof_status,
      mdxPath: rel(s.filePath),
    })),
  vs: () =>
    extractVsPairs().map((p) => ({
      id: `vs-${p.slug}`,
      kind: 'vs',
      proofStatus: p.proof_status,
      mdxPath: null,
    })),
  'deep-dive': null,
  myth: null,
  changelog: null,
};

export interface PageIdCollision {
  id: string;
  kinds: PageKind[];
}

/** Returns all pages and any ids shared across multiple page kinds. */
export function getAllPageRefs(): { pages: PageRef[]; collisions: PageIdCollision[] } {
  const pages = (Object.values(PAGE_REF_PROVIDERS).filter(Boolean) as Array<() => PageRef[]>).flatMap((f) =>
    f()
  );
  const kindsById = new Map<string, PageKind[]>();
  for (const p of pages) {
    kindsById.set(p.id, [...(kindsById.get(p.id) ?? []), p.kind]);
  }
  const collisions = [...kindsById.entries()]
    .filter(([, kinds]) => kinds.length > 1)
    .map(([id, kinds]) => ({ id, kinds }));
  return { pages, collisions };
}

/** Map of pageId -> proof_status across all page kinds. */
export function getPageProofStatusMap(): Map<string, PageProofStatus> {
  return new Map(getAllPageRefs().pages.map((p) => [p.id, p.proofStatus]));
}
