import { describe, expect, it } from 'vitest';
import { ExperimentBundleSchema, type ExperimentBundle } from '@/lib/proof/experiment-schema';
import {
  buildExperimentDocument,
  canonicalJson,
  composeSources,
  jsonEqual,
  jsonForScript,
  paramsToCss,
  resolveParams,
} from '@/lib/proof/runtime';

function makeBundle(overrides: Record<string, unknown> = {}): ExperimentBundle {
  return ExperimentBundleSchema.parse({
    schemaVersion: 1,
    runtimeVersion: '1',
    sourceHash: 'b'.repeat(64),
    id: 'compose-demo',
    title: 'Compose demo experiment',
    question: 'Does composition apply markers, params, and mutations cleanly?',
    kind: 'fixture',
    fixture: {
      html: '<div class="wrap"><!--@variant--></div>',
      css: '.wrap { width: var(--w); }',
      js: 'const a = 1;\n/*@variant*/\nconst b = 2;',
    },
    params: {
      w: { kind: 'range', label: 'Width', min: 100, max: 600, step: 20, default: 300, unit: 'px' },
      enabled: { kind: 'toggle', label: 'Enabled', default: true },
      mode: { kind: 'select', label: 'Mode', options: ['grid', 'flex'], default: 'grid' },
    },
    variants: {
      treatment: {
        label: 'Treatment',
        html: '<span class="t">T</span>',
        css: '.t { color: red; }',
        js: 'window.__x = 1;',
      },
      control: {
        label: 'Control',
      },
    },
    mutation: { variant: 'treatment', remove: 'color: red;' },
    observeSource: '(ctx) => ({ ok: Boolean(ctx.doc.body) })',
    expect: {
      'case-a': { treatment: { ok: true }, control: { ok: false } },
    },
    liveInBrowser: true,
    ...overrides,
  });
}

describe('runtime compose, params, sanitize, and document builder', () => {
  it('replaces markers, appends when absent, strips marker when variant part missing, and orders CSS', () => {
    const withMarker = composeSources(makeBundle(), 'treatment');
    expect(withMarker.html).toBe('<div class="wrap"><span class="t">T</span></div>');
    expect(withMarker.js).toBe('const a = 1;\nwindow.__x = 1;\nconst b = 2;');
    expect(withMarker.css).toBe('.wrap { width: var(--w); }\n.t { color: red; }');

    const stripped = composeSources(makeBundle(), 'control');
    expect(stripped.html).toBe('<div class="wrap"></div>');
    expect(stripped.js).toBe('const a = 1;\n\nconst b = 2;');

    const appended = composeSources(
      makeBundle({ fixture: { html: '<div class="wrap"></div>', js: 'const a = 1;' } }),
      'treatment'
    );
    expect(appended.html).toBe('<div class="wrap"></div>\n<span class="t">T</span>');
    expect(appended.js).toBe('const a = 1;\nwindow.__x = 1;');
  });

  it('applies mutation only to treatment and returns empty sources for blank', () => {
    const mutated = composeSources(makeBundle(), 'treatment', true);
    expect(mutated.css).not.toContain('color: red;');

    expect(() => composeSources(makeBundle(), 'control', true)).toThrow(
      /mutation only applies to the treatment variant/
    );

    expect(composeSources(makeBundle(), 'blank')).toEqual({ html: '', css: '', js: '' });
  });

  it('inserts replacement dollar-patterns verbatim without String.replace corruption', () => {
    const bundle = makeBundle({
      variants: {
        treatment: {
          label: 'Special dollars',
          css: '.t { color: red; }',
          js: `const s = '$&' + "$'";`,
        },
        control: { label: 'Control' },
      },
    });
    const composed = composeSources(bundle, 'treatment');
    expect(composed.js).toContain(`const s = '$&' + "$'";`);
  });

  it('resolves default params, validates bounds/options, and formats CSS custom properties', () => {
    const bundle = makeBundle();
    const defaults = resolveParams(bundle);
    expect(defaults).toEqual({ w: 300, enabled: true, mode: 'grid' });
    expect(paramsToCss(bundle, defaults)).toBe(
      ':root {\n  --w: 300px;\n  --enabled: 1;\n  --mode: grid;\n}'
    );
    expect(paramsToCss(bundle, { w: 200, enabled: false, mode: 'flex' })).toContain('--enabled: 0;');

    expect(() => resolveParams(bundle, { w: 999 })).toThrow(/out of range/);
    expect(() => resolveParams(bundle, { extra: 1 })).toThrow(/unknown param/);
    expect(() => resolveParams(bundle, { mode: 'block' })).toThrow(/must be one of/);
  });

  it('escapes < and Unicode line terminators in jsonForScript', () => {
    const serialized = jsonForScript(`a\u2028b\u2029</script>`);
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(serialized).toContain('\\u003c/script>');
    expect(serialized).not.toMatch(/[\u2028\u2029]/);
  });

  it('builds documents with config, sanitization, vendor ordering, present, nonce, and blank', () => {
    const base = makeBundle({
      variants: {
        treatment: {
          label: 'Treatment',
          css: '.t { color: red; }',
          js: 'const tag = "</script>";',
        },
        control: { label: 'Control' },
      },
    });

    const html = buildExperimentDocument(base, 'treatment', {}, {
      runId: 'run-1',
      parentOrigin: 'https://frontend.rocks',
      awaitInput: false,
      nonce: 'abc123',
    });

    expect(html).toContain('window.__frConfig = ');
    expect(html).toContain('"parentOrigin":"https://frontend.rocks"');
    expect(html).toContain('"awaitInput":false');
    expect(html).toContain('<\\/script>');
    expect(html).not.toContain('const tag = "</script>"');

    // Every <script> tag carries the requested nonce.
    const scriptTags = html.match(/<script[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    expect(scriptTags.every((tag) => tag.includes('nonce="abc123"'))).toBe(true);

    // Without presentSource, __frObserve is the last script in body.
    const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
    const bodyScripts = body.match(/<script[\s\S]*?<\/script>/g) ?? [];
    expect(bodyScripts[bodyScripts.length - 1]).toContain('window.__frObserve =');

    // With presentSource, __frPresent follows __frObserve.
    const withPresent = buildExperimentDocument(
      makeBundle({ presentSource: '(ctx) => ({ t: performance.now(), n: ctx.doc.body.childElementCount })' }),
      'treatment',
      {},
      { runId: 'run-2' }
    );
    expect(withPresent.indexOf('window.__frPresent =')).toBeGreaterThan(
      withPresent.indexOf('window.__frObserve =')
    );

    // Vendor requires vendorBaseUrl and precedes the fixture script.
    const withVendor = makeBundle({ vendor: ['react', 'react-dom'] });
    expect(() =>
      buildExperimentDocument(withVendor, 'treatment', {}, { runId: 'run-3' })
    ).toThrow(/FR_VENDOR_BASE_MISSING/);

    const vendorHtml = buildExperimentDocument(withVendor, 'treatment', {}, {
      runId: 'run-3',
      vendorBaseUrl: 'http://127.0.0.1:4173/experiments/',
    });
    const vendorIdx = vendorHtml.indexOf('src="http://127.0.0.1:4173/experiments/vendor/react.js"');
    const fixtureIdx = vendorHtml.indexOf('window.__x = 1;');
    expect(vendorIdx).toBeGreaterThan(-1);
    expect(vendorIdx).toBeLessThan(fixtureIdx);

    // Blank variant omits fixture HTML/JS.
    const blankHtml = buildExperimentDocument(base, 'blank', {}, { runId: 'run-4' });
    expect(blankHtml).not.toContain('<div class="wrap">');
    expect(blankHtml).not.toContain('const tag =');
  });

  it('produces canonical JSON regardless of object key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(jsonEqual({ b: 1, a: 2 }, { a: 2, b: 1 })).toBe(true);
    expect(jsonEqual({ b: 1, a: 2 }, { a: 3, b: 1 })).toBe(false);
  });
});
