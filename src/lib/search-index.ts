import {
  getAllAutopsies,
  getAllConcepts,
  getAllDigests,
  getAllLabs,
  type LoadedAutopsy,
  type LoadedConcept,
} from './content-loader';
import { PRODUCTION_SYMPTOMS, type ProductionSymptomConfig } from '../config/symptoms';
import { formatFailureModeLabel } from './ui-strings';
import { extractVsPairs, type VsPair } from './vs-pairs';
import type { SearchItem } from './search';

export interface ResolvedLabParent {
  kind: 'concept' | 'autopsy';
  id: string;
  href: string;
  label: string;
}

export function resolveLabParent(
  labId: string,
  conceptsInput?: LoadedConcept[],
  autopsiesInput?: LoadedAutopsy[]
): ResolvedLabParent | null {
  const concepts = conceptsInput ?? getAllConcepts();
  const concept = concepts.find((c) => (c.frontmatter.lab_id ?? c.frontmatter.id) === labId);
  if (concept) {
    return {
      kind: 'concept',
      id: concept.frontmatter.id,
      href: `/concepts/${concept.frontmatter.id}/#lab`,
      label: concept.frontmatter.title,
    };
  }

  const autopsies = autopsiesInput ?? getAllAutopsies();
  const autopsy = autopsies.find((a) => (a.frontmatter.lab_id ?? a.frontmatter.id) === labId);
  if (autopsy) {
    return {
      kind: 'autopsy',
      id: autopsy.frontmatter.id,
      href: `/autopsies/${autopsy.frontmatter.id}/#failure-simulator`,
      label: autopsy.frontmatter.title,
    };
  }

  return null;
}

export interface BuildSearchIndexOptions {
  includeStaticPages?: boolean;
  /** Replace the corresponding loader call (used to pass only published content). */
  conceptsInput?: LoadedConcept[];
  autopsiesInput?: LoadedAutopsy[];
  symptomsInput?: ProductionSymptomConfig[];
  vsPairsInput?: VsPair[];
  /** Default true. */
  includeDigests?: boolean;
}

export function buildStaticSearchEntries(): SearchItem[] {
  return [
    {
      kind: 'agent',
      id: 'agents-ecosystem',
      title: 'AI Agents, Audit Skill & MCP Server',
      subtitle:
        'Install frontend-rocks-audit, connect @frontend-rocks/mcp in Cursor, Claude Code, or Antigravity, and consume llms.txt & audit-rules.json.',
      href: '/agents/',
      keywords:
        'agents mcp skill audit llms.txt llms-full.txt graph.json audit-rules.json cursor claude antigravity frontend-rocks-audit @frontend-rocks/mcp',
      searchText:
        'agents mcp server skill audit frontend-rocks-audit @frontend-rocks/mcp llms.txt llms-full.txt graph.json audit-rules.json cursor claude code antigravity diagnose_symptom get_concept_internals check_pattern_obsolescence find_related_autopsy markdown twins',
      badge: 'Agents · MCP',
    },
  ];
}

export function buildSearchIndex(options: BuildSearchIndexOptions = {}): SearchItem[] {
  const concepts = options.conceptsInput ?? getAllConcepts();
  const autopsies = options.autopsiesInput ?? getAllAutopsies();
  const symptoms = options.symptomsInput ?? PRODUCTION_SYMPTOMS;
  const labs = getAllLabs();
  const digests = options.includeDigests === false ? [] : getAllDigests();
  const vsPairs = options.vsPairsInput ?? extractVsPairs(concepts, autopsies);

  const items: SearchItem[] = [];

  for (const a of autopsies) {
    const traversedIds = a.frontmatter.traversed_concepts.map((tc) => tc.concept_id).join(' ');
    const failureLabel = formatFailureModeLabel(a.frontmatter.failure_mode);
    const cf = a.frontmatter.case_file;
    const keywords = `${a.frontmatter.failure_mode} ${failureLabel} ${cf.how_to_spot} ${traversedIds}`;

    items.push({
      kind: 'autopsy',
      id: a.frontmatter.id,
      title: a.frontmatter.title,
      subtitle: a.frontmatter.symptom,
      href: `/autopsies/${a.frontmatter.id}/`,
      keywords,
      searchText:
        `${a.frontmatter.id} ${a.frontmatter.title} ${a.frontmatter.symptom} ${keywords} ${cf.trigger} ${cf.root_cause} ${cf.fix}`.toLowerCase(),
      badge: `Autopsy #${String(a.frontmatter.case_number).padStart(2, '0')}`,
    });
  }

  for (const s of symptoms) {
    const keywords = `${s.devtools_signature} ${s.slug}`;
    items.push({
      kind: 'symptom',
      id: s.slug,
      title: s.search_title,
      subtitle: s.summary,
      href: `/symptoms/${s.slug}/`,
      keywords,
      searchText:
        `${s.slug} ${s.search_title} ${s.devtools_signature} ${s.summary} ${s.concept_ids.join(' ')} ${s.autopsy_ids.join(' ')}`.toLowerCase(),
      badge: 'Symptom',
    });
  }

  for (const c of concepts) {
    const kw = c.frontmatter.keywords?.join(' ') ?? '';
    items.push({
      kind: 'concept',
      id: c.frontmatter.id,
      title: c.frontmatter.title,
      subtitle: c.frontmatter.summary_tldr,
      href: `/concepts/${c.frontmatter.id}/`,
      keywords: kw,
      searchText:
        `${c.frontmatter.id} ${c.frontmatter.title} ${c.frontmatter.summary_tldr} ${c.frontmatter.domain} ${kw}`.toLowerCase(),
      badge: 'Concept',
    });
  }

  const publishedConceptIds = new Set(concepts.map((c) => c.frontmatter.id));
  const publishedAutopsyIds = new Set(autopsies.map((a) => a.frontmatter.id));
  const filtered = options.conceptsInput !== undefined || options.autopsiesInput !== undefined;

  for (const l of labs) {
    const parent = resolveLabParent(l.id, concepts, autopsies);
    if (!parent) {
      // With filtered inputs, the parent may simply be unpublished: skip the lab.
      if (filtered) continue;
      throw new Error(`Orphan lab "${l.id}" has no matching concept or autopsy parent.`);
    }
    const parentPublished =
      parent.kind === 'concept'
        ? publishedConceptIds.has(parent.id)
        : publishedAutopsyIds.has(parent.id);
    if (!parentPublished) continue;
    const keywords = `${l.type} ${parent.id}`;
    items.push({
      kind: 'lab',
      id: l.id,
      title: l.title,
      subtitle: l.description ?? l.type,
      href: parent.href,
      keywords,
      searchText:
        `${l.id} ${l.title} ${l.type} ${l.description ?? ''} ${parent.label} ${parent.id}`.toLowerCase(),
      badge: `Lab · ${l.type}`,
    });
  }

  for (const pair of vsPairs) {
    const title = `${pair.primary.frontmatter.title} vs ${pair.secondary.frontmatter.title}`;
    const keywords = `${pair.primary.frontmatter.id} ${pair.secondary.frontmatter.id} vs compare ${pair.relationType}`;
    items.push({
      kind: 'vs',
      id: pair.slug,
      title,
      subtitle: pair.note,
      href: `/vs/${pair.slug}/`,
      keywords,
      searchText:
        `${pair.slug} ${title} ${pair.note} ${pair.primary.frontmatter.summary_tldr} ${pair.secondary.frontmatter.summary_tldr}`.toLowerCase(),
      badge: 'Comparison',
    });
  }

  for (const d of digests) {
    for (const e of d.entries) {
      const keywords = `${e.category} ${e.related_concepts.join(' ')}`;
      items.push({
        kind: 'digest',
        id: `${d.id}-${e.title}`,
        title: e.title,
        subtitle: e.editorial_take,
        href: '/digest/',
        keywords,
        searchText:
          `${d.id} ${d.title} ${e.title} ${e.editorial_take} ${keywords}`.toLowerCase(),
        badge: `Digest · ${d.id}`,
      });
    }
  }

  if (options.includeStaticPages) {
    items.push(...buildStaticSearchEntries());
  }

  return items;
}
