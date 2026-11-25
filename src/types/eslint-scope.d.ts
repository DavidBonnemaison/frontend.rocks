declare module 'eslint-scope' {
  import type { Node } from 'acorn';

  export interface Reference {
    identifier: { name: string };
  }

  export interface Scope {
    through: Reference[];
  }

  export interface ScopeManager {
    globalScope: Scope | null;
  }

  export function analyze(
    ast: Node,
    options?: { ecmaVersion?: number; sourceType?: 'script' | 'module' }
  ): ScopeManager;
}
