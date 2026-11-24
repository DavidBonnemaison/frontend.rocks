import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLearningPaths } from '@/lib/content-loader';
import {
  getExploredConcepts,
  getPathProgress,
  isConceptExplored,
  markConceptExplored,
  PROGRESS_STORAGE_KEY,
  resetProgressStoreForTests,
  subscribeProgress,
  toggleConceptExplored,
  unmarkConceptExplored,
} from '@/lib/progress';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('local progression store (src/lib/progress.ts)', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  function setLocalStorageMock(storage: Storage | undefined) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: storage,
    });
  }

  beforeEach(() => {
    setLocalStorageMock(createMemoryStorage());
    resetProgressStoreForTests();
  });

  afterEach(() => {
    resetProgressStoreForTests();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });

  it('reads, writes, deduplicates, and toggles explored concepts in localStorage', () => {
    expect(getExploredConcepts()).toEqual([]);
    expect(isConceptExplored('layout-thrashing')).toBe(false);

    markConceptExplored('layout-thrashing');
    markConceptExplored('layout-thrashing');
    markConceptExplored('gpu-compositor-layers');

    expect(getExploredConcepts()).toEqual(['layout-thrashing', 'gpu-compositor-layers']);
    expect(isConceptExplored('layout-thrashing')).toBe(true);

    const raw = globalThis.localStorage.getItem(PROGRESS_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify(['layout-thrashing', 'gpu-compositor-layers']));

    expect(toggleConceptExplored('layout-thrashing')).toBe(false);
    expect(isConceptExplored('layout-thrashing')).toBe(false);
    expect(getExploredConcepts()).toEqual(['gpu-compositor-layers']);

    expect(toggleConceptExplored('layout-thrashing')).toBe(true);
    expect(isConceptExplored('layout-thrashing')).toBe(true);

    unmarkConceptExplored('gpu-compositor-layers');
    expect(getExploredConcepts()).toEqual(['layout-thrashing']);
  });

  it('notifies subscribers on progress changes and cleans up on unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProgress(listener);

    markConceptExplored('browser-rendering-pipeline');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(['browser-rendering-pipeline']);

    toggleConceptExplored('browser-rendering-pipeline');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith([]);

    unsubscribe();
    markConceptExplored('css-cascade-layers');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('falls back cleanly to in-memory state when localStorage is undefined', () => {
    setLocalStorageMock(undefined);
    resetProgressStoreForTests();

    expect(getExploredConcepts()).toEqual([]);
    markConceptExplored('css-container-queries');
    expect(isConceptExplored('css-container-queries')).toBe(true);
    expect(toggleConceptExplored('css-container-queries')).toBe(false);
    expect(getExploredConcepts()).toEqual([]);
  });

  it('falls back cleanly when accessing localStorage throws SecurityError (strict private mode)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        const err = new Error('The operation is insecure.');
        err.name = 'SecurityError';
        throw err;
      },
    });

    expect(() => getExploredConcepts()).not.toThrow();
    expect(() => markConceptExplored('bfcache-navigation')).not.toThrow();
    expect(isConceptExplored('bfcache-navigation')).toBe(true);
    expect(() => toggleConceptExplored('bfcache-navigation')).not.toThrow();
    expect(isConceptExplored('bfcache-navigation')).toBe(false);
  });

  it('survives QuotaExceededError on setItem and corrupted JSON in localStorage', () => {
    const faultyStorage = createMemoryStorage();
    faultyStorage.setItem(PROGRESS_STORAGE_KEY, '{not-valid-json');
    setLocalStorageMock(faultyStorage);

    expect(getExploredConcepts()).toEqual([]);

    const quotaStorage: Storage = {
      ...createMemoryStorage(),
      getItem: () => null,
      setItem: () => {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      removeItem: () => {},
    };
    setLocalStorageMock(quotaStorage);

    expect(() => markConceptExplored('fine-grained-signals')).not.toThrow();
    expect(getExploredConcepts()).toEqual(['fine-grained-signals']);
  });

  it('computes path progress accurately', () => {
    const pathConcepts = [
      'browser-rendering-pipeline',
      'layout-thrashing',
      'gpu-compositor-layers',
      'event-loop-tasks-microtasks',
      'preload-scanner-hints',
    ];

    expect(getPathProgress(pathConcepts, [])).toEqual({
      completed: 0,
      total: 5,
      percentage: 0,
    });

    expect(
      getPathProgress(pathConcepts, ['layout-thrashing', 'preload-scanner-hints', 'unrelated-id'])
    ).toEqual({
      completed: 2,
      total: 5,
      percentage: 40,
    });

    expect(getPathProgress(pathConcepts, pathConcepts)).toEqual({
      completed: 5,
      total: 5,
      percentage: 100,
    });

    expect(getPathProgress([], ['layout-thrashing'])).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
    });
  });
});

describe('content/paths.json integrity', () => {
  it('contains at least 5 learning paths and every concept ID exists in content/concepts/', () => {
    const paths = getLearningPaths();
    const conceptsDir = path.join(process.cwd(), 'content', 'concepts');
    const conceptIds = new Set(
      fs
        .readdirSync(conceptsDir)
        .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
        .map((file) => {
          const parsed = matter(fs.readFileSync(path.join(conceptsDir, file), 'utf-8'));
          return String(parsed.data.id ?? '');
        })
        .filter(Boolean)
    );

    expect(paths.length).toBeGreaterThanOrEqual(5);

    const seenPathIds = new Set<string>();
    for (const p of paths) {
      expect(seenPathIds.has(p.id)).toBe(false);
      seenPathIds.add(p.id);
      expect(p.concepts.length).toBeGreaterThanOrEqual(3);

      for (const cid of p.concepts) {
        expect(conceptIds.has(cid), `Path "${p.id}" references missing concept "${cid}"`).toBe(true);
      }
    }
  });
});
