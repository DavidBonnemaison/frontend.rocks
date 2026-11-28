import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { CONTENT_DIR } from '../paths';
import { SymptomFrontmatterSchema, type SymptomFrontmatter } from './schema';

export interface LoadedSymptom {
  frontmatter: SymptomFrontmatter;
  body: string;
  filePath: string;
}

let cache: { dir: string; items: LoadedSymptom[] } | null = null;

function symptomsDir(): string {
  return path.join(CONTENT_DIR, 'symptoms');
}

export function clearSymptomsCache(): void {
  cache = null;
}

export function getAllSymptoms(): LoadedSymptom[] {
  const dir = symptomsDir();
  if (cache && cache.dir === dir) return cache.items;
  if (!fs.existsSync(dir)) {
    cache = { dir, items: [] };
    return cache.items;
  }
  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort()
    .map((file) => {
      const filePath = path.join(dir, file);
      const parsed = matter(fs.readFileSync(filePath, 'utf-8'));
      const result = SymptomFrontmatterSchema.safeParse(parsed.data);
      if (!result.success) {
        throw new Error(`Schema validation failed in content/symptoms/${file}:\n${result.error.message}`);
      }
      return { frontmatter: result.data, body: parsed.content, filePath };
    });
  cache = { dir, items };
  return items;
}

export function getSymptomById(id: string): LoadedSymptom | null {
  return getAllSymptoms().find((s) => s.frontmatter.id === id) ?? null;
}

export function getFeaturedSymptoms(): LoadedSymptom[] {
  return getAllSymptoms().filter((s) => s.frontmatter.featured);
}

/** Joins the verified signature texts of a symptom, or returns an empty string while unverified. */
export function primarySignatureText(fm: Pick<SymptomFrontmatter, 'signatures'>): string {
  return fm.signatures.map((s) => s.text).join(' · ');
}
