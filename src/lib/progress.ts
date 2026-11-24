export const PROGRESS_STORAGE_KEY = 'frontend-rocks:explored-concepts';
export const PROGRESS_CHANGE_EVENT = 'frontend-rocks:progress-change';

export interface PathProgress {
  completed: number;
  total: number;
  percentage: number;
}

type ProgressListener = (explored: string[]) => void;

const memoryStore = new Set<string>();
const memoryListeners = new Set<ProgressListener>();

function getSafeStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

function normalizeConceptIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }
  return result;
}

function notifyListeners(explored: string[]): void {
  for (const listener of memoryListeners) {
    try {
      listener(explored);
    } catch {
      // Ignore subscriber errors so other listeners still receive updates.
    }
  }

  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<string[]>(PROGRESS_CHANGE_EVENT, { detail: explored })
      );
    }
  } catch {
    // Ignore environments without CustomEvent/dispatchEvent support.
  }
}

function writeExploredConcepts(ids: string[]): string[] {
  const normalized = normalizeConceptIds(ids);
  memoryStore.clear();
  for (const id of normalized) {
    memoryStore.add(id);
  }

  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // SecurityError / QuotaExceededError — keep in-memory state cleanly.
    }
  }

  notifyListeners(normalized);
  return normalized;
}

export function getExploredConcepts(): string[] {
  const storage = getSafeStorage();
  if (!storage) {
    return Array.from(memoryStore);
  }

  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY);
    if (raw === null) {
      return Array.from(memoryStore);
    }
    const parsed: unknown = JSON.parse(raw);
    const normalized = normalizeConceptIds(parsed);
    memoryStore.clear();
    for (const id of normalized) {
      memoryStore.add(id);
    }
    return normalized;
  } catch {
    return Array.from(memoryStore);
  }
}

export function isConceptExplored(conceptId: string): boolean {
  const trimmed = conceptId.trim();
  if (!trimmed) return false;
  return getExploredConcepts().includes(trimmed);
}

export function markConceptExplored(conceptId: string): string[] {
  const trimmed = conceptId.trim();
  const current = getExploredConcepts();
  if (!trimmed || current.includes(trimmed)) {
    return current;
  }
  return writeExploredConcepts([...current, trimmed]);
}

export function unmarkConceptExplored(conceptId: string): string[] {
  const trimmed = conceptId.trim();
  const current = getExploredConcepts();
  if (!trimmed || !current.includes(trimmed)) {
    return current;
  }
  return writeExploredConcepts(current.filter((id) => id !== trimmed));
}

export function toggleConceptExplored(conceptId: string): boolean {
  const trimmed = conceptId.trim();
  if (!trimmed) return false;
  const current = getExploredConcepts();
  if (current.includes(trimmed)) {
    writeExploredConcepts(current.filter((id) => id !== trimmed));
    return false;
  }
  writeExploredConcepts([...current, trimmed]);
  return true;
}

export function getPathProgress(
  conceptIds: readonly string[],
  explored?: readonly string[]
): PathProgress {
  const uniquePathIds = normalizeConceptIds([...conceptIds]);
  const total = uniquePathIds.length;
  if (total === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }
  const exploredSet = new Set(explored ?? getExploredConcepts());
  let completed = 0;
  for (const id of uniquePathIds) {
    if (exploredSet.has(id)) {
      completed += 1;
    }
  }
  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

export function subscribeProgress(callback: ProgressListener): () => void {
  memoryListeners.add(callback);

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PROGRESS_STORAGE_KEY) return;
    callback(getExploredConcepts());
  };

  const handleCustomEvent = (event: Event) => {
    // Only needed when another module instance dispatches on window.
    const detail = (event as CustomEvent<string[] | undefined>).detail;
    if (Array.isArray(detail)) {
      return;
    }
    callback(getExploredConcepts());
  };

  const hasWindow =
    typeof window !== 'undefined' && typeof window.addEventListener === 'function';

  if (hasWindow) {
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener(PROGRESS_CHANGE_EVENT, handleCustomEvent);
  }

  return () => {
    memoryListeners.delete(callback);
    if (hasWindow) {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener(PROGRESS_CHANGE_EVENT, handleCustomEvent);
    }
  };
}

export function resetProgressStoreForTests(): void {
  memoryStore.clear();
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.removeItem(PROGRESS_STORAGE_KEY);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }
}
