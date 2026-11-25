import { parse, type Node } from 'acorn';
import { analyze } from 'eslint-scope';
import { transformSync } from 'esbuild';
import type { Json } from './define-experiment';
import { canonicalJson } from './runtime/canonical-json';

export interface StaticCheckError {
  code: string;
  message: string;
}

export const OBSERVE_ALLOWED_GLOBALS = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'Math',
  'JSON',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'Promise',
  'Set',
  'Map',
  'WeakMap',
  'WeakSet',
  'Symbol',
  'Error',
  'TypeError',
  'RangeError',
  'RegExp',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
]);

const FORBIDDEN_IDENTIFIERS = new Set(['Date', 'eval', 'Function']);

/**
 * Names forbidden as property accesses in observe (S06), e.g. `ctx.win.Date`, `x.fetch`.
 * `performance` is allowed only for kind 'measured' and for `present`.
 * `setTimeout` stays allowed through `ctx.win.setTimeout`.
 */
const FORBIDDEN_MEMBERS = new Set([
  'Date',
  'eval',
  'Function',
  'random',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'crypto',
  'sendBeacon',
  'performance',
]);

const STORAGE_APIS = new Set([
  'indexedDB',
  'locks',
  'BroadcastChannel',
  'getDirectory',
  'serviceWorker',
]);

const XML_NAMESPACE_URIS = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
];

const EXTERNAL_RESOURCE_PATTERNS = [
  /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i,
  /<script/i,
  /<link/i,
  /@import/i,
  /url\(\s*['"]?https?:/i,
];

const MAX_FIXTURE_CHARS = 20_000;

type AstNode = Node & Record<string, unknown>;

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Generic ESTree AST walker. */
export function walk(
  node: AstNode,
  visit: (n: AstNode, parent: AstNode | null) => void,
  parent: AstNode | null = null
): void {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isAstNode(child)) walk(child, visit, node);
      }
    } else if (isAstNode(value)) {
      walk(value, visit, node);
    }
  }
}

/**
 * Transpiles TS to JS without executing the code.
 * `verbatimModuleSyntax` keeps unused imports so S01 catches forbidden imports.
 * `format` is intentionally omitted: `format: 'esm'` rewrites `export default`
 * into a temporary `stdin_default` variable that breaks S02.
 */
export function transpileExperimentSource(tsSource: string): string {
  return transformSync(tsSource, {
    loader: 'ts',
    target: 'es2022',
    keepNames: false,
    minify: false,
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
  }).code;
}

export class StaticLiteralError extends Error {}

export function evaluateStaticLiteral(node: AstNode, path: string): unknown {
  switch (node.type) {
    case 'Literal':
      if (node.regex || typeof node.value === 'bigint') throw new StaticLiteralError(path);
      return node.value;
    case 'TemplateLiteral': {
      const expressions = node.expressions as unknown[];
      if (expressions.length > 0) throw new StaticLiteralError(path);
      const quasis = node.quasis as Array<{ value: { cooked: string | null } }>;
      return quasis.map((q) => q.value.cooked ?? '').join('');
    }
    case 'UnaryExpression': {
      const argument = node.argument as AstNode;
      if (node.operator === '-' && argument.type === 'Literal' && typeof argument.value === 'number') {
        return -argument.value;
      }
      throw new StaticLiteralError(path);
    }
    case 'ArrayExpression': {
      const elements = node.elements as Array<AstNode | null>;
      return elements.map((el, i) => {
        if (!el || el.type === 'SpreadElement') throw new StaticLiteralError(`${path}[${i}]`);
        return evaluateStaticLiteral(el, `${path}[${i}]`);
      });
    }
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      const properties = node.properties as AstNode[];
      for (const prop of properties) {
        if (prop.type !== 'Property' || prop.computed || prop.kind !== 'init' || prop.method) {
          throw new StaticLiteralError(path);
        }
        const propKey = prop.key as AstNode;
        const key = propKey.type === 'Identifier' ? String(propKey.name) : String(propKey.value);
        out[key] = evaluateStaticLiteral(prop.value as AstNode, path ? `${path}.${key}` : key);
      }
      return out;
    }
    default:
      throw new StaticLiteralError(path);
  }
}

export interface ExtractedExperiment {
  data: Record<string, unknown>;
  observeSource: string;
  presentSource: string | null;
  errors: StaticCheckError[];
}

const FUNCTION_KEYS = new Set(['observe', 'present']);

/** Rules S01 through S04: inspects an experiment module without executing it. */
export function extractExperiment(tsSource: string): ExtractedExperiment {
  const errors: StaticCheckError[] = [];

  // S01 raw source check: strip template literals so `import` lines inside fixture JS strings are ignored.
  const withoutTemplates = tsSource.replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');
  const rawImports = withoutTemplates.match(/^\s*import\s/gm)?.length ?? 0;
  if (rawImports !== 1) {
    errors.push({
      code: 'S01',
      message: `S01 expected exactly one import statement, found ${rawImports}`,
    });
  }

  let js: string;
  let program: AstNode;
  try {
    js = transpileExperimentSource(tsSource);
    program = parse(js, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as AstNode;
  } catch (err) {
    errors.push({
      code: 'S02',
      message: `S02 failed to parse experiment source: ${(err as Error).message}`,
    });
    return { data: {}, observeSource: '', presentSource: null, errors };
  }

  let call: AstNode | null = null;
  for (const stmt of program.body as AstNode[]) {
    if (stmt.type === 'ImportDeclaration') {
      const source = stmt.source as AstNode;
      const specifiers = stmt.specifiers as AstNode[];
      const firstSpec = specifiers[0];
      const imported = firstSpec?.imported as AstNode | undefined;
      const ok =
        source.value === '@/lib/proof/define-experiment' &&
        specifiers.length === 1 &&
        firstSpec?.type === 'ImportSpecifier' &&
        imported?.name === 'defineExperiment';
      if (!ok) {
        errors.push({ code: 'S01', message: `S01 forbidden import "${String(source.value)}"` });
      }
    } else if (
      stmt.type === 'ExportDefaultDeclaration' &&
      isAstNode(stmt.declaration) &&
      stmt.declaration.type === 'CallExpression' &&
      isAstNode(stmt.declaration.callee) &&
      stmt.declaration.callee.type === 'Identifier' &&
      stmt.declaration.callee.name === 'defineExperiment' &&
      Array.isArray(stmt.declaration.arguments) &&
      stmt.declaration.arguments.length === 1 &&
      isAstNode(stmt.declaration.arguments[0]) &&
      stmt.declaration.arguments[0].type === 'ObjectExpression'
    ) {
      call = stmt.declaration;
    } else {
      errors.push({ code: 'S02', message: 'S02 unexpected top-level statement' });
    }
  }

  if (!call) {
    errors.push({ code: 'S02', message: 'S02 missing "export default defineExperiment({...})"' });
    return { data: {}, observeSource: '', presentSource: null, errors };
  }

  const data: Record<string, unknown> = {};
  const fnSources: Record<string, string> = {};
  const argObj = (call.arguments as AstNode[])[0];
  for (const prop of argObj.properties as AstNode[]) {
    if (prop.type !== 'Property' || prop.computed) {
      errors.push({ code: 'S03', message: 'S03 spread or computed key in experiment definition' });
      continue;
    }
    const propKey = prop.key as AstNode;
    const key = propKey.type === 'Identifier' ? String(propKey.name) : String(propKey.value);
    if (FUNCTION_KEYS.has(key)) {
      const fn = prop.value as AstNode;
      const isFn = fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression';
      const params = Array.isArray(fn.params) ? fn.params : [];
      if (!isFn || prop.method || params.length > 1) {
        const errCode = key === 'present' ? 'S17' : 'S04';
        errors.push({
          code: errCode,
          message: `${errCode} ${key} must be an arrow function with at most one parameter`,
        });
        continue;
      }
      fnSources[key] = js.slice(fn.start, fn.end);
      continue;
    }
    try {
      data[key] = evaluateStaticLiteral(prop.value as AstNode, key);
    } catch (err) {
      const where = err instanceof StaticLiteralError ? err.message : key;
      errors.push({ code: 'S03', message: `S03 property "${where}" must be a static literal` });
    }
  }

  if (!fnSources.observe) {
    errors.push({ code: 'S04', message: 'S04 observe is missing' });
  }
  return {
    data,
    observeSource: fnSources.observe ?? '',
    presentSource: fnSources.present ?? null,
    errors,
  };
}

/**
 * Rules S05, S06, S13 (observe) and S17 (present).
 * `role: 'present'` allows `performance` and skips S13.
 */
export function checkFunctionSource(
  source: string,
  kind: string,
  role: 'observe' | 'present' = 'observe'
): StaticCheckError[] {
  const errors: StaticCheckError[] = [];
  const code = role === 'observe' ? 'S06' : 'S17';
  const performanceAllowed = kind === 'measured' || role === 'present';
  let ast: AstNode;
  try {
    // `ranges: true` is required because eslint-scope reads `node.range`.
    ast = parse(`(${source})`, { ecmaVersion: 'latest', sourceType: 'script', ranges: true }) as unknown as AstNode;
  } catch (err) {
    const parseCode = role === 'observe' ? 'S04' : 'S17';
    return [{ code: parseCode, message: `${parseCode} ${role} does not parse: ${(err as Error).message}` }];
  }

  const scope = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  const free = new Set((scope.globalScope?.through ?? []).map((r) => r.identifier.name));
  for (const name of free) {
    if (name === 'performance' && performanceAllowed) continue;
    if (FORBIDDEN_IDENTIFIERS.has(name) || name === 'performance') {
      errors.push({
        code,
        message: `${code} ${role} uses non-deterministic or forbidden API "${name}"`,
      });
    } else if (!OBSERVE_ALLOWED_GLOBALS.has(name)) {
      const freeCode = role === 'observe' ? 'S05' : 'S17';
      errors.push({
        code: freeCode,
        message: `${freeCode} ${role} references free identifier "${name}"`,
      });
    }
  }

  let readsTrace = false;
  let readsConsole = false;
  walk(ast, (n) => {
    if (n.type === 'ImportExpression') {
      errors.push({
        code,
        message: `${code} ${role} uses non-deterministic or forbidden API "import()"`,
      });
    }
    if (
      n.type === 'MemberExpression' &&
      !n.computed &&
      isAstNode(n.property) &&
      n.property.type === 'Identifier'
    ) {
      const prop = String(n.property.name);
      if (prop === 'trace') readsTrace = true;
      if (prop === 'console') readsConsole = true;
      if (FORBIDDEN_MEMBERS.has(prop) && !(prop === 'performance' && performanceAllowed)) {
        errors.push({
          code,
          message: `${code} ${role} uses non-deterministic or forbidden API ".${prop}"`,
        });
      }
    }
  });

  if (role === 'observe') {
    if (kind === 'trace' && !readsTrace) {
      errors.push({ code: 'S13', message: 'S13 observe must read ctx.trace for kind trace' });
    }
    if (kind === 'console' && !readsConsole) {
      errors.push({ code: 'S13', message: 'S13 observe must read ctx.console for kind console' });
    }
  }
  return errors;
}

export const checkObserveSource = (source: string, kind: string): StaticCheckError[] =>
  checkFunctionSource(source, kind, 'observe');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorMatchesHtml(selector: string, html: string): boolean {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(id)}["']`).test(html);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    const classAttrs = html.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g);
    for (const match of classAttrs) {
      const tokens = (match[1] ?? match[2] ?? '').trim().split(/\s+/);
      if (tokens.includes(cls)) return true;
    }
    return false;
  }
  const probeMatch = selector.match(/^\[data-probe="([a-z0-9-]+)"\]$/);
  if (probeMatch) {
    return html.includes(`data-probe="${probeMatch[1]}"`);
  }
  return new RegExp(`<${escapeRegExp(selector)}[\\s>/]`, 'i').test(html);
}

function findStorageApisInJs(jsCode: string, wrapAsExpr = false): Set<string> {
  const found = new Set<string>();
  if (!jsCode.trim()) return found;
  try {
    const source = wrapAsExpr ? `(${jsCode})` : jsCode;
    const ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowReturnOutsideFunction: true,
    }) as unknown as AstNode;
    walk(ast, (n, parent) => {
      if (n.type === 'Identifier' && STORAGE_APIS.has(String(n.name))) {
        const isUncomputedMemberProp =
          parent?.type === 'MemberExpression' && !parent.computed && parent.property === n;
        const isObjectPropKey =
          parent?.type === 'Property' && !parent.computed && parent.key === n;
        if (!isUncomputedMemberProp && !isObjectPropKey) {
          found.add(String(n.name));
        }
      }
      if (
        n.type === 'MemberExpression' &&
        !n.computed &&
        isAstNode(n.property) &&
        n.property.type === 'Identifier' &&
        STORAGE_APIS.has(String(n.property.name))
      ) {
        found.add(String(n.property.name));
      }
    });
  } catch {
    const matches = jsCode.matchAll(/\b(indexedDB|locks|BroadcastChannel|getDirectory|serviceWorker)\b/g);
    for (const m of matches) {
      found.add(m[1]);
    }
  }
  return found;
}

function stripAllowedUrls(text: string, isJs: boolean): string {
  let cleaned = text;
  for (const uri of XML_NAMESPACE_URIS) {
    cleaned = cleaned.split(uri).join('');
  }
  if (isJs) {
    cleaned = cleaned.split('https://cross.test').join('');
  }
  return cleaned;
}

/** Rules S07 through S15 and S18 through S21 on the extracted static object. */
export function checkExperimentData(
  data: Record<string, unknown>,
  folderName: string,
  extra?: { observeSource?: string; presentSource?: string | null }
): StaticCheckError[] {
  const errors: StaticCheckError[] = [];
  const kind = typeof data.kind === 'string' ? data.kind : '';
  const fixture = isRecord(data.fixture) ? data.fixture : {};
  const variants = isRecord(data.variants) ? data.variants : {};
  const treatment = isRecord(variants.treatment) ? variants.treatment : {};
  const control = isRecord(variants.control) ? variants.control : {};
  const mutation = isRecord(data.mutation) ? data.mutation : {};
  const paramsDef = isRecord(data.params) ? data.params : {};
  const expectMap = isRecord(data.expect) ? data.expect : {};
  const host = typeof data.host === 'string' ? data.host : 'opaque';

  // S07: id matches folder name.
  if (typeof data.id === 'string' && data.id !== folderName) {
    errors.push({
      code: 'S07',
      message: `S07 id "${data.id}" does not match folder "${folderName}"`,
    });
  }

  // S08: mutation.remove occurs exactly once across treatment html, css, js.
  if (typeof mutation.remove === 'string' && mutation.remove.length > 0) {
    const remove = mutation.remove;
    let count = 0;
    for (const part of ['html', 'css', 'js'] as const) {
      const value = treatment[part];
      if (typeof value === 'string') {
        count += value.split(remove).length - 1;
      }
    }
    if (count !== 1) {
      errors.push({
        code: 'S08',
        message: `S08 mutation.remove found ${count} times in treatment (expected 1)`,
      });
    }
  }

  // S09: at least one expect case has different treatment and control (except measured).
  const expectEntries = Object.entries(expectMap);
  if (kind !== 'measured' && expectEntries.length > 0) {
    const anyDifferent = expectEntries.some(([, rawCase]) => {
      if (!isRecord(rawCase)) return false;
      try {
        return canonicalJson(rawCase.treatment as Json) !== canonicalJson(rawCase.control as Json);
      } catch {
        return true;
      }
    });
    if (!anyDifferent) {
      errors.push({
        code: 'S09',
        message: 'S09 every expect case has identical treatment and control',
      });
    }
  }

  // S10: expect[*].params refer to defined params and respect bounds/options.
  for (const [caseKey, rawCase] of expectEntries) {
    if (!isRecord(rawCase) || !isRecord(rawCase.params)) continue;
    for (const [paramName, paramVal] of Object.entries(rawCase.params)) {
      const def = paramsDef[paramName];
      let valid = false;
      if (isRecord(def)) {
        if (def.kind === 'range') {
          valid =
            typeof paramVal === 'number' &&
            Number.isFinite(paramVal) &&
            typeof def.min === 'number' &&
            typeof def.max === 'number' &&
            paramVal >= def.min &&
            paramVal <= def.max;
        } else if (def.kind === 'toggle') {
          valid = typeof paramVal === 'boolean';
        } else if (def.kind === 'select') {
          valid =
            typeof paramVal === 'string' &&
            Array.isArray(def.options) &&
            def.options.includes(paramVal);
        }
      }
      if (!valid) {
        errors.push({
          code: 'S10',
          message: `S10 expect "${caseKey}" uses unknown or invalid param "${paramName}"`,
        });
      }
    }
  }

  // S11: kind 'measured' <-> measured block, and null expectations.
  const hasMeasured = data.measured !== undefined;
  let measuredValid = (kind === 'measured') === hasMeasured;
  if (measuredValid && kind === 'measured') {
    for (const [, rawCase] of expectEntries) {
      if (!isRecord(rawCase) || rawCase.treatment !== null || rawCase.control !== null) {
        measuredValid = false;
        break;
      }
    }
  }
  if (!measuredValid) {
    errors.push({ code: 'S11', message: 'S11 measured block inconsistent with kind' });
  }

  // S12: kind 'network' <-> network block.
  const hasNetwork = data.network !== undefined;
  if ((kind === 'network') !== hasNetwork) {
    errors.push({ code: 'S12', message: 'S12 network block inconsistent with kind' });
  }

  // S14 & S15: no external resources and total source length <= 20,000 chars.
  const parts: Array<{ label: string; text: string; isJs: boolean }> = [
    { label: 'fixture.html', text: typeof fixture.html === 'string' ? fixture.html : '', isJs: false },
    { label: 'fixture.css', text: typeof fixture.css === 'string' ? fixture.css : '', isJs: false },
    { label: 'fixture.js', text: typeof fixture.js === 'string' ? fixture.js : '', isJs: true },
    {
      label: 'variants.treatment.html',
      text: typeof treatment.html === 'string' ? treatment.html : '',
      isJs: false,
    },
    {
      label: 'variants.treatment.css',
      text: typeof treatment.css === 'string' ? treatment.css : '',
      isJs: false,
    },
    {
      label: 'variants.treatment.js',
      text: typeof treatment.js === 'string' ? treatment.js : '',
      isJs: true,
    },
    {
      label: 'variants.control.html',
      text: typeof control.html === 'string' ? control.html : '',
      isJs: false,
    },
    {
      label: 'variants.control.css',
      text: typeof control.css === 'string' ? control.css : '',
      isJs: false,
    },
    {
      label: 'variants.control.js',
      text: typeof control.js === 'string' ? control.js : '',
      isJs: true,
    },
  ];

  let totalChars = 0;
  for (const part of parts) {
    totalChars += part.text.length;
    const cleaned = stripAllowedUrls(part.text, part.isJs);
    if (EXTERNAL_RESOURCE_PATTERNS.some((re) => re.test(cleaned))) {
      errors.push({ code: 'S14', message: `S14 external resource in ${part.label}` });
    }
  }
  if (totalChars > MAX_FIXTURE_CHARS) {
    errors.push({ code: 'S15', message: `S15 fixture too large (${totalChars} chars)` });
  }

  // S18: storage APIs require host "origin".
  if (host !== 'origin') {
    const detected = new Set<string>();
    const jsSources: Array<{ code: string; wrap: boolean }> = [
      { code: typeof fixture.js === 'string' ? fixture.js : '', wrap: false },
      { code: typeof treatment.js === 'string' ? treatment.js : '', wrap: false },
      { code: typeof control.js === 'string' ? control.js : '', wrap: false },
      { code: typeof data.serviceWorker === 'string' ? data.serviceWorker : '', wrap: false },
      { code: extra?.observeSource ?? '', wrap: true },
      { code: extra?.presentSource ?? '', wrap: true },
    ];
    for (const src of jsSources) {
      for (const api of findStorageApisInJs(src.code, src.wrap)) {
        detected.add(api);
      }
    }
    for (const api of detected) {
      errors.push({
        code: 'S18',
        message: `S18 storage API "${api}" requires host "origin"`,
      });
    }
  }

  // S19: serviceWorker requires host "origin".
  if (data.serviceWorker !== undefined && host !== 'origin') {
    errors.push({ code: 'S19', message: 'S19 serviceWorker requires host "origin"' });
  }

  // S20 & S21: variant input selectors and unsupported combinations.
  const fixtureHtml = typeof fixture.html === 'string' ? fixture.html : '';
  let hasAnyInput = false;
  for (const variant of [treatment, control]) {
    if (!Array.isArray(variant.input) || variant.input.length === 0) continue;
    hasAnyInput = true;
    const combinedHtml = `${fixtureHtml}\n${typeof variant.html === 'string' ? variant.html : ''}`;
    for (const step of variant.input) {
      if (!isRecord(step) || typeof step.selector !== 'string') continue;
      if (!selectorMatchesHtml(step.selector, combinedHtml)) {
        errors.push({
          code: 'S20',
          message: `S20 input selector "${step.selector}" matches nothing in fixture or variant html`,
        });
      }
    }
  }

  if (hasAnyInput) {
    if (isRecord(data.network) && data.network.mode === 'server') {
      errors.push({ code: 'S21', message: 'S21 input is not supported with network server' });
    }
    if (kind === 'measured') {
      errors.push({ code: 'S21', message: 'S21 input is not supported with measured' });
    }
  }

  return errors;
}

export function runStaticChecks(
  tsSource: string,
  folderName: string
): { bundleInput: Record<string, unknown> | null; errors: StaticCheckError[] } {
  const extracted = extractExperiment(tsSource);
  const errors: StaticCheckError[] = [...extracted.errors];

  const kind = typeof extracted.data.kind === 'string' ? extracted.data.kind : '';
  if (extracted.observeSource) {
    errors.push(...checkFunctionSource(extracted.observeSource, kind, 'observe'));
  }
  if (extracted.presentSource) {
    errors.push(...checkFunctionSource(extracted.presentSource, kind, 'present'));
  }

  if (Object.keys(extracted.data).length > 0) {
    errors.push(
      ...checkExperimentData(extracted.data, folderName, {
        observeSource: extracted.observeSource,
        presentSource: extracted.presentSource,
      })
    );
  }

  if (errors.length > 0) {
    return { bundleInput: null, errors };
  }

  const bundleInput: Record<string, unknown> = {
    ...extracted.data,
    observeSource: extracted.observeSource,
  };
  if (extracted.presentSource !== null) {
    bundleInput.presentSource = extracted.presentSource;
  }
  return { bundleInput, errors: [] };
}
