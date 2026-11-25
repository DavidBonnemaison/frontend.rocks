import { describe, expect, it } from 'vitest';
import { runStaticChecks } from '@/lib/proof/experiment-static-checks';

interface SourceOverrides {
  prefix?: string;
  id?: string;
  title?: string;
  kind?: string;
  fixture?: string;
  params?: string;
  variants?: string;
  mutation?: string;
  observe?: string;
  present?: string;
  expect?: string;
  extra?: string;
}

function makeSource(overrides: SourceOverrides = {}): string {
  const prefix = overrides.prefix ?? '';
  const id = overrides.id ?? `'demo-exp'`;
  const title = overrides.title ?? `'Demo experiment title'`;
  const kind = overrides.kind ?? `'fixture'`;
  const fixture =
    overrides.fixture ??
    `{ html: '<div class="box"><button id="go">Go</button></div>', css: '.box { width: var(--w); }' }`;
  const params =
    overrides.params ??
    `{ w: { kind: 'range', label: 'Width', min: -10, max: 600, step: 10, default: 480, unit: 'px' } }`;
  const variants =
    overrides.variants ??
    `{
      treatment: { label: 'Treatment', css: '.box { opacity: 0.5; }' },
      control: { label: 'Control' },
    }`;
  const mutation = overrides.mutation ?? `{ variant: 'treatment', remove: 'opacity: 0.5;' }`;
  const observe =
    overrides.observe ??
    `(ctx) => { const el = ctx.doc.body; return { w: Math.round(el.clientWidth) }; }`;
  const expectBlock =
    overrides.expect ??
    `{ 'case-a': { params: { w: 480 }, treatment: { w: 2 }, control: { w: 1 } } }`;
  const presentLine = overrides.present ? `  present: ${overrides.present},\n` : '';
  const extraLine = overrides.extra ? `  ${overrides.extra}\n` : '';

  return `${prefix}import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: ${id},
  title: ${title},
  question: 'Does the mechanism change the observed output?',
  kind: ${kind},
  fixture: ${fixture},
  params: ${params},
  variants: ${variants},
  mutation: ${mutation},
  observe: ${observe},
${presentLine}  expect: ${expectBlock},
${extraLine}});
`;
}

describe('experiment static checks (S01-S21)', () => {
  it('accepts a valid reference experiment including negative range bounds', () => {
    const res = runStaticChecks(makeSource(), 'demo-exp');
    expect(res.errors).toEqual([]);
    expect(res.bundleInput).not.toBeNull();
    expect(res.bundleInput?.observeSource).toContain('ctx.doc.body');
  });

  it('S01: rejects extra imports and allows import text inside a fixture template literal', () => {
    const bad = runStaticChecks(makeSource({ prefix: "import fs from 'node:fs';\n" }), 'demo-exp');
    expect(bad.errors.some((e) => e.code === 'S01')).toBe(true);

    const ok = runStaticChecks(
      makeSource({
        fixture: "{ html: '<p>ok</p>', js: `\nimport x from './x.js';\nwindow.__trace.push(1);\n` }",
      }),
      'demo-exp'
    );
    expect(ok.errors.some((e) => e.code === 'S01')).toBe(false);
  });

  it('S02: rejects unexpected top-level statements', () => {
    const res = runStaticChecks(makeSource({ prefix: "console.log('x');\n" }), 'demo-exp');
    expect(res.errors.some((e) => e.code === 'S02')).toBe(true);
  });

  it('S03: rejects non-static property expressions and interpolated template literals', () => {
    const callRes = runStaticChecks(makeSource({ title: "['A', 'B'].join('')" }), 'demo-exp');
    expect(callRes.errors.some((e) => e.code === 'S03' && e.message.includes('"title"'))).toBe(true);

    const tplRes = runStaticChecks(
      makeSource({
        fixture: "{ html: '<p>ok</p>', css: `a ${'${x}'}` }",
      }),
      'demo-exp'
    );
    expect(tplRes.errors.some((e) => e.code === 'S03')).toBe(true);
  });

  it('S04: rejects method shorthand and multi-parameter observe functions', () => {
    const methodSource = makeSource().replace(/observe:\s*\(ctx\)[\s\S]*?\},/, 'observe(ctx) { return { w: 1 }; },');
    const methodRes = runStaticChecks(methodSource, 'demo-exp');
    expect(methodRes.errors.some((e) => e.code === 'S04')).toBe(true);

    const twoParams = runStaticChecks(makeSource({ observe: '(a, b) => ({ a, b })' }), 'demo-exp');
    expect(twoParams.errors.some((e) => e.code === 'S04')).toBe(true);
  });

  it('S05: rejects free identifiers such as document or helper, allows ctx and whitelisted globals', () => {
    const docRes = runStaticChecks(makeSource({ observe: '(ctx) => document.title' }), 'demo-exp');
    expect(docRes.errors.some((e) => e.code === 'S05' && e.message.includes('"document"'))).toBe(true);

    const helperRes = runStaticChecks(makeSource({ observe: '(ctx) => helper(ctx)' }), 'demo-exp');
    expect(helperRes.errors.some((e) => e.code === 'S05' && e.message.includes('"helper"'))).toBe(true);

    const ok = runStaticChecks(
      makeSource({
        observe: '(ctx) => { const el = ctx.doc.body; return Math.round(el.clientWidth); }',
      }),
      'demo-exp'
    );
    expect(ok.errors).toEqual([]);
  });

  it('S06: rejects non-deterministic or forbidden APIs, allows performance in measured and ctx.win.setTimeout', () => {
    const rand = runStaticChecks(makeSource({ observe: '(ctx) => Math.random()' }), 'demo-exp');
    expect(rand.errors.some((e) => e.code === 'S06' && e.message.includes('.random'))).toBe(true);

    const date = runStaticChecks(makeSource({ observe: '(ctx) => new Date().getTime()' }), 'demo-exp');
    expect(date.errors.some((e) => e.code === 'S06' && e.message.includes('"Date"'))).toBe(true);

    const winDate = runStaticChecks(makeSource({ observe: '(ctx) => new ctx.win.Date().getTime()' }), 'demo-exp');
    expect(winDate.errors.some((e) => e.code === 'S06' && e.message.includes('.Date'))).toBe(true);

    const winFetch = runStaticChecks(makeSource({ observe: "(ctx) => ctx.win.fetch('/x')" }), 'demo-exp');
    expect(winFetch.errors.some((e) => e.code === 'S06' && e.message.includes('.fetch'))).toBe(true);

    const perfFixture = runStaticChecks(
      makeSource({ observe: '(ctx) => performance.now()' }),
      'demo-exp'
    );
    expect(perfFixture.errors.some((e) => e.code === 'S06')).toBe(true);

    const perfMeasured = runStaticChecks(
      makeSource({
        kind: `'measured'`,
        observe: '(ctx) => performance.now()',
        expect: `{ 'case-a': { treatment: null, control: null } }`,
        extra: `measured: { repeat: 20, metric: 'layout-ms', minRatio: 2 },`,
      }),
      'demo-exp'
    );
    expect(perfMeasured.errors).toEqual([]);

    const timeoutOk = runStaticChecks(
      makeSource({
        observe: 'async (ctx) => { await new Promise((r) => ctx.win.setTimeout(r, 10)); return { ok: true }; }',
      }),
      'demo-exp'
    );
    expect(timeoutOk.errors).toEqual([]);
  });

  it('S07: rejects id mismatching folder name', () => {
    const res = runStaticChecks(makeSource({ id: `'other-id'` }), 'demo-exp');
    expect(res.errors.some((e) => e.code === 'S07')).toBe(true);
  });

  it('S08: requires mutation.remove to match exactly once in treatment', () => {
    const zero = runStaticChecks(
      makeSource({ mutation: `{ variant: 'treatment', remove: 'missing-snippet' }` }),
      'demo-exp'
    );
    expect(zero.errors.some((e) => e.code === 'S08' && e.message.includes('found 0 times'))).toBe(true);

    const two = runStaticChecks(
      makeSource({
        variants: `{
          treatment: { label: 'T', css: '.a { opacity: 0.5; } .b { opacity: 0.5; }' },
          control: { label: 'C' },
        }`,
      }),
      'demo-exp'
    );
    expect(two.errors.some((e) => e.code === 'S08' && e.message.includes('found 2 times'))).toBe(true);
  });

  it('S09: requires at least one differing expect case unless kind is measured', () => {
    const same = runStaticChecks(
      makeSource({
        expect: `{ 'case-a': { treatment: { a: 1, b: 2 }, control: { b: 2, a: 1 } } }`,
      }),
      'demo-exp'
    );
    expect(same.errors.some((e) => e.code === 'S09')).toBe(true);

    const oneDiff = runStaticChecks(
      makeSource({
        expect: `{
          'case-a': { treatment: { a: 1 }, control: { a: 1 } },
          'case-b': { treatment: { a: 2 }, control: { a: 1 } },
        }`,
      }),
      'demo-exp'
    );
    expect(oneDiff.errors).toEqual([]);
  });

  it('S10: validates expect params against param definitions', () => {
    const unknown = runStaticChecks(
      makeSource({ expect: `{ 'case-a': { params: { nope: 1 }, treatment: 1, control: 2 } }` }),
      'demo-exp'
    );
    expect(unknown.errors.some((e) => e.code === 'S10')).toBe(true);

    const outOfRange = runStaticChecks(
      makeSource({ expect: `{ 'case-a': { params: { w: 999 }, treatment: 1, control: 2 } }` }),
      'demo-exp'
    );
    expect(outOfRange.errors.some((e) => e.code === 'S10')).toBe(true);

    const badOption = runStaticChecks(
      makeSource({
        params: `{ mode: { kind: 'select', label: 'Mode', options: ['a', 'b'], default: 'a' } }`,
        expect: `{ 'case-a': { params: { mode: 'c' }, treatment: 1, control: 2 } }`,
      }),
      'demo-exp'
    );
    expect(badOption.errors.some((e) => e.code === 'S10')).toBe(true);
  });

  it('S11, S12, S13: enforces kind consistency and trace/console reads', () => {
    const badMeasured = runStaticChecks(
      makeSource({
        kind: `'measured'`,
        expect: `{ 'case-a': { treatment: null, control: null } }`,
      }),
      'demo-exp'
    );
    expect(badMeasured.errors.some((e) => e.code === 'S11')).toBe(true);

    const badNetwork = runStaticChecks(makeSource({ kind: `'network'` }), 'demo-exp');
    expect(badNetwork.errors.some((e) => e.code === 'S12')).toBe(true);

    const badTrace = runStaticChecks(
      makeSource({ kind: `'trace'`, observe: '(ctx) => ({ ok: ctx.doc.title })' }),
      'demo-exp'
    );
    expect(badTrace.errors.some((e) => e.code === 'S13')).toBe(true);

    const badConsole = runStaticChecks(
      makeSource({ kind: `'console'`, observe: '(ctx) => ({ ok: ctx.doc.title })' }),
      'demo-exp'
    );
    expect(badConsole.errors.some((e) => e.code === 'S13')).toBe(true);
  });

  it('S14: rejects external resources while allowing __origins.cross and XML namespace URIs', () => {
    const scriptTag = runStaticChecks(
      makeSource({ fixture: `{ html: '<script src="x.js"></script>' }` }),
      'demo-exp'
    );
    expect(scriptTag.errors.some((e) => e.code === 'S14')).toBe(true);

    const absFetch = runStaticChecks(
      makeSource({ fixture: `{ html: '<p>a</p>', js: "fetch('https://example.com/a');" }` }),
      'demo-exp'
    );
    expect(absFetch.errors.some((e) => e.code === 'S14')).toBe(true);

    const originsOk = runStaticChecks(
      makeSource({
        fixture: `{ html: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', js: "fetch(window.__origins.cross + '/a'); document.createElementNS('http://www.w3.org/2000/svg', 'rect');" }`,
      }),
      'demo-exp'
    );
    expect(originsOk.errors.some((e) => e.code === 'S14')).toBe(false);
  });

  it('S15: rejects fixtures exceeding 20,000 characters', () => {
    const big = runStaticChecks(
      makeSource({ fixture: `{ html: '${'a'.repeat(20_001)}' }` }),
      'demo-exp'
    );
    expect(big.errors.some((e) => e.code === 'S15')).toBe(true);
  });

  it('S17: allows performance in present, rejects free globals in present', () => {
    const ok = runStaticChecks(
      makeSource({ present: '(ctx) => ({ t: performance.now(), n: ctx.doc.body.childElementCount })' }),
      'demo-exp'
    );
    expect(ok.errors).toEqual([]);

    const bad = runStaticChecks(makeSource({ present: '(ctx) => document.title' }), 'demo-exp');
    expect(bad.errors.some((e) => e.code === 'S17')).toBe(true);
  });

  it('S18 & S19: requires host origin for storage APIs and serviceWorker', () => {
    const idbFail = runStaticChecks(
      makeSource({ fixture: `{ html: '<p>idb</p>', js: "indexedDB.open('db');" }` }),
      'demo-exp'
    );
    expect(idbFail.errors.some((e) => e.code === 'S18')).toBe(true);

    const idbOk = runStaticChecks(
      makeSource({
        fixture: `{ html: '<p>idb</p>', js: "indexedDB.open('db');" }`,
        extra: `host: 'origin',`,
      }),
      'demo-exp'
    );
    expect(idbOk.errors).toEqual([]);

    const swFail = runStaticChecks(
      makeSource({ extra: `serviceWorker: "self.addEventListener('install', () => {})",` }),
      'demo-exp'
    );
    expect(swFail.errors.some((e) => e.code === 'S19')).toBe(true);
  });

  it('S20 & S21: validates input selectors against HTML and forbids input with network server or measured', () => {
    const ok = runStaticChecks(
      makeSource({
        variants: `{
          treatment: { label: 'T', css: '.box { opacity: 0.5; }', input: [{ action: 'click', selector: '#go' }] },
          control: { label: 'C' },
        }`,
      }),
      'demo-exp'
    );
    expect(ok.errors).toEqual([]);

    const missingSel = runStaticChecks(
      makeSource({
        variants: `{
          treatment: { label: 'T', css: '.box { opacity: 0.5; }', input: [{ action: 'click', selector: '#absent' }] },
          control: { label: 'C' },
        }`,
      }),
      'demo-exp'
    );
    expect(missingSel.errors.some((e) => e.code === 'S20')).toBe(true);

    const serverInput = runStaticChecks(
      makeSource({
        kind: `'network'`,
        variants: `{
          treatment: { label: 'T', css: '.box { opacity: 0.5; }', input: [{ action: 'click', selector: '#go' }] },
          control: { label: 'C' },
        }`,
        extra: `network: { mode: 'server', routes: [{ id: 'r1', origin: 'self', method: 'GET', path: '/a', status: 200 }] },`,
      }),
      'demo-exp'
    );
    expect(serverInput.errors.some((e) => e.code === 'S21')).toBe(true);
  });
});
