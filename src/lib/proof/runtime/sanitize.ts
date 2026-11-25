export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export function sanitizeScriptContent(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/** JSON injected inside a <script> tag: neutralizes "</script", "<!--", and JS line terminators. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
