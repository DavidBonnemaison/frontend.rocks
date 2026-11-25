// Manual, local only. Tells IndexNow that every quarantined URL changed (now noindex).
// Usage: INDEXNOW_KEY=... npm run maintenance:indexnow-quarantine [-- --dry-run]
import { getAllAutopsies, getAllConcepts } from '../../src/lib/content-loader';
import { PRODUCTION_SYMPTOMS } from '../../src/config/symptoms';
import { extractVsPairs } from '../../src/lib/vs-pairs';
import { parseCliArgs } from '../../src/lib/cli-args';
import { submitIndexNow } from '../../src/lib/indexnow';
import { buildQuarantineUrls } from './quarantine-urls';

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), { 'dry-run': 'boolean' });
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const urls = buildQuarantineUrls({
    concepts,
    autopsies,
    symptoms: PRODUCTION_SYMPTOMS,
    vsPairs: extractVsPairs(concepts, autopsies),
  });

  if (args['dry-run'] === true) {
    console.log(`${urls.length} URL(s). First 5:`);
    for (const u of urls.slice(0, 5)) console.log(`  ${u}`);
    return;
  }
  // IndexNow accepts up to 10,000 URLs per request.
  const res = await submitIndexNow(urls);
  console.log(JSON.stringify(res));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
