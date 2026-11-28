import { stripFencedCodeBlocks } from '@/lib/validators/autopsy-validator';

const WORDS_PER_MINUTE = 230;

/**
 * Computes estimated reading time in minutes from MDX prose,
 * excluding fenced code blocks. Always returns at least 1.
 */
export function computeReadingMinutes(mdx: string): number {
  const withoutCode = stripFencedCodeBlocks(mdx);
  const words = withoutCode
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_#[\]()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
