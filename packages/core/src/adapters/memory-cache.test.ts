import { describe, expect, it } from 'vitest';
import type { ClockPort } from '../ports.js';
import { createMemoryCache } from './memory-cache.js';

/**
 * The cache is what makes an offline-first client feel instant, and its
 * stale-while-error semantics are load-bearing: an entry past its TTL is still
 * *served*, marked stale, so a resolver can answer when the upstream is down.
 */
function fixedClock(start = '2024-06-01T00:00:00.000Z'): ClockPort & { advance(ms: number): void } {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    isoNow: () => current.toISOString(),
    advance(ms) {
      current = new Date(current.getTime() + ms);
    },
  };
}

describe('createMemoryCache', () => {
  it('returns null for a key it has never seen', async () => {
    const cache = createMemoryCache({ clock: fixedClock() });
    await expect(cache.get('missing')).resolves.toBeNull();
  });

  it('stores a value with its window and reports it as fresh', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ clock });

    await cache.set('app:alpha', { id: 'alpha' }, 60);
    const entry = await cache.get<{ id: string }>('app:alpha');

    expect(entry).toMatchObject({
      value: { id: 'alpha' },
      storedAt: '2024-06-01T00:00:00.000Z',
      expiresAt: '2024-06-01T00:01:00.000Z',
      stale: false,
    });
  });

  it('keeps serving an expired entry but marks it stale', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ clock });

    await cache.set('app:alpha', 'value', 30);
    clock.advance(31_000);
    const entry = await cache.get<string>('app:alpha');

    expect(entry?.stale).toBe(true);
    expect(entry?.value).toBe('value');
  });

  it('treats the exact expiry moment as stale', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ clock });

    await cache.set('key', 'value', 10);
    clock.advance(10_000);
    expect((await cache.get('key'))?.stale).toBe(true);
  });

  it('overwrites an existing key', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ clock });

    await cache.set('key', 'first', 60);
    clock.advance(1_000);
    await cache.set('key', 'second', 60);

    const entry = await cache.get<string>('key');
    expect(entry?.value).toBe('second');
    expect(entry?.storedAt).toBe('2024-06-01T00:00:01.000Z');
  });

  it('deletes a key', async () => {
    const cache = createMemoryCache({ clock: fixedClock() });
    await cache.set('key', 'value', 60);
    await cache.delete('key');

    await expect(cache.get('key')).resolves.toBeNull();
    // Deleting an absent key is not an error.
    await expect(cache.delete('key')).resolves.toBeUndefined();
  });

  it('evicts the oldest entries once the ceiling is reached', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ maxEntries: 2, clock });

    await cache.set('first', 1, 60);
    clock.advance(1_000);
    await cache.set('second', 2, 60);
    clock.advance(1_000);
    await cache.set('third', 3, 60);

    await expect(cache.get('first')).resolves.toBeNull();
    await expect(cache.get('second')).resolves.toMatchObject({ value: 2 });
    await expect(cache.get('third')).resolves.toMatchObject({ value: 3 });
  });

  it('refreshes recency on read, so hot keys survive eviction', async () => {
    const clock = fixedClock();
    const cache = createMemoryCache({ maxEntries: 2, clock });

    await cache.set('hot', 'hot', 60);
    clock.advance(1_000);
    await cache.set('cold', 'cold', 60);
    clock.advance(1_000);

    // Touching `hot` moves it to the back of the eviction order.
    await cache.get('hot');
    await cache.set('newcomer', 'new', 60);

    await expect(cache.get('hot')).resolves.toMatchObject({ value: 'hot' });
    await expect(cache.get('cold')).resolves.toBeNull();
    await expect(cache.get('newcomer')).resolves.toMatchObject({ value: 'new' });
  });

  it('defaults to a generous ceiling instead of unbounded growth', async () => {
    const cache = createMemoryCache({ clock: fixedClock() });
    for (let index = 0; index < 600; index += 1) {
      await cache.set(`key-${index}`, index, 60);
    }

    // The first hundred were evicted; the most recent ones are still there.
    await expect(cache.get('key-0')).resolves.toBeNull();
    await expect(cache.get('key-599')).resolves.toMatchObject({ value: 599 });
  });
});
