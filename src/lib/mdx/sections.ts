// Generic MDX reading helpers. No style rules here: this module is public.

export function extractSectionText(body: string, headingRegex: RegExp): string {
  const lines = body.split(/\r?\n/);
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capturing) break;
      if (headingRegex.test(line)) {
        capturing = true;
        continue;
      }
    } else if (capturing) {
      captured.push(line);
    }
  }

  return captured.join('\n').trim();
}

export function extractInlineConceptLinks(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const nonCodeLines: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (!inCode) {
      nonCodeLines.push(line);
    }
  }

  const text = nonCodeLines.join('\n');
  const slugs: string[] = [];
  const regex = /\[[^\]]+\]\(\/concepts\/([a-z0-9-]+)(?:#[a-z0-9-]+)?\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    slugs.push(match[1]);
  }
  return slugs;
}
