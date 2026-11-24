import type { ConceptFrontmatter } from '../schemas';

export interface DagValidationError {
  type: 'missing-target' | 'cycle' | 'self-reference';
  sourceId: string;
  targetId?: string;
  cyclePath?: string[];
  message: string;
}

export interface DagValidationResult {
  valid: boolean;
  errors: DagValidationError[];
}

/**
 * Validates referential integrity of all relations & superseded_by links,
 * and enforces acyclicity (DAG) on `requires` edges.
 */
export function validateConceptGraph(concepts: ConceptFrontmatter[]): DagValidationResult {
  const errors: DagValidationError[] = [];
  const idSet = new Set(concepts.map((c) => c.id));
  const adjacency = new Map<string, string[]>();

  for (const c of concepts) {
    adjacency.set(c.id, []);

    for (const rel of c.relations) {
      if (rel.target_id === c.id) {
        errors.push({
          type: 'self-reference',
          sourceId: c.id,
          targetId: rel.target_id,
          message: `Concept "${c.id}" has a self-referential "${rel.type}" relation.`,
        });
        continue;
      }

      if (!idSet.has(rel.target_id)) {
        errors.push({
          type: 'missing-target',
          sourceId: c.id,
          targetId: rel.target_id,
          message: `Concept "${c.id}" references missing target "${rel.target_id}" in "${rel.type}".`,
        });
        continue;
      }

      if (rel.type === 'requires') {
        adjacency.get(c.id)!.push(rel.target_id);
      }
    }

    if (c.superseded_by) {
      for (const supId of c.superseded_by) {
        if (!idSet.has(supId)) {
          errors.push({
            type: 'missing-target',
            sourceId: c.id,
            targetId: supId,
            message: `Concept "${c.id}" superseded_by references missing concept "${supId}".`,
          });
        }
      }
    }
  }

  // DFS cycle detection on `requires` edges
  const state = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  for (const c of concepts) {
    state.set(c.id, 'unvisited');
  }

  const stack: string[] = [];

  function dfs(nodeId: string): void {
    state.set(nodeId, 'visiting');
    stack.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const nextId of neighbors) {
      const nextState = state.get(nextId);
      if (nextState === 'visiting') {
        const cycleStart = stack.indexOf(nextId);
        const cyclePath = [...stack.slice(cycleStart), nextId];
        errors.push({
          type: 'cycle',
          sourceId: nodeId,
          targetId: nextId,
          cyclePath,
          message: `Prerequisite cycle detected in "requires" graph: ${cyclePath.join(' -> ')}`,
        });
      } else if (nextState === 'unvisited') {
        dfs(nextId);
      }
    }

    stack.pop();
    state.set(nodeId, 'visited');
  }

  for (const c of concepts) {
    if (state.get(c.id) === 'unvisited') {
      dfs(c.id);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
