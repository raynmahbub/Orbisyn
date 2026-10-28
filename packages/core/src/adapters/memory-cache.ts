import type { CacheEntry, CachePort, ClockPort } from '../ports.js';

/**
 * In-process cache with stale-while-error semantics.
 *
 * Entries keep their data past the TTL and are marked `stale`, so the resolver
 * can still answer when the upstream source is unreachable — the behaviour that
 * makes an offline-first client feel instant.
 */
export interface MemoryCacheOptions {
  /** Hard ceiling on retained entries; oldest first eviction. */
  readonly maxEntries?: number;
  readonly clock: ClockPort;
}

export function createMemoryCache(options: MemoryCacheOptions): CachePort {
  const maxEntries = options.maxEntries ?? 512;
  const entries = new Map<string, CacheEntry<unknown>>();

  const evict = (): void => {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) return;
      entries.delete(oldest.value);
    }
  };

  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const entry = entries.get(key);
      if (entry === undefined) return null;
      const now = options.clock.now().getTime();
      const stale = Date.parse(entry.expiresAt) <= now;
      // Refresh recency for LRU-ish behaviour: reinsertion moves the key last.
      entries.delete(key);
      entries.set(key, entry);
      return {
        value: entry.value as T,
        storedAt: entry.storedAt,
        expiresAt: entry.expiresAt,
        stale,
      };
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      const now = options.clock.now();
      entries.set(key, {
        value,
        storedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
        stale: false,
      });
      evict();
    },

    async delete(key: string): Promise<void> {
      entries.delete(key);
    },
  };
}
