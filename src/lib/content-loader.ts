import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import {
  AutopsyFrontmatterSchema,
  ConceptFrontmatterFileSchema,
  EvidenceDossierSchema,
  InteractivePrimitiveSchema,
  LearningPathsFileSchema,
  WeeklyDigestSchema,
  type AutopsyFrontmatter,
  type ConceptFrontmatter,
  type EvidenceDossier,
  type InteractivePrimitiveConfig,
  type LearningPath,
  type WeeklyDigest,
} from './schemas';
import { extractSectionText } from './mdx/sections';
import { CONTENT_DIR } from './paths';
import { extractAutopsyChapters } from './validators/autopsy-validator';
import type { ClaimsFile } from './proof/claim-schema';
import { getClaimsForPage } from './proof/claims-loader';
import { withComputedMaturity } from './proof/support/maturity';

const CONCEPTS_DIR = path.join(CONTENT_DIR, 'concepts');
const AUTOPSIES_DIR = path.join(CONTENT_DIR, 'autopsies');
const LABS_DIR = path.join(CONTENT_DIR, 'labs');
const DIGESTS_DIR = path.join(CONTENT_DIR, 'digests');
const EVIDENCE_DIR = path.join(CONTENT_DIR, 'evidence');
const PATHS_FILE = path.join(CONTENT_DIR, 'paths.json');

export interface ConceptSections {
  tl_dr: string;
  interactive_lab: string;
  under_the_hood: string;
  genealogy: string;
  production_pitfalls: string;
}

export interface LoadedConcept {
  frontmatter: ConceptFrontmatter;
  body: string;
  sections: ConceptSections;
  lab: InteractivePrimitiveConfig | null;
  evidence: EvidenceDossier | null;
  claims: ClaimsFile | null;
  filePath: string;
}

function parseWithFileContext<T>(schema: { parse: (input: unknown) => T }, input: unknown, label: string): T {
  try {
    return schema.parse(input);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Schema validation failed in ${label}:\n${detail}`);
  }
}

export function getLabById(labId: string): InteractivePrimitiveConfig | null {
  const filePath = path.join(LABS_DIR, `${labId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return parseWithFileContext(InteractivePrimitiveSchema, raw, `content/labs/${labId}.json`);
}

export function getAllLabs(): InteractivePrimitiveConfig[] {
  if (!fs.existsSync(LABS_DIR)) return [];
  return fs
    .readdirSync(LABS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw = JSON.parse(fs.readFileSync(path.join(LABS_DIR, file), 'utf-8'));
      return parseWithFileContext(InteractivePrimitiveSchema, raw, `content/labs/${file}`);
    });
}

export function getEvidenceByConceptId(conceptId: string): EvidenceDossier | null {
  const filePath = path.join(EVIDENCE_DIR, `${conceptId}.evidence-dossier.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return parseWithFileContext(
    EvidenceDossierSchema,
    raw,
    `content/evidence/${conceptId}.evidence-dossier.json`
  );
}

export function getAllConcepts(): LoadedConcept[] {
  if (!fs.existsSync(CONCEPTS_DIR)) return [];
  const files = fs
    .readdirSync(CONCEPTS_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  return files.map((file) => {
    const filePath = path.join(CONCEPTS_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    const frontmatter = withComputedMaturity(
      parseWithFileContext(
        ConceptFrontmatterFileSchema,
        parsed.data,
        `content/concepts/${file}`
      )
    );

    const sections: ConceptSections = {
      tl_dr: extractSectionText(parsed.content, /^##\s+(tl;?\s*dr|in brief)/i),
      interactive_lab: extractSectionText(parsed.content, /^##\s+interactive[_ ]lab/i),
      under_the_hood: extractSectionText(parsed.content, /^##\s+under[_ ]the[_ ]hood/i),
      genealogy: extractSectionText(parsed.content, /^##\s+(problem[_ ])?genealogy/i),
      production_pitfalls: extractSectionText(parsed.content, /^##\s+production[_ ]pitfalls/i),
    };

    const labId = frontmatter.lab_id ?? frontmatter.id;
    const lab = getLabById(labId);
    const evidence = getEvidenceByConceptId(frontmatter.id);
    const claims = getClaimsForPage(frontmatter.id);

    return {
      frontmatter,
      body: parsed.content,
      sections,
      lab,
      evidence,
      claims,
      filePath,
    };
  });
}

export function getConceptById(id: string): LoadedConcept | null {
  const all = getAllConcepts();
  return all.find((c) => c.frontmatter.id === id) ?? null;
}

export function getAllDigests(): WeeklyDigest[] {
  if (!fs.existsSync(DIGESTS_DIR)) return [];
  return fs
    .readdirSync(DIGESTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((file) => {
      const raw = JSON.parse(fs.readFileSync(path.join(DIGESTS_DIR, file), 'utf-8'));
      return WeeklyDigestSchema.parse(raw);
    });
}

export function getLearningPaths(): LearningPath[] {
  if (!fs.existsSync(PATHS_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf-8'));
  return LearningPathsFileSchema.parse(raw).paths;
}

export interface AutopsySections {
  incident_report: string;
  red_herring?: string;
  causal_chain: string;
  failure_simulator: string;
  layer_dissection: string;
  architectural_fix: string;
}

export interface AutopsySectionHeadings {
  incident_report: string;
  red_herring?: string;
  causal_chain: string;
  failure_simulator: string;
  layer_dissection: string;
  architectural_fix: string;
}

export interface LoadedAutopsy {
  frontmatter: AutopsyFrontmatter;
  body: string;
  sections: AutopsySections;
  sectionHeadings: AutopsySectionHeadings;
  lab: InteractivePrimitiveConfig | null;
  claims: ClaimsFile | null;
  filePath: string;
}

export function getAllAutopsies(): LoadedAutopsy[] {
  if (!fs.existsSync(AUTOPSIES_DIR)) return [];
  const files = fs
    .readdirSync(AUTOPSIES_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  return files
    .map((file) => {
      const filePath = path.join(AUTOPSIES_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(raw);
      const frontmatter = parseWithFileContext(
        AutopsyFrontmatterSchema,
        parsed.data,
        `content/autopsies/${file}`
      );

      const { chapters } = extractAutopsyChapters(parsed.content);
      const cf = frontmatter.case_file;
      const caseFileSummary = [
        `Trigger: ${cf.trigger}`,
        `Symptom: ${cf.symptom}`,
        `Root cause: ${cf.root_cause}`,
        ...cf.bad_fixes.map((b, i) => `Bad fix #${i + 1}: ${b.label} — ${b.outcome}`),
        `Fix: ${cf.fix}`,
        `How to spot it: ${cf.how_to_spot}`,
        ...(cf.deleted ? [`Deleted / Replaced: ${cf.deleted}`] : []),
      ].join('\n');

      const incidentBody =
        chapters.length >= 2
          ? chapters
              .slice(0, 2)
              .map((c) => c.body)
              .join('\n\n')
          : chapters[0]?.body ?? '';

      const lastChapterBody = chapters[chapters.length - 1]?.body ?? '';
      const fixBody = [caseFileSummary, lastChapterBody].filter(Boolean).join('\n\n');

      const sections: AutopsySections = {
        incident_report: incidentBody,
        ...(chapters[2] ? { red_herring: chapters[2].body } : {}),
        causal_chain: chapters[3]?.body ?? '',
        failure_simulator: chapters[4]?.body ?? '',
        layer_dissection:
          chapters.length > 4
            ? chapters
                .slice(2, -1)
                .map((c) => c.body)
                .join('\n\n')
            : '',
        architectural_fix: fixBody,
      };

      const sectionHeadings: AutopsySectionHeadings = {
        incident_report: chapters[0]?.heading ?? 'Incident Report',
        ...(chapters[2] ? { red_herring: chapters[2].heading } : {}),
        causal_chain: chapters[3]?.heading ?? 'Causal Chain',
        failure_simulator: chapters[4]?.heading ?? 'Failure Simulator',
        layer_dissection: chapters[Math.max(0, chapters.length - 2)]?.heading ?? 'Layer Dissection',
        architectural_fix: chapters[chapters.length - 1]?.heading ?? 'Case file',
      };

      const labId = frontmatter.lab_id ?? frontmatter.id;
      const lab = getLabById(labId);
      const claims = getClaimsForPage(frontmatter.id);

      return {
        frontmatter,
        body: parsed.content,
        sections,
        sectionHeadings,
        lab,
        claims,
        filePath,
      };
    })
    .sort((a, b) => a.frontmatter.case_number - b.frontmatter.case_number);
}

export function getAutopsyById(id: string): LoadedAutopsy | null {
  const all = getAllAutopsies();
  return all.find((a) => a.frontmatter.id === id) ?? null;
}

export function getAutopsiesForConcept(conceptId: string): LoadedAutopsy[] {
  return getAllAutopsies().filter((a) =>
    a.frontmatter.traversed_concepts.some((tc) => tc.concept_id === conceptId)
  );
}

