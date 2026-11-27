import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs } from '../../src/lib/cli-args';
import { CONTENT_DIR } from '../../src/lib/paths';

interface LegacyControl {
  key: string;
  label: string;
  kind: 'toggle' | 'range' | 'select';
  target?: string;
  className?: string;
  classPrefix?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue: unknown;
}

interface LegacyLiveSandbox {
  type: string;
  id: string;
  title: string;
  description: string;
  html: string;
  css: string;
  js?: string;
  controls: LegacyControl[];
}

function rewriteSandboxCss(css: string, controls: LegacyControl[]): string {
  let out = css;
  for (const c of controls) {
    if (c.kind === 'toggle' && c.className) {
      out = out.replaceAll(`#sandbox-root.${c.className}`, `:root[data-${c.key}="true"]`);
      out = out.replaceAll(`#sandbox-root:not(.${c.className})`, `:root:not([data-${c.key}="true"])`);
    } else if (c.kind === 'select' && c.classPrefix && c.options) {
      for (const opt of c.options) {
        out = out.replaceAll(
          `#sandbox-root.${c.classPrefix}${opt}`,
          `:root[data-${c.key}="${opt}"]`,
        );
      }
    }
  }
  return out;
}

function generateSkeleton(lab: LegacyLiveSandbox): string {
  const experimentId = `${lab.id}-sandbox`;
  const rewrittenCss = rewriteSandboxCss(lab.css, lab.controls);
  const attrSyncJs = `const p = window.__params || {};
for (const [k, v] of Object.entries(p)) {
  document.documentElement.setAttribute('data-' + k, String(v));
}
${lab.js ?? ''}`;

  return `import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: ${JSON.stringify(experimentId)},
  title: ${JSON.stringify(lab.title.slice(0, 80))},
  question: ${JSON.stringify(`${lab.title}?`)},
  kind: 'fixture',
  fixture: {
    html: ${JSON.stringify(lab.html)},
    css: ${JSON.stringify(rewrittenCss)},
    js: ${JSON.stringify(attrSyncJs)},
  },
  variants: {
    treatment: { label: 'Treatment' },
    control: { label: 'Control' },
  },
  mutation: { variant: 'treatment', remove: '' },
  observe: () => {
    throw new Error('TODO(EPIC-37 US-37.5)');
  },
  expect: {},
});
`;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), {
    force: 'boolean',
  });
  const labsDir = path.join(CONTENT_DIR, 'labs');
  const expDir = path.join(CONTENT_DIR, 'experiments');
  if (!fs.existsSync(labsDir)) {
    console.error('Missing content/labs directory');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  for (const file of fs.readdirSync(labsDir).filter((f) => f.endsWith('.json')).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(labsDir, file), 'utf-8')) as LegacyLiveSandbox;
    if (raw.type !== 'live-sandbox') continue;
    const outDir = path.join(expDir, `${raw.id}-sandbox`);
    const outFile = path.join(outDir, 'experiment.ts');
    if (fs.existsSync(outFile) && !args.force) {
      skipped += 1;
      continue;
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, generateSkeleton(raw));
    created += 1;
  }
  console.log(`Migrated live-sandbox skeletons: ${created} created, ${skipped} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
