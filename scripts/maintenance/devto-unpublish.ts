// Manual, local only, never run in CI.
// Usage: DEVTO_API_KEY=... npx tsx scripts/maintenance/devto-unpublish.ts [--apply]
interface DevToArticle {
  id: number;
  title: string;
  published: boolean;
  canonical_url: string | null;
}

async function main(): Promise<void> {
  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) throw new Error('DEVTO_API_KEY is required');
  const apply = process.argv.includes('--apply');

  const headers = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.forem.api-v1+json',
  };
  const res = await fetch('https://dev.to/api/articles/me/all?per_page=1000', { headers });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const articles = (await res.json()) as DevToArticle[];
  const targets = articles.filter(
    (a) => a.published && a.canonical_url?.startsWith('https://frontend.rocks/')
  );

  for (const a of targets) {
    console.log(`${apply ? 'UNPUBLISH' : 'DRY-RUN'} #${a.id} ${a.title} -> ${a.canonical_url}`);
    if (!apply) continue;
    const put = await fetch(`https://dev.to/api/articles/${a.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ article: { published: false } }),
    });
    if (!put.ok) console.error(`  failed: ${put.status} ${await put.text()}`);
    await new Promise((r) => setTimeout(r, 1500)); // Dev.to rate limit
  }
  console.log(`${targets.length} article(s) ${apply ? 'unpublished' : 'would be unpublished'}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
