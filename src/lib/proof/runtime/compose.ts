import type { ExperimentBundle } from '../experiment-schema';
import type { RunVariant } from '../define-experiment';

export type ParamValues = Record<string, number | boolean | string>;

export function resolveParams(bundle: ExperimentBundle, provided: ParamValues = {}): ParamValues {
  const out: ParamValues = {};
  for (const [name, def] of Object.entries(bundle.params)) {
    const value = name in provided ? provided[name] : def.default;
    if (def.kind === 'range') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < def.min || value > def.max) {
        throw new Error(`param "${name}" out of range: ${String(value)}`);
      }
    } else if (def.kind === 'toggle') {
      if (typeof value !== 'boolean') {
        throw new Error(`param "${name}" must be boolean`);
      }
    } else if (typeof value !== 'string' || !def.options.includes(value)) {
      throw new Error(`param "${name}" must be one of ${def.options.join(', ')}`);
    }
    out[name] = value;
  }
  for (const name of Object.keys(provided)) {
    if (!(name in bundle.params)) {
      throw new Error(`unknown param "${name}"`);
    }
  }
  return out;
}

export function paramsToCss(bundle: ExperimentBundle, values: ParamValues): string {
  const lines = Object.entries(bundle.params).map(([name, def]) => {
    const v = values[name];
    const formatted =
      def.kind === 'range'
        ? `${v}${def.unit ?? ''}`
        : def.kind === 'toggle'
          ? v
            ? '1'
            : '0'
          : String(v);
    return `  --${name}: ${formatted};`;
  });
  return lines.length ? `:root {\n${lines.join('\n')}\n}` : '';
}

function insertAt(base: string, marker: string, insert: string | undefined): string {
  // Use a replacement callback so special patterns like $&, $', or $$ are inserted verbatim.
  if (base.includes(marker)) return base.replace(marker, () => insert ?? '');
  return insert ? `${base}\n${insert}` : base;
}

export interface ComposedSources {
  html: string;
  css: string;
  js: string;
}

export function composeSources(
  bundle: ExperimentBundle,
  variant: RunVariant,
  mutated = false
): ComposedSources {
  if (variant === 'blank') return { html: '', css: '', js: '' };
  if (mutated && variant !== 'treatment') {
    throw new Error('mutation only applies to the treatment variant');
  }
  const v = { ...bundle.variants[variant] };
  if (mutated) {
    const remove = bundle.mutation.remove;
    const part = (['html', 'css', 'js'] as const).find((p) => (v[p] ?? '').includes(remove));
    if (!part) throw new Error('mutation.remove not found in treatment');
    v[part] = (v[part] as string).replace(remove, () => '');
  }
  return {
    html: insertAt(bundle.fixture.html, '<!--@variant-->', v.html),
    css: [bundle.fixture.css ?? '', v.css ?? ''].filter(Boolean).join('\n'),
    js: insertAt(bundle.fixture.js ?? '', '/*@variant*/', v.js),
  };
}
