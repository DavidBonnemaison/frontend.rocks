import fs from 'fs';
import path from 'path';
import {
  EvidenceDossierSchema,
  InteractivePrimitiveSchema,
  LearningPathsFileSchema,
  WeeklyDigestSchema,
  type AutopsyFrontmatter,
  type ConceptFrontmatter,
} from '../src/lib/schemas';
import { getBaseline } from '../src/lib/proof/support/baseline';
import { extractInlineConceptLinks } from '../src/lib/mdx/sections';
import {
  validateAutopsyCaseNumberContiguity,
  validateAutopsyCastDiversity,
  validateAutopsyMdx,
} from '../src/lib/validators/autopsy-validator';
import { validateConceptMdx } from '../src/lib/validators/concept-validator';
import { validateConceptGraph } from '../src/lib/validators/dag';
import { isPublished } from '../src/lib/publication';
import { PRODUCTION_SYMPTOMS } from '../src/config/symptoms';
import { CONTENT_DIR } from '../src/lib/paths';
import { parseCliArgs } from '../src/lib/cli-args';
import { getAllClaimsFiles } from '../src/lib/proof/claims-loader';
import { getAllPageRefs } from '../src/lib/proof/page-registry';
import { validateClaimsCorpus } from '../src/lib/validators/claims-validator';
import { validateExperimentView } from '../src/lib/validators/experiment-view-validator';
import { validateProgrammaticSeo } from '../src/lib/validators/seo-validator';
import { ChallengeSchema } from '../src/lib/proof/challenge-schema';
import { validateChallengeAgainstExperiment } from '../src/lib/proof/challenge';
import type { ExperimentDefinition } from '../src/lib/proof/define-experiment';
import { RedirectsFileSchema } from '../src/lib/redirects/schema';
import {
  buildRedirectsFile,
  validateRedirectTargets,
  type NamedRedirectsFile,
} from '../src/lib/redirects/build';
import { validateRecertSummary } from '../src/lib/recertification/validate';

const CONCEPTS_DIR = path.join(CONTENT_DIR, 'concepts');
const AUTOPSIES_DIR = path.join(CONTENT_DIR, 'autopsies');
const LABS_DIR = path.join(CONTENT_DIR, 'labs');
const DIGESTS_DIR = path.join(CONTENT_DIR, 'digests');
const EVIDENCE_DIR = path.join(CONTENT_DIR, 'evidence');
const REDIRECTS_DIR = path.join(CONTENT_DIR, 'redirects');
const RECERT_SUMMARY_FILE = path.join(CONTENT_DIR, 'recertification', 'summary.json');
const PATHS_FILE = path.join(CONTENT_DIR, 'paths.json');

async function main(): Promise<void> {
  parseCliArgs(process.argv.slice(2), {});
  const errors: string[] = [];
  const concepts: ConceptFrontmatter[] = [];
  let claimsStats: { files: number; claims: number } | null = null;

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
        const baseline = getBaseline(res.frontmatter.web_feature_id);
        if (!baseline.ok) {
          errors.push(`[${file}] ${baseline.message}`);
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

    const orderedAutopsies = [...autopsies].sort((a, b) => a.case_number - b.case_number);
    for (let i = 0; i < orderedAutopsies.length; i++) {
      const current = orderedAutopsies[i];
      const prev4 = orderedAutopsies.slice(Math.max(0, i - 4), i);
      const clash = prev4.find((p) => p.piece_color === current.piece_color);
      if (clash) {
        console.warn(
          `⚠️  [autopsies/piece-color] #${current.case_number} (${current.id}) reuses "${current.piece_color}" from #${clash.case_number} (${clash.id}) within the previous 4 pieces`
        );
      }
    }
  }

  // Validate Claims (content/claims)
  try {
    const claimsFiles = [...getAllClaimsFiles().values()];
    const experimentsDir = path.join(CONTENT_DIR, 'experiments');
    const experimentIds = new Set(
      fs.existsSync(experimentsDir)
        ? fs
            .readdirSync(experimentsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && fs.existsSync(path.join(experimentsDir, d.name, 'experiment.ts')))
            .map((d) => d.name)
        : []
    );
    const { pages, collisions } = getAllPageRefs();
    const claimsResult = validateClaimsCorpus({ claimsFiles, pages, collisions, experimentIds });
    errors.push(...claimsResult.errors);
    for (const w of claimsResult.warnings) console.warn(`⚠️  ${w}`);
    claimsStats = claimsResult.stats;
  } catch (err) {
    errors.push(`[claims] ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate optional Experiment view.json and challenge.json files
  const experimentsDirForViews = path.join(CONTENT_DIR, 'experiments');
  const existingExperimentIds = new Set<string>();
  if (fs.existsSync(experimentsDirForViews)) {
    for (const entry of fs.readdirSync(experimentsDirForViews, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const expPath = path.join(experimentsDirForViews, entry.name, 'experiment.ts');
      if (fs.existsSync(expPath)) {
        existingExperimentIds.add(entry.name);
      }

      const viewPath = path.join(experimentsDirForViews, entry.name, 'view.json');
      const challengePath = path.join(experimentsDirForViews, entry.name, 'challenge.json');
      if (!fs.existsSync(viewPath) && !fs.existsSync(challengePath)) continue;

      if (!fs.existsSync(expPath)) {
        if (fs.existsSync(viewPath)) {
          errors.push(`[experiments/${entry.name}/view.json] Missing sibling experiment.ts`);
        }
        if (fs.existsSync(challengePath)) {
          errors.push(`[experiments/${entry.name}/challenge.json] Missing sibling experiment.ts`);
        }
        continue;
      }

      let expDef: ExperimentDefinition | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(expPath) as { default?: ExperimentDefinition };
        expDef = mod.default;
      } catch (err) {
        errors.push(
          `[experiments/${entry.name}/experiment.ts] ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      if (!expDef) {
        errors.push(`[experiments/${entry.name}/experiment.ts] experiment.ts has no default export`);
        continue;
      }

      if (fs.existsSync(viewPath)) {
        try {
          const rawView = JSON.parse(fs.readFileSync(viewPath, 'utf-8'));
          const res = validateExperimentView(entry.name, rawView, expDef);
          if (!res.ok) {
            for (const e of res.errors) {
              errors.push(`[experiments/${e.experimentId}/view.json] ${e.message}`);
            }
          }
        } catch (err) {
          errors.push(
            `[experiments/${entry.name}/view.json] ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (fs.existsSync(challengePath)) {
        try {
          const rawChallenge = JSON.parse(fs.readFileSync(challengePath, 'utf-8'));
          const parsedChallenge = ChallengeSchema.parse(rawChallenge);
          const challengeErrors = validateChallengeAgainstExperiment(expDef, parsedChallenge);
          for (const ce of challengeErrors) {
            errors.push(`[experiments/${entry.name}/challenge.json] ${ce}`);
          }
        } catch (err) {
          errors.push(
            `[experiments/${entry.name}/challenge.json] ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  // Validate <Experiment id="..."> references in MDX and proven concept Experiment requirement
  const EXPERIMENT_TAG_RE = /<Experiment\b[^>]*\bid=["']([a-z0-9-]+)["'][^>]*>/g;
  const conceptProofByFile = new Map(concepts.map((c) => [`${c.id}.mdx`, c.proof_status]));
  for (const { file, body } of conceptBodies) {
    const refs = [...body.matchAll(EXPERIMENT_TAG_RE)].map((m) => m[1]);
    for (const expId of refs) {
      if (!existingExperimentIds.has(expId)) {
        errors.push(`[${file}] <Experiment id="${expId}"> points to a missing experiment folder`);
      }
    }
    if (conceptProofByFile.get(file) === 'proven' && refs.length === 0) {
      errors.push(`[${file}] Proven concept must include at least one <Experiment> in MDX`);
    }
  }

  if (fs.existsSync(AUTOPSIES_DIR)) {
    for (const file of fs.readdirSync(AUTOPSIES_DIR).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))) {
      const raw = fs.readFileSync(path.join(AUTOPSIES_DIR, file), 'utf-8');
      for (const m of raw.matchAll(EXPERIMENT_TAG_RE)) {
        if (!existingExperimentIds.has(m[1])) {
          errors.push(`[autopsies/${file}] <Experiment id="${m[1]}"> points to a missing experiment folder`);
        }
      }
    }
  }

  for (const s of PRODUCTION_SYMPTOMS) {
    if (isPublished(s.proof_status, s.slug)) {
      errors.push(`[proof] symptom "${s.slug}" cannot be proven before MDX migration`);
    }
  }

  // Validate redirects (content/redirects/*.json)
  if (fs.existsSync(REDIRECTS_DIR)) {
    const namedRedirects: NamedRedirectsFile[] = [];
    for (const file of fs.readdirSync(REDIRECTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(REDIRECTS_DIR, file), 'utf-8'));
        const data = RedirectsFileSchema.parse(raw);
        namedRedirects.push({ fileName: file, data });
      } catch (err) {
        errors.push(`[redirects/${file}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (namedRedirects.length > 0) {
      try {
        buildRedirectsFile(namedRedirects);
      } catch (err) {
        errors.push(`[redirects] ${err instanceof Error ? err.message : String(err)}`);
      }
      const autopsyIdSet = new Set(autopsies.map((a) => a.id));
      errors.push(
        ...validateRedirectTargets(namedRedirects, {
          conceptIds: conceptIdSet,
          autopsyIds: autopsyIdSet,
        }),
      );
    }
  }

  // Validate recertification summary (content/recertification/summary.json) if present
  if (fs.existsSync(RECERT_SUMMARY_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RECERT_SUMMARY_FILE, 'utf-8'));
      const provenConceptCount = concepts.filter((c) => c.proof_status === 'proven').length;
      const summaryRes = validateRecertSummary(raw, provenConceptCount);
      if (!summaryRes.ok) {
        errors.push(...summaryRes.errors);
      }
    } catch (err) {
      errors.push(
        `[recertification/summary.json] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Validate Programmatic SEO (/vs/ anti-doorway & /symptoms/ referential integrity)
  const seoResult = validateProgrammaticSeo();
  if (!seoResult.valid) {
    for (const e of seoResult.errors) {
      errors.push(e);
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
    `✅ Content validation passed: ${concepts.length} concept(s), ${autopsies.length} autopsy(ies), ${seoResult.stats.vsPairCount} /vs/ pair(s) (max overlap ${(seoResult.stats.maxVsOverlap * 100).toFixed(1)}%), ${seoResult.stats.symptomCount} symptom(s) (max overlap ${(seoResult.stats.maxSymptomOverlap * 100).toFixed(1)}%), ${claimsStats?.claims ?? 0} claim(s) in ${claimsStats?.files ?? 0} file(s), DAG acyclic, all schemas valid.`
  );
}

main();
