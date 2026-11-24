import { z } from 'zod';
import {
  type AuditRule,
  type FrontendRocksDataSource,
  type GraphEdge,
  type GraphNode,
  type ParsedAutopsySummary,
} from './data-source.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, ' ')
    .split(/\s+/)
    .flatMap((part) => {
      const sub = part.split(/[-_.]+/).filter((t) => t.length >= 2);
      return part.length >= 2 ? [part, ...sub] : sub;
    })
    .filter((token, idx, arr) => token.length >= 2 && arr.indexOf(token) === idx);
}

function scoreTextMatch(
  text: string,
  rawQueryLower: string,
  tokens: string[],
  exactPhraseWeight: number,
  tokenWeight: number
): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  if (rawQueryLower.length >= 3 && lower.includes(rawQueryLower)) {
    score += exactPhraseWeight;
  }
  for (const token of tokens) {
    if (lower.includes(token)) {
      score += tokenWeight;
    }
  }
  return score;
}

function conceptUrl(node: GraphNode, baseUrl: string): string {
  return node.url || `${baseUrl}/concepts/${node.id}/`;
}

function conceptLabUrl(node: GraphNode, baseUrl: string): string {
  return `${conceptUrl(node, baseUrl).replace(/\/?$/, '/')}#lab`;
}

function notAvailableMessage(id: string): string {
  return `"${id}" is not available: frontend.rocks only serves content whose claims are proven. It is unknown or still under verification.`;
}

function vsSlugForPair(a: string, b: string): string {
  return a.localeCompare(b) <= 0 ? `${a}-vs-${b}` : `${b}-vs-${a}`;
}

// ---------------------------------------------------------------------------
// 1. diagnose_symptom
// ---------------------------------------------------------------------------

export const DiagnoseSymptomInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'Production symptom, bug description, or browser behavior to diagnose (e.g. "indexeddb blocked onversionchange", "z-index 9999 tooltip clipped", "useEffect infinite loop").'
    ),
  devtools_error: z
    .string()
    .optional()
    .describe(
      'Optional raw DevTools Console error, DOMException, or HTTP/network symptom string.'
    ),
});

export type DiagnoseSymptomInput = z.infer<typeof DiagnoseSymptomInputSchema>;

export const DiagnoseSymptomOutputSchema = z.object({
  query: z.string(),
  devtools_error: z.string().optional(),
  matched_rules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      severity: z.string(),
      score: z.number(),
      trigger: z.string(),
      root_cause: z.string(),
      how_to_spot: z.string(),
      fix: z.string(),
      detection_signals: z.array(z.string()),
      canonical_urls: z.object({
        autopsies: z.array(z.string()),
        concepts: z.array(z.string()),
        symptoms: z.array(z.string()),
      }),
    })
  ),
  probable_causal_chain: z.array(
    z.object({
      concept_id: z.string(),
      title: z.string(),
      domain: z.string(),
      summary_tldr: z.string(),
      canonical_url: z.string(),
      lab_url: z.string(),
    })
  ),
  related_autopsies: z.array(
    z.object({
      id: z.string(),
      canonical_url: z.string(),
      failure_simulator_url: z.string(),
    })
  ),
  related_symptoms: z.array(
    z.object({
      slug: z.string(),
      canonical_url: z.string(),
    })
  ),
  summary: z.string(),
});

export type DiagnoseSymptomOutput = z.infer<typeof DiagnoseSymptomOutputSchema>;

function scoreAuditRule(
  rule: AuditRule,
  rawQueryLower: string,
  tokens: string[]
): number {
  let score = 0;
  score += scoreTextMatch(rule.id, rawQueryLower, tokens, 18, 5);
  score += scoreTextMatch(rule.title, rawQueryLower, tokens, 18, 6);
  score += scoreTextMatch(rule.category, rawQueryLower, tokens, 8, 2);
  score += scoreTextMatch(rule.trigger, rawQueryLower, tokens, 14, 4);
  score += scoreTextMatch(rule.root_cause, rawQueryLower, tokens, 14, 4);
  score += scoreTextMatch(rule.how_to_spot, rawQueryLower, tokens, 12, 4);
  score += scoreTextMatch(rule.fix, rawQueryLower, tokens, 10, 3);
  score += scoreTextMatch(
    rule.detection_signals.join(' '),
    rawQueryLower,
    tokens,
    14,
    4
  );
  score += scoreTextMatch(
    rule.pattern_hints.join(' '),
    rawQueryLower,
    tokens,
    16,
    5
  );
  score += scoreTextMatch(
    rule.autopsy_ids.join(' '),
    rawQueryLower,
    tokens,
    12,
    4
  );
  score += scoreTextMatch(
    rule.concept_ids.join(' '),
    rawQueryLower,
    tokens,
    10,
    3
  );
  score += scoreTextMatch(
    rule.symptom_slugs.join(' '),
    rawQueryLower,
    tokens,
    12,
    4
  );
  return score;
}

export async function diagnoseSymptom(
  dataSource: FrontendRocksDataSource,
  input: DiagnoseSymptomInput
): Promise<DiagnoseSymptomOutput> {
  const combined = [input.query, input.devtools_error ?? '']
    .join(' ')
    .trim();
  const rawQueryLower = combined.toLowerCase();
  const tokens = tokenize(combined);

  const [catalog, graph] = await Promise.all([
    dataSource.getAuditRules(),
    dataSource.getGraph(),
  ]);

  const nodeMap = new Map<string, GraphNode>(
    graph.nodes.map((node) => [node.id, node])
  );

  const scoredRules = catalog.rules
    .map((rule) => ({
      rule,
      score: scoreAuditRule(rule, rawQueryLower, tokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const matchedRules = scoredRules.map(({ rule, score }) => ({
    id: rule.id,
    title: rule.title,
    category: rule.category,
    severity: rule.severity,
    score,
    trigger: rule.trigger,
    root_cause: rule.root_cause,
    how_to_spot: rule.how_to_spot,
    fix: rule.fix,
    detection_signals: rule.detection_signals,
    canonical_urls: rule.canonical_urls,
  }));

  // Build probable causal chain from top matched rules + direct concept matches
  const causalConceptIds: string[] = [];
  for (const { rule } of scoredRules) {
    for (const cid of rule.concept_ids) {
      if (!causalConceptIds.includes(cid)) {
        causalConceptIds.push(cid);
      }
    }
  }

  // Also add top directly matching concepts from graph.json if chain is sparse
  const scoredConcepts = graph.nodes
    .map((node) => ({
      node,
      score:
        scoreTextMatch(node.id, rawQueryLower, tokens, 18, 5) +
        scoreTextMatch(node.title, rawQueryLower, tokens, 16, 5) +
        scoreTextMatch(node.summary_tldr, rawQueryLower, tokens, 12, 3),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const { node } of scoredConcepts) {
    if (!causalConceptIds.includes(node.id)) {
      causalConceptIds.push(node.id);
    }
  }

  const probableCausalChain = causalConceptIds
    .slice(0, 8)
    .map((cid) => nodeMap.get(cid))
    .filter((node): node is GraphNode => Boolean(node))
    .map((node) => ({
      concept_id: node.id,
      title: node.title,
      domain: node.domain,
      summary_tldr: node.summary_tldr,
      canonical_url: conceptUrl(node, dataSource.baseUrl),
      lab_url: conceptLabUrl(node, dataSource.baseUrl),
    }));

  const autopsyIds = new Set<string>();
  const symptomSlugs = new Set<string>();
  for (const { rule } of scoredRules) {
    for (const aid of rule.autopsy_ids) autopsyIds.add(aid);
    for (const sslug of rule.symptom_slugs) symptomSlugs.add(sslug);
  }

  const relatedAutopsies = Array.from(autopsyIds).map((id) => {
    const canonical = `${dataSource.baseUrl}/autopsies/${id}/`;
    return {
      id,
      canonical_url: canonical,
      failure_simulator_url: `${canonical}#failure-simulator`,
    };
  });

  const relatedSymptoms = Array.from(symptomSlugs).map((slug) => ({
    slug,
    canonical_url: `${dataSource.baseUrl}/symptoms/${slug}/`,
  }));

  const topRule = matchedRules[0];
  const summary = topRule
    ? `Top match (${topRule.severity}): ${topRule.title}. Root cause: ${topRule.root_cause}. Fix: ${topRule.fix}.`
    : probableCausalChain.length > 0
      ? `No exact audit rule matched, but ${probableCausalChain.length} related browser-internals concept(s) matched (top: ${probableCausalChain[0].title}).`
      : `No proven match yet for "${input.query}". frontend.rocks only serves content whose claims are proven; try broader browser API or symptom keywords.`;

  return {
    query: input.query,
    devtools_error: input.devtools_error,
    matched_rules: matchedRules,
    probable_causal_chain: probableCausalChain,
    related_autopsies: relatedAutopsies,
    related_symptoms: relatedSymptoms,
    summary,
  };
}

// ---------------------------------------------------------------------------
// 2. get_concept_internals
// ---------------------------------------------------------------------------

export const GetConceptInternalsInputSchema = z.object({
  concept_id: z
    .string()
    .min(1)
    .describe(
      'Canonical concept slug from frontend.rocks (e.g. "browser-rendering-pipeline", "css-stacking-context", "indexeddb-transactions-quotas").'
    ),
});

export type GetConceptInternalsInput = z.infer<
  typeof GetConceptInternalsInputSchema
>;

const NeighborSchema = z.object({
  id: z.string(),
  title: z.string(),
  maturity_status: z.string(),
  note: z.string(),
  canonical_url: z.string(),
});

export const GetConceptInternalsOutputSchema = z.object({
  found: z.boolean(),
  concept_id: z.string(),
  title: z.string().optional(),
  domain: z.string().optional(),
  maturity_status: z.string().optional(),
  summary_tldr: z.string().optional(),
  canonical_url: z.string().optional(),
  lab_url: z.string().optional(),
  markdown: z.string().optional(),
  neighbors: z.object({
    requires: z.array(NeighborSchema),
    required_by: z.array(NeighborSchema),
    replaces: z.array(NeighborSchema),
    replaced_by: z.array(NeighborSchema),
    contrasts_with: z.array(NeighborSchema),
    under_the_hood: z.array(NeighborSchema),
  }),
  suggestions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      canonical_url: z.string(),
    })
  ),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type GetConceptInternalsOutput = z.infer<
  typeof GetConceptInternalsOutputSchema
>;

function emptyNeighbors(): GetConceptInternalsOutput['neighbors'] {
  return {
    requires: [],
    required_by: [],
    replaces: [],
    replaced_by: [],
    contrasts_with: [],
    under_the_hood: [],
  };
}

export async function getConceptInternals(
  dataSource: FrontendRocksDataSource,
  input: GetConceptInternalsInput
): Promise<GetConceptInternalsOutput> {
  const requestedId = input.concept_id.trim().toLowerCase();
  const graph = await dataSource.getGraph();
  const nodeMap = new Map<string, GraphNode>(
    graph.nodes.map((node) => [node.id, node])
  );

  const node = nodeMap.get(requestedId);
  if (!node) {
    const tokens = tokenize(requestedId);
    const suggestions = graph.nodes
      .map((candidate) => ({
        candidate,
        score:
          scoreTextMatch(candidate.id, requestedId, tokens, 20, 6) +
          scoreTextMatch(candidate.title, requestedId, tokens, 14, 4),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ candidate }) => ({
        id: candidate.id,
        title: candidate.title,
        canonical_url: conceptUrl(candidate, dataSource.baseUrl),
      }));

    return {
      found: false,
      concept_id: requestedId,
      neighbors: emptyNeighbors(),
      suggestions,
      error: `Concept "${requestedId}" not found in frontend.rocks knowledge graph.${
        suggestions.length > 0
          ? ` Did you mean: ${suggestions.map((s) => s.id).join(', ')}?`
          : ''
      }`,
      message: notAvailableMessage(requestedId),
    };
  }

  const markdown = await dataSource.getConceptMarkdown(node.id);
  if (markdown === null) {
    // Deployment inconsistency: the node is in graph.json but its twin is gone (404).
    return {
      found: false,
      concept_id: node.id,
      neighbors: emptyNeighbors(),
      suggestions: [],
      error: `Concept "${node.id}" has no Markdown twin.`,
      message: notAvailableMessage(node.id),
    };
  }
  const neighbors = emptyNeighbors();

  const toNeighbor = (targetId: string, note: string) => {
    const targetNode = nodeMap.get(targetId);
    return {
      id: targetId,
      title: targetNode?.title ?? targetId,
      maturity_status: targetNode?.maturity_status ?? 'unknown',
      note,
      canonical_url: targetNode
        ? conceptUrl(targetNode, dataSource.baseUrl)
        : `${dataSource.baseUrl}/concepts/${targetId}/`,
    };
  };

  for (const edge of graph.edges) {
    if (edge.source === node.id) {
      if (edge.type === 'requires') {
        neighbors.requires.push(toNeighbor(edge.target, edge.note));
      } else if (edge.type === 'replaces') {
        neighbors.replaces.push(toNeighbor(edge.target, edge.note));
      } else if (edge.type === 'contrasts_with') {
        neighbors.contrasts_with.push(toNeighbor(edge.target, edge.note));
      } else if (edge.type === 'under_the_hood') {
        neighbors.under_the_hood.push(toNeighbor(edge.target, edge.note));
      }
    } else if (edge.target === node.id) {
      if (edge.type === 'requires') {
        neighbors.required_by.push(toNeighbor(edge.source, edge.note));
      } else if (edge.type === 'replaces') {
        neighbors.replaced_by.push(toNeighbor(edge.source, edge.note));
      } else if (edge.type === 'contrasts_with') {
        neighbors.contrasts_with.push(toNeighbor(edge.source, edge.note));
      }
    }
  }

  return {
    found: true,
    concept_id: node.id,
    title: node.title,
    domain: node.domain,
    maturity_status: node.maturity_status,
    summary_tldr: node.summary_tldr,
    canonical_url: conceptUrl(node, dataSource.baseUrl),
    lab_url: conceptLabUrl(node, dataSource.baseUrl),
    markdown,
    neighbors,
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// 3. check_pattern_obsolescence
// ---------------------------------------------------------------------------

export const CheckPatternObsolescenceInputSchema = z.object({
  pattern_or_api: z
    .string()
    .min(1)
    .describe(
      'Frontend pattern, library idiom, or Web Platform API to evaluate (e.g. "react-portal-zindex-legacy", "ResizeObserver container queries", "css-container-queries", "Popover API").'
    ),
});

export type CheckPatternObsolescenceInput = z.infer<
  typeof CheckPatternObsolescenceInputSchema
>;

export const CheckPatternObsolescenceOutputSchema = z.object({
  query: z.string(),
  found: z.boolean(),
  is_obsolete: z.boolean(),
  maturity_status: z.string().optional(),
  matched_concept: z
    .object({
      id: z.string(),
      title: z.string(),
      domain: z.string(),
      maturity_status: z.string(),
      summary_tldr: z.string(),
      canonical_url: z.string(),
      last_verified_at: z.string().optional(),
    })
    .optional(),
  replacement_primitives: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      maturity_status: z.string(),
      summary_tldr: z.string(),
      canonical_url: z.string(),
      note: z.string(),
    })
  ),
  vs_comparisons: z.array(
    z.object({
      slug: z.string(),
      canonical_url: z.string(),
      versus_concept_id: z.string(),
      versus_concept_title: z.string(),
    })
  ),
  verdict: z.string(),
  alternatives: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      maturity_status: z.string(),
      canonical_url: z.string(),
    })
  ),
  message: z.string().optional(),
});

export type CheckPatternObsolescenceOutput = z.infer<
  typeof CheckPatternObsolescenceOutputSchema
>;

export async function checkPatternObsolescence(
  dataSource: FrontendRocksDataSource,
  input: CheckPatternObsolescenceInput
): Promise<CheckPatternObsolescenceOutput> {
  const rawQueryLower = input.pattern_or_api.trim().toLowerCase();
  const tokens = tokenize(rawQueryLower);
  const graph = await dataSource.getGraph();
  const nodeMap = new Map<string, GraphNode>(
    graph.nodes.map((node) => [node.id, node])
  );

  // Score all nodes, giving exact ID matches top priority
  const ranked = graph.nodes
    .map((node) => {
      let score = 0;
      if (node.id === rawQueryLower) score += 100;
      score += scoreTextMatch(node.id, rawQueryLower, tokens, 25, 8);
      score += scoreTextMatch(node.title, rawQueryLower, tokens, 20, 6);
      score += scoreTextMatch(node.summary_tldr, rawQueryLower, tokens, 10, 3);
      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      query: input.pattern_or_api,
      found: false,
      is_obsolete: false,
      replacement_primitives: [],
      vs_comparisons: [],
      verdict: `No proven match yet: no concept matching "${input.pattern_or_api}" was found in the frontend.rocks knowledge graph.`,
      alternatives: [],
      message: notAvailableMessage(input.pattern_or_api.trim()),
    };
  }

  const matched = ranked[0].node;
  const alternatives = ranked.slice(1, 5).map(({ node }) => ({
    id: node.id,
    title: node.title,
    maturity_status: node.maturity_status,
    canonical_url: conceptUrl(node, dataSource.baseUrl),
  }));

  // Collect replacement primitives from superseded_by + incoming 'replaces' edges
  const incomingReplacesEdges: GraphEdge[] = graph.edges.filter(
    (e) => e.target === matched.id && e.type === 'replaces'
  );

  const replacementIds = new Map<string, string>();
  for (const id of matched.superseded_by) {
    replacementIds.set(id, '');
  }
  for (const edge of incomingReplacesEdges) {
    replacementIds.set(edge.source, edge.note);
  }

  const replacementPrimitives = Array.from(replacementIds.entries()).map(
    ([id, note]) => {
      const target = nodeMap.get(id);
      return {
        id,
        title: target?.title ?? id,
        maturity_status: target?.maturity_status ?? 'unknown',
        summary_tldr: target?.summary_tldr ?? '',
        canonical_url: target
          ? conceptUrl(target, dataSource.baseUrl)
          : `${dataSource.baseUrl}/concepts/${id}/`,
        note,
      };
    }
  );

  const isObsolete =
    matched.maturity_status === 'superseded' ||
    matched.maturity_status === 'legacy-pattern' ||
    replacementPrimitives.length > 0;

  // Gather candidate /vs/ comparisons from replaces + contrasts_with edges & replacement primitives
  const candidateOtherIds = new Set<string>();
  for (const rep of replacementPrimitives) candidateOtherIds.add(rep.id);
  for (const edge of graph.edges) {
    if (
      (edge.type === 'replaces' || edge.type === 'contrasts_with') &&
      (edge.source === matched.id || edge.target === matched.id)
    ) {
      const other = edge.source === matched.id ? edge.target : edge.source;
      candidateOtherIds.add(other);
    }
  }

  const vsComparisons: CheckPatternObsolescenceOutput['vs_comparisons'] = [];
  for (const otherId of candidateOtherIds) {
    const slug = vsSlugForPair(matched.id, otherId);
    const exists = await dataSource.hasVsComparison(slug);
    if (exists) {
      const otherNode = nodeMap.get(otherId);
      vsComparisons.push({
        slug,
        canonical_url: `${dataSource.baseUrl}/vs/${slug}/`,
        versus_concept_id: otherId,
        versus_concept_title: otherNode?.title ?? otherId,
      });
    }
  }

  const verdict = isObsolete
    ? `"${matched.title}" is marked ${matched.maturity_status} and superseded by ${
        replacementPrimitives.map((r) => r.title).join(', ') ||
        'native Web Platform primitives'
      }.`
    : `"${matched.title}" is active (maturity: ${matched.maturity_status}) and not marked obsolete.`;

  return {
    query: input.pattern_or_api,
    found: true,
    is_obsolete: isObsolete,
    maturity_status: matched.maturity_status,
    matched_concept: {
      id: matched.id,
      title: matched.title,
      domain: matched.domain,
      maturity_status: matched.maturity_status,
      summary_tldr: matched.summary_tldr,
      canonical_url: conceptUrl(matched, dataSource.baseUrl),
      last_verified_at: matched.last_verified_at,
    },
    replacement_primitives: replacementPrimitives,
    vs_comparisons: vsComparisons,
    verdict,
    alternatives,
  };
}

// ---------------------------------------------------------------------------
// 4. find_related_autopsy
// ---------------------------------------------------------------------------

export const FindRelatedAutopsyInputSchema = z.object({
  concept_id_or_failure_mode: z
    .string()
    .min(1)
    .describe(
      'Concept ID (exact or partial, e.g. "indexeddb", "css-stacking-context"), failure mode (e.g. "Cascading Latency", "Memory Leak"), or autopsy keyword.'
    ),
});

export type FindRelatedAutopsyInput = z.infer<
  typeof FindRelatedAutopsyInputSchema
>;

export const FindRelatedAutopsyOutputSchema = z.object({
  query: z.string(),
  total_matches: z.number(),
  matches: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      case_number: z.string(),
      failure_mode: z.string(),
      production_symptom: z.string(),
      canonical_url: z.string(),
      failure_simulator_url: z.string(),
      trigger: z.string(),
      root_cause: z.string(),
      bad_fixes: z.array(z.string()),
      fix: z.string(),
      how_to_spot: z.string(),
      traversed_concepts: z.array(z.string()),
      score: z.number(),
    })
  ),
  message: z.string().optional(),
});

export type FindRelatedAutopsyOutput = z.infer<
  typeof FindRelatedAutopsyOutputSchema
>;

function scoreAutopsy(
  autopsy: ParsedAutopsySummary,
  linkedRules: AuditRule[],
  rawQueryLower: string,
  tokens: string[]
): number {
  let score = 0;

  if (autopsy.id === rawQueryLower) score += 40;
  if (autopsy.traversed_concepts.includes(rawQueryLower)) score += 35;

  score += scoreTextMatch(autopsy.id, rawQueryLower, tokens, 18, 6);
  score += scoreTextMatch(autopsy.title, rawQueryLower, tokens, 16, 5);
  score += scoreTextMatch(autopsy.failure_mode, rawQueryLower, tokens, 20, 6);
  score += scoreTextMatch(
    autopsy.traversed_concepts.join(' '),
    rawQueryLower,
    tokens,
    20,
    6
  );
  score += scoreTextMatch(
    autopsy.production_symptom,
    rawQueryLower,
    tokens,
    12,
    4
  );
  score += scoreTextMatch(autopsy.trigger, rawQueryLower, tokens, 12, 4);
  score += scoreTextMatch(autopsy.root_cause, rawQueryLower, tokens, 12, 4);
  score += scoreTextMatch(autopsy.how_to_spot, rawQueryLower, tokens, 10, 3);
  score += scoreTextMatch(autopsy.fix, rawQueryLower, tokens, 8, 2);

  for (const rule of linkedRules) {
    if (rule.concept_ids.includes(rawQueryLower)) score += 20;
    score += scoreTextMatch(
      rule.concept_ids.join(' '),
      rawQueryLower,
      tokens,
      10,
      3
    );
    score += scoreTextMatch(rule.category, rawQueryLower, tokens, 8, 2);
  }

  return score;
}

export async function findRelatedAutopsy(
  dataSource: FrontendRocksDataSource,
  input: FindRelatedAutopsyInput
): Promise<FindRelatedAutopsyOutput> {
  const rawQueryLower = input.concept_id_or_failure_mode.trim().toLowerCase();
  const tokens = tokenize(rawQueryLower);

  const [catalog, slugs] = await Promise.all([
    dataSource.getAuditRules(),
    dataSource.listAutopsySlugs(),
  ]);

  const rulesByAutopsy = new Map<string, AuditRule[]>();
  for (const rule of catalog.rules) {
    for (const aid of rule.autopsy_ids) {
      const list = rulesByAutopsy.get(aid) ?? [];
      list.push(rule);
      rulesByAutopsy.set(aid, list);
    }
  }

  const summaries = (
    await Promise.all(slugs.map((slug) => dataSource.getAutopsySummary(slug)))
  ).filter((item): item is ParsedAutopsySummary => item !== null);

  const ranked = summaries
    .map((summary) => {
      const linkedRules = rulesByAutopsy.get(summary.id) ?? [];
      const score = scoreAutopsy(summary, linkedRules, rawQueryLower, tokens);
      return { summary, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    query: input.concept_id_or_failure_mode,
    total_matches: ranked.length,
    ...(ranked.length === 0
      ? { message: notAvailableMessage(input.concept_id_or_failure_mode.trim()) }
      : {}),
    matches: ranked.map(({ summary, score }) => ({
      id: summary.id,
      title: summary.title,
      case_number: summary.case_number,
      failure_mode: summary.failure_mode,
      production_symptom: summary.production_symptom,
      canonical_url: summary.canonical_url,
      failure_simulator_url: summary.failure_simulator_url,
      trigger: summary.trigger,
      root_cause: summary.root_cause,
      bad_fixes: summary.bad_fixes,
      fix: summary.fix,
      how_to_spot: summary.how_to_spot,
      traversed_concepts: summary.traversed_concepts,
      score,
    })),
  };
}
