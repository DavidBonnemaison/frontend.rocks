import type { ConceptPreviewData } from '@/components/concepts/ConceptInlineLink';
import type { MiniGraphNode } from '@/components/concepts/NeighborhoodMiniGraph';
import type { PathProgressMeta } from '@/components/concepts/PathProgressBar';
import type { PieceColor } from '@/lib/design/piece-colors';
import type { GeometrySnapshot } from '@/lib/design/schematic-snapshot';
import type { EngineId } from '@/lib/proof/claim-schema';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import type {
  AutopsyCaseFile,
  Domain,
  FailureMode,
  InteractivePrimitiveConfig,
  MaturityStatus,
} from '@/lib/schemas';

export interface ConceptConnectionItem {
  id: string;
  title: string;
  domain: Domain;
  groupLabel: string;
  note: string;
}

export interface ConceptPageView {
  id: string;
  title: string;
  domain: Domain;
  tldr: string;
  sections: Array<{ id: string; title: string; mdx: string }>;
  whenNotToUse: string | null;
  proofStatus: 'unverified' | 'proven';
  legacyLab: InteractivePrimitiveConfig | null;
  webFeatureId: string | null;
  maturityStatus: MaturityStatus | null;
  proof: PageProofSummary | null;
  readingMinutes: number;
  neighbors: MiniGraphNode[];
  prerequisites: ConceptConnectionItem[];
  followUps: ConceptConnectionItem[];
  relatedAutopsies: Array<{
    id: string;
    number: string;
    title: string;
    pieceColor: PieceColor;
    dek?: string;
  }>;
  vsPairs: Array<{ slug: string; title: string; note: string; relationLabel: string }>;
  paths: PathProgressMeta[];
  pathConceptTitles: Record<string, string>;
  conceptPreviews: Record<string, ConceptPreviewData>;
  isObsolete: boolean;
  supersededTargets: Array<{ id: string; title: string }>;
  replacesTargets: Array<{ id: string; title: string }>;
  sources: string[];
  lastVerifiedAt: string;
  jsonLd: Record<string, unknown>;
}

export interface AutopsyNavItem {
  id: string;
  number: string;
  title: string;
  pieceColor: PieceColor;
  dek?: string;
}

export interface AutopsyPageView {
  id: string;
  number: string;
  title: string;
  symptom: string;
  failureMode: FailureMode;
  pieceColor: PieceColor;
  proofStatus: 'unverified' | 'proven';
  heroSnapshot: GeometrySnapshot | null;
  caseFile: Array<{ key: string; value: string }>;
  caseFileRaw: AutopsyCaseFile;
  badFixes: Array<{ label: string; outcome: string }>;
  chapters: Array<{ id: string; title: string; mdx: string }>;
  causalSteps: Array<{
    order: number;
    conceptId: string;
    conceptTitle: string;
    role: string;
  }>;
  isComposite: boolean;
  legacyLab: InteractivePrimitiveConfig | null;
  reproExperimentId: string | null;
  proof: PageProofSummary | null;
  readingMinutes: number;
  sources: string[];
  lastVerifiedAt: string;
  prev: AutopsyNavItem | null;
  next: AutopsyNavItem | null;
  conceptPreviews: Record<string, ConceptPreviewData>;
  jsonLd: Record<string, unknown>;
}

export interface SymptomPageView {
  slug: string;
  title: string;
  proofStatus: 'unverified' | 'proven';
  signature: string;
  signatureEngines: EngineId[] | null;
  summary: string;
  causes: Array<{
    rank: number;
    title: string;
    check: string;
    conceptId?: string;
    autopsyId?: string;
    autopsyNumber?: string;
    autopsyTitle?: string;
  }>;
  related: Array<{ slug: string; title: string }>;
  proof: PageProofSummary | null;
  sources: string[];
  jsonLd: Record<string, unknown>;
}
