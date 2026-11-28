import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR } from '../../src/lib/paths';
import { readCheckResults } from '../../src/lib/proof/check-results';
import { loadExperimentBundle } from '../../src/lib/proof/experiment-bundles';

const EXPERIMENT_TAG_RE = /<Experiment\b[^>]*\bid=["']([a-z0-9-]+)["'][^>]*>/g;

function extractExperimentIds(mdxBody: string): string[] {
  const ids = new Set<string>();
  for (const m of mdxBody.matchAll(EXPERIMENT_TAG_RE)) {
    ids.add(m[1]);
  }
  return [...ids].sort();
}

function collectProvenPageExperiments(): Array<{ pageId: string; experimentIds: string[] }> {
  const out: Array<{ pageId: string; experimentIds: string[] }> = [];
  for (const folder of ['concepts', 'autopsies', 'symptoms', 'deep-dives', 'myths']) {
    const dir = path.join(CONTENT_DIR, folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mdx') || f.endsWith('.md')).sort()) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const parsed = matter(raw);
      if (parsed.data?.proof_status !== 'proven') continue;
      const pageId = typeof parsed.data?.id === 'string' ? parsed.data.id : file.replace(/\.mdx?$/, '');
      const experimentIds = extractExperimentIds(parsed.content);
      if (experimentIds.length > 0) {
        out.push({ pageId, experimentIds });
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  parseCliArgs(process.argv.slice(2), {});
  const results = readCheckResults();
  const provenPages = collectProvenPageExperiments();

  let checked = 0;
  let notYetChecked = 0;
  const errors: string[] = [];

  for (const { pageId, experimentIds } of provenPages) {
    for (const expId of experimentIds) {
      let bundle;
      try {
        bundle = loadExperimentBundle(expId);
      } catch (err) {
        errors.push(`[${pageId}] Missing built bundle for <Experiment id="${expId}">: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (bundle.liveInBrowser) continue;
      checked += 1;

      const recorded = results.experiments[expId];
      if (!recorded || Object.keys(recorded).length === 0) {
        notYetChecked += 1;
        console.warn(
          `⚠️  [recorded-results] ${pageId}: recorded-only experiment "${expId}" is not yet checked in preview or latest.json`,
        );
        continue;
      }

      const hasAnyEngineResult = Object.values(recorded).some(
        (byEngine) => Object.keys(byEngine).length > 0,
      );
      if (!hasAnyEngineResult) {
        notYetChecked += 1;
        console.warn(
          `⚠️  [recorded-results] ${pageId}: recorded-only experiment "${expId}" has no engine entries yet`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`❌ Recorded results check failed (${errors.length} error(s)):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `✅ Recorded results check passed: ${checked} recorded-only reference(s) on proven pages (${notYetChecked} not yet checked).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
