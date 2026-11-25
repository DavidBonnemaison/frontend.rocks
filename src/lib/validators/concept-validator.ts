import matter from 'gray-matter';
import { ConceptFrontmatterFileSchema, type ConceptFrontmatter } from '../schemas';
import { extractSectionText } from '../mdx/sections';
import { withComputedMaturity } from '../proof/support/maturity';

export interface MandatorySectionDef {
  key: 'tl_dr' | 'interactive_lab' | 'under_the_hood' | 'genealogy' | 'production_pitfalls';
  headingPattern: RegExp;
  label: string;
}

export const MANDATORY_SECTIONS: MandatorySectionDef[] = [
  { key: 'tl_dr', headingPattern: /^##\s+(tl;?\s*dr|in brief)/i, label: 'TL;DR (tl_dr)' },
  {
    key: 'interactive_lab',
    headingPattern: /^##\s+interactive[_ ]lab/i,
    label: 'Interactive Lab (interactive_lab)',
  },
  {
    key: 'under_the_hood',
    headingPattern: /^##\s+under[_ ]the[_ ]hood/i,
    label: 'Under the Hood (under_the_hood)',
  },
  {
    key: 'genealogy',
    headingPattern: /^##\s+(problem[_ ])?genealogy/i,
    label: 'Problem Genealogy (genealogy)',
  },
  {
    key: 'production_pitfalls',
    headingPattern: /^##\s+production[_ ]pitfalls/i,
    label: 'Production Pitfalls (production_pitfalls)',
  },
];

export interface ConceptValidationResult {
  valid: boolean;
  frontmatter?: ConceptFrontmatter;
  body?: string;
  errors: string[];
}

export function validateConceptMdx(
  rawContent: string,
  expectedId?: string
): ConceptValidationResult {
  const errors: string[] = [];
  const parsed = matter(rawContent);

  const fmResult = ConceptFrontmatterFileSchema.safeParse(parsed.data);
  if (!fmResult.success) {
    for (const issue of fmResult.error.issues) {
      errors.push(`Frontmatter [${issue.path.join('.')}]: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const frontmatter = withComputedMaturity(fmResult.data);
  if (expectedId && frontmatter.id !== expectedId) {
    errors.push(`Filename id "${expectedId}" does not match frontmatter id "${frontmatter.id}".`);
  }

  for (const sec of MANDATORY_SECTIONS) {
    const content = extractSectionText(parsed.content, sec.headingPattern);
    if (!content || content.length < 5) {
      errors.push(`Missing or empty mandatory section: ${sec.label}`);
    }
  }

  return {
    valid: errors.length === 0,
    frontmatter,
    body: parsed.content,
    errors,
  };
}

export async function verifySourceUrls(
  urls: string[],
  timeoutMs = 6000
): Promise<Array<{ url: string; ok: boolean; status?: number; error?: string }>> {
  const results: Array<{ url: string; ok: boolean; status?: number; error?: string }> = [];

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      }
      results.push({ url, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return results;
}
