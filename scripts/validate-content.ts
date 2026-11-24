import fs from 'fs';
import path from 'path';
import { features as webFeatures } from 'web-features';
import {
  EvidenceDossierSchema,
  InteractivePrimitiveSchema,
  LearningPathsFileSchema,
  WeeklyDigestSchema,
  type AutopsyFrontmatter,
  type ConceptFrontmatter,
} from '../src/lib/schemas';
import { extractInlineConceptLinks } from '../src/lib/mdx/sections';
import {
  validateAutopsyCaseNumberContiguity,
  validateAutopsyCastDiversity,
  validateAutopsyMdx,
} from '../src/lib/validators/autopsy-validator';
import { validateConceptMdx, verifySourceUrls } from '../src/lib/validators/concept-validator';
import { validateConceptGraph } from '../src/lib/validators/dag';
import { checkProvenGuard, isPublished } from '../src/lib/publication';
import { PRODUCTION_SYMPTOMS } from '../src/config/symptoms';
import { CONTENT_DIR } from '../src/lib/paths';
import { validateProgrammaticSeo } from '../src/lib/validators/seo-validator';

const CONCEPTS_DIR = path.join(CONTENT_DIR, 'concepts');
const AUTOPSIES_DIR = path.join(CONTENT_DIR, 'autopsies');
const LABS_DIR = path.join(CONTENT_DIR, 'labs');
const DIGESTS_DIR = path.join(CONTENT_DIR, 'digests');
const EVIDENCE_DIR = path.join(CONTENT_DIR, 'evidence');
const PATHS_FILE = path.join(CONTENT_DIR, 'paths.json');

async function main(): Promise<void> {
  const checkUrls = process.argv.includes('--check-urls');
  const errors: string[] = [];
  const concepts: ConceptFrontmatter[] = [];

  if (!fs.existsSync(CONCEPTS_DIR)) {
    console.error('❌ Missing content/concepts directory');
    process.exit(1);
  }

  const conceptFiles = fs
    .readdirSync(CONCEPTS_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort();

  const conceptBodies: Array<{ file: string; body: string }> = [];

  for (const file of conceptFiles) {
    const expectedId = file.replace(/\.mdx?$/, '');
    const raw = fs.readFileSync(path.join(CONCEPTS_DIR, file), 'utf-8');
    const res = validateConceptMdx(raw, expectedId);
    if (!res.valid || !res.frontmatter) {
      for (const e of res.errors) {
        errors.push(`[${file}] ${e}`);
      }
    } else {
      concepts.push(res.frontmatter);
      if (res.body) {
        conceptBodies.push({ file, body: res.body });
      }
      const labId = res.frontmatter.lab_id ?? res.frontmatter.id;
      const labPath = path.join(LABS_DIR, `${labId}.json`);
      if (!fs.existsSync(labPath)) {
        errors.push(`[${file}] Missing InteractivePrimitive config at content/labs/${labId}.json`);
      }
      if (res.frontmatter.web_feature_id) {
        const wf = webFeatures[res.frontmatter.web_feature_id];
        if (!wf || wf.kind !== 'feature') {
          errors.push(
            `[${file}] Unknown or non-feature web_feature_id "${res.frontmatter.web_feature_id}" in web-features`
          );
        }
      }
    }
  }

  // Validate labs
  if (fs.existsSync(LABS_DIR)) {
    for (const file of fs.readdirSync(LABS_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(LABS_DIR, file), 'utf-8'));
        InteractivePrimitiveSchema.parse(raw);
      } catch (err) {
        errors.push(`[labs/${file}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Validate DAG & referential integrity
  const dagResult = validateConceptGraph(concepts);
  if (!dagResult.valid) {
    for (const e of dagResult.errors) {
      errors.push(`[DAG] ${e.message}`);
    }
  }

  const conceptIdSet = new Set(concepts.map((c) => c.id));

  // Validate inline /concepts/<slug> links in MDX bodies
  for (const { file, body } of conceptBodies) {
    const linkedSlugs = extractInlineConceptLinks(body);
    for (const slug of linkedSlugs) {
      if (!conceptIdSet.has(slug)) {
        errors.push(`[${file}] Broken inline concept link "/concepts/${slug}"`);
      }
    }
  }

  // Validate Learning Paths (content/paths.json)
  if (fs.existsSync(PATHS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf-8'));
      const pathsFile = LearningPathsFileSchema.parse(raw);
      for (const p of pathsFile.paths) {
        for (const cid of p.concepts) {
          if (!conceptIdSet.has(cid)) {
            errors.push(`[paths.json] Path "${p.id}" references unknown concept "${cid}"`);
          }
        }
      }
    } catch (err) {
      errors.push(`[paths.json] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Validate WeeklyDigests
  if (fs.existsSync(DIGESTS_DIR)) {
    for (const file of fs.readdirSync(DIGESTS_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(DIGESTS_DIR, file), 'utf-8'));
        const digest = WeeklyDigestSchema.parse(raw);
        for (const entry of digest.entries) {
          for (const cid of entry.related_concepts) {
            if (!conceptIdSet.has(cid)) {
              errors.push(`[digests/${file}] Unknown related_concept "${cid}"`);
            }
          }
        }
      } catch (err) {
        errors.push(`[digests/${file}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Validate Evidence Dossiers
  if (fs.existsSync(EVIDENCE_DIR)) {
    for (const file of fs.readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, file), 'utf-8'));
        EvidenceDossierSchema.parse(raw);
      } catch (err) {
        errors.push(`[evidence/${file}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Validate AutopsyCases (content/autopsies)
  const autopsies: AutopsyFrontmatter[] = [];
  if (fs.existsSync(AUTOPSIES_DIR)) {
    const autopsyFiles = fs
      .readdirSync(AUTOPSIES_DIR)
      .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
      .sort();

    for (const file of autopsyFiles) {
      const expectedId = file.replace(/\.mdx?$/, '');
      const raw = fs.readFileSync(path.join(AUTOPSIES_DIR, file), 'utf-8');
      const res = validateAutopsyMdx(raw, expectedId, conceptIdSet);
      if (!res.valid || !res.frontmatter) {
        for (const e of res.errors) {
          errors.push(`[autopsies/${file}] ${e}`);
        }
      } else {
        autopsies.push(res.frontmatter);
        const labId = res.frontmatter.lab_id ?? res.frontmatter.id;
        const labPath = path.join(LABS_DIR, `${labId}.json`);
        if (!fs.existsSync(labPath)) {
          errors.push(
            `[autopsies/${file}] Missing InteractivePrimitive config at content/labs/${labId}.json`
          );
        }
        if (res.body) {
          const linkedSlugs = extractInlineConceptLinks(res.body);
          for (const slug of linkedSlugs) {
            if (!conceptIdSet.has(slug)) {
              errors.push(`[autopsies/${file}] Broken inline concept link "/concepts/${slug}"`);
            }
          }
        }
      }
    }

    const caseNumberContiguity = validateAutopsyCaseNumberContiguity(autopsies);
    if (!caseNumberContiguity.valid) {
      for (const e of caseNumberContiguity.errors) {
        errors.push(`[autopsies/case-numbers] ${e}`);
      }
    }

    const castDiversity = validateAutopsyCastDiversity(autopsies);
    if (!castDiversity.valid) {
      for (const e of castDiversity.errors) {
        errors.push(`[autopsies/cast-diversity] ${e}`);
      }
    }
  }

  // Proof guard: a page can be `proven` only once its claims file exists (replaced by the full check later).
  const claimsExists = (id: string): boolean =>
    fs.existsSync(path.join(CONTENT_DIR, 'claims', `${id}.claims.json`));
  for (const e of checkProvenGuard(
    [
      ...concepts.map((c) => ({ id: c.id, proof_status: c.proof_status })),
      ...autopsies.map((a) => ({ id: a.id, proof_status: a.proof_status })),
    ],
    claimsExists
  )) {
    errors.push(e);
  }
  for (const s of PRODUCTION_SYMPTOMS) {
    if (isPublished(s.proof_status, s.slug)) {
      errors.push(`[proof] symptom "${s.slug}" cannot be proven before EPIC-35`);
    }
  }

  // Validate Programmatic SEO (/vs/ anti-doorway & /symptoms/ referential integrity)
  const seoResult = validateProgrammaticSeo();
  if (!seoResult.valid) {
    for (const e of seoResult.errors) {
      errors.push(e);
    }
  }

  // Optional live URL verification
  if (checkUrls && (concepts.length > 0 || autopsies.length > 0)) {
    const allUrls = Array.from(
      new Set([
        ...concepts.flatMap((c) => c.sources),
        ...autopsies.flatMap((a) => a.sources),
      ])
    );
    console.log(`🔎 Checking ${allUrls.length} source URLs...`);
    const urlResults = await verifySourceUrls(allUrls);
    for (const r of urlResults) {
      if (!r.ok) {
        errors.push(`[URL] ${r.url} failed (${r.status ?? r.error})`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`❌ Content validation failed (${errors.length} error(s)):`);
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Content validation passed: ${concepts.length} concept(s), ${autopsies.length} autopsy(ies), ${seoResult.stats.vsPairCount} /vs/ pair(s) (max overlap ${(seoResult.stats.maxVsOverlap * 100).toFixed(1)}%), ${seoResult.stats.symptomCount} symptom(s) (max overlap ${(seoResult.stats.maxSymptomOverlap * 100).toFixed(1)}%), DAG acyclic, all schemas valid.`
  );
}

main();
