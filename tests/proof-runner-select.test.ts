import { describe, expect, it } from 'vitest';
import {
  applyShard,
  parseRunnerArgs,
  selectChangedExperiments,
} from '../scripts/proof/runner-select';

describe('proof runner selection', () => {
  describe('parseRunnerArgs', () => {
    it('uses sensible defaults when called with no arguments', () => {
      const args = parseRunnerArgs([]);
      expect(args).toEqual({
        engines: ['chromium', 'firefox', 'webkit'],
        only: null,
        changedBase: null,
        shard: null,
        out: 'artifacts/proof/experiments.json',
        timeoutMs: 15000,
        headed: false,
      });
    });

    it('rejects unknown engines, invalid shards, and invalid timeouts', () => {
      expect(() => parseRunnerArgs(['--engines', 'safari'])).toThrow();
      expect(() => parseRunnerArgs(['--shard', '3/2'])).toThrow();
      expect(() => parseRunnerArgs(['--shard', '0/2'])).toThrow();
      expect(() => parseRunnerArgs(['--timeout', 'abc'])).toThrow();
    });

    it('parses --changed and rejects missing values, glued syntax, and unknown flags', () => {
      expect(parseRunnerArgs(['--changed', 'origin/main']).changedBase).toBe('origin/main');
      expect(() => parseRunnerArgs(['--changed'])).toThrow();
      expect(() => parseRunnerArgs(['--engines=firefox'])).toThrow();
      expect(() => parseRunnerArgs(['--nope'])).toThrow();
    });

    it('uses shard-specific default output path when --shard is passed without --out', () => {
      expect(parseRunnerArgs(['--shard', '2/3']).out).toBe(
        'artifacts/proof/experiments.2-of-3.json'
      );
    });
  });

  describe('applyShard', () => {
    it('partitions sorted ids deterministically across shards without duplicates', () => {
      expect(applyShard(['c', 'a', 'b', 'd'], { index: 1, total: 2 })).toEqual(['a', 'c']);
      expect(applyShard(['c', 'a', 'b', 'd'], { index: 2, total: 2 })).toEqual(['b', 'd']);
    });
  });

  describe('selectChangedExperiments', () => {
    const ids = ['a', 'b'];
    const refs = new Map<string, string[]>([['p', ['b']]]);

    it('selects all experiments when runtime files change', () => {
      expect(selectChangedExperiments(['src/lib/proof/runtime/mount.ts'], ids, refs)).toEqual(ids);
    });

    it('selects only modified experiment folders', () => {
      expect(
        selectChangedExperiments(['content/experiments/a/experiment.ts', 'README.md'], ids, refs)
      ).toEqual(['a']);
    });

    it('selects experiments referenced by modified claims files', () => {
      expect(selectChangedExperiments(['content/claims/p.claims.json'], ids, refs)).toEqual(['b']);
    });

    it('selects experiments referenced by modified concept MDX pages', () => {
      expect(selectChangedExperiments(['content/concepts/p.mdx'], ids, refs)).toEqual(['b']);
    });

    it('ignores content/.proof-results/ changes and unrelated files', () => {
      expect(selectChangedExperiments(['content/.proof-results/latest.json'], ids, refs)).toEqual(
        []
      );
      expect(selectChangedExperiments(['README.md', 'src/app/page.tsx'], ids, refs)).toEqual([]);
    });
  });
});
