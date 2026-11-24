import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { getAllAutopsies } from '../src/lib/content-loader';

const DIST_DIR = path.join(process.cwd(), 'dist');
const PUBLIC_LAB_OG_DIR = path.join(process.cwd(), 'public', 'og', 'labs');
const DIST_LAB_OG_DIR = path.join(DIST_DIR, 'og', 'labs');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startStaticServer(rootDir: string): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0];
      let filePath = path.join(rootDir, decodeURIComponent(urlPath));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === 'object' && addr ? addr.port : 4173 });
    });
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist/ directory not found. Run "npm run build-prod" first.');
  }

  fs.mkdirSync(PUBLIC_LAB_OG_DIR, { recursive: true });
  fs.mkdirSync(DIST_LAB_OG_DIR, { recursive: true });

  const autopsies = getAllAutopsies();
  const { server, port } = await startStaticServer(DIST_DIR);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 430, height: 720 },
      deviceScaleFactor: 2,
    });
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());

    let captured = 0;
    for (const autopsy of autopsies) {
      if (!autopsy.lab) continue;
      const labId = autopsy.lab.id;
      const url = `http://127.0.0.1:${port}/embed/lab/${labId}/`;

      await page.goto(url, { waitUntil: 'networkidle' });

      // Advance StepMachineLab to the critical failure step (where queues/metrics hit alert state)
      if (autopsy.lab.type === 'step-machine') {
        const nextBtn = page.getByRole('button', { name: /Next/i });
        const steps = autopsy.lab.steps;
        let criticalIdx = Math.min(3, Math.max(1, steps.length - 2));
        const alertPattern = /err|fail|critical|collapse|exhaust|loop|crash|429|oom|overflow|conflict|xss|blocked|deadlock|spike|flood|stale/i;
        for (let idx = steps.length - 1; idx >= 1; idx -= 1) {
          const serialized = JSON.stringify(steps[idx]);
          if (alertPattern.test(serialized)) {
            criticalIdx = idx;
            break;
          }
        }
        for (let i = 0; i < criticalIdx; i++) {
          if (await nextBtn.isEnabled()) {
            await nextBtn.click();
          }
        }
      } else if (autopsy.lab.type === 'pattern-comparator') {
        const afterBtn = page.getByRole('button', { name: /After|Fixed|Side/i }).first();
        if (await afterBtn.isVisible().catch(() => false)) {
          await afterBtn.click().catch(() => {});
        }
      } else if (autopsy.lab.type === 'live-sandbox') {
        const iframe = page.locator('iframe[data-testid="live-sandbox-iframe"]').first();
        await iframe.waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForTimeout(250);
      }

      const targetEl = page.locator('.embed-lab-main').first();
      const outPublic = path.join(PUBLIC_LAB_OG_DIR, `${labId}-preview.png`);
      const outDist = path.join(DIST_LAB_OG_DIR, `${labId}-preview.png`);

      await targetEl.screenshot({ path: outPublic });
      fs.copyFileSync(outPublic, outDist);
      captured++;
    }

    console.log(`✅ Captured ${captured} autopsy lab preview screenshot(s) in public/og/labs/ and dist/og/labs/.`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('Failed to capture lab previews:', err);
  process.exit(1);
});
