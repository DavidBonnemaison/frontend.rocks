import type { RunVariant } from '../define-experiment';
import type { ExperimentBundle } from '../experiment-schema';
import { composeSources, paramsToCss, resolveParams, type ParamValues } from './compose';
import { CHANNEL, PRESENT_MAX_CHARS, type FrameConfig } from './protocol';
import { BOOTSTRAP_JS } from './bootstrap-source';
import { NETWORK_SHIM_JS } from './network-shim-source';
import { jsonForScript, sanitizeScriptContent, sanitizeStyleContent } from './sanitize';

export const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 16px/1.5 system-ui, sans-serif; background: #ffffff; color: #111111; }`;

export const SHIM_ORIGINS = { self: '', cross: 'https://cross.test' } as const;

export interface DocumentOptions {
  runId: string;
  standalone?: boolean;
  mutated?: boolean;
  origins?: { self: string; cross: string };
  /** Origin of the parent page, or null/omitted in standalone mode. */
  parentOrigin?: string | null;
  /** True when the caller will replay variant input steps. */
  awaitInput?: boolean;
  /** Absolute base URL from which /vendor/react.js is loaded when bundle.vendor is set. */
  vendorBaseUrl?: string;
  /** Optional CSP nonce applied to generated <script> tags. */
  nonce?: string;
}

export function buildExperimentDocument(
  bundle: ExperimentBundle,
  variant: RunVariant,
  params: ParamValues,
  options: DocumentOptions
): string {
  const values = resolveParams(bundle, params);
  const sources = composeSources(bundle, variant, options.mutated ?? false);
  const variantInput = variant === 'blank' ? undefined : bundle.variants[variant].input;
  const config: FrameConfig & { presentMaxChars: number } = {
    channel: CHANNEL,
    runId: options.runId,
    kind: bundle.kind,
    params: values,
    origins: options.origins ?? SHIM_ORIGINS,
    network: bundle.network && variant !== 'blank' ? bundle.network : null,
    standalone: options.standalone ?? false,
    parentOrigin: options.parentOrigin ?? null,
    awaitInput: Boolean(options.awaitInput && variantInput && variantInput.length > 0),
    presentMaxChars: PRESENT_MAX_CHARS,
  };
  const nonceAttr = options.nonce ? ` nonce="${options.nonce.replace(/[^A-Za-z0-9+/=]/g, '')}"` : '';
  const shim = config.network?.mode === 'shim' ? `<script${nonceAttr}>${NETWORK_SHIM_JS}</script>` : '';

  let vendor = '';
  if (bundle.vendor?.length && variant !== 'blank') {
    if (!options.vendorBaseUrl) {
      throw new Error('FR_VENDOR_BASE_MISSING: this experiment needs vendorBaseUrl');
    }
    // Classic synchronous <script> (not type="module") so globals exist before the fixture runs.
    vendor = `<script${nonceAttr} src="${options.vendorBaseUrl.replace(/\/$/, '').replace(/"/g, '')}/vendor/react.js"></script>`;
  }

  const fixtureScript = sources.js
    ? `<script${nonceAttr}>\ntry {\n${sanitizeScriptContent(sources.js)}\n} catch (e) { console.error('fixture-error: ' + (e && e.message ? e.message : e)); }\n</script>`
    : '';
  const present = bundle.presentSource
    ? `<script${nonceAttr}>window.__frPresent = (${sanitizeScriptContent(bundle.presentSource)});</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script${nonceAttr}>window.__frConfig = ${jsonForScript(config)};</script>
<script${nonceAttr}>${BOOTSTRAP_JS}</script>
${shim}
<style>
${BASE_CSS}
${paramsToCss(bundle, values)}
${sanitizeStyleContent(sources.css)}
</style>
</head>
<body>
${sources.html}
${vendor}
${fixtureScript}
<script${nonceAttr}>window.__frObserve = (${sanitizeScriptContent(bundle.observeSource)});</script>
${present}
</body>
</html>`;
}
