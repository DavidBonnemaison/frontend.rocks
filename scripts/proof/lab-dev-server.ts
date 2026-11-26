import path from 'node:path';
import { SITE_ROOT } from '../../src/lib/paths';
import { startStaticServer } from './static-server';

const LAB_HEADERS = () => ({
  'Content-Security-Policy': 'frame-ancestors *',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
});

async function main(): Promise<void> {
  const dir = path.join(SITE_ROOT, 'dist-lab-dev');
  const lab = await startStaticServer(dir, {
    host: '127.0.0.1',
    port: 4174,
    headers: LAB_HEADERS,
  });
  const parent = await startStaticServer(dir, {
    host: null,
    port: 4175,
    headers: LAB_HEADERS,
  });

  console.log(`✅ Lab dev servers listening on ${lab.origin} and http://127.0.0.1:4175 (all interfaces)`);

  const shutdown = async () => {
    await Promise.all([lab.close(), parent.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
