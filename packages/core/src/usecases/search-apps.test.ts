import { describe, expect, it } from 'vitest';
import {
  createFakeCache,
  createFakeProvider,
  createFakeRegistry,
  createFakeStore,
  neverCredentials,
  silentLogger,
  testClock,
} from '../testing/fakes.js';
import { ResolveSourceUseCase } from './resolve-source.js';
import { isReferenceQuery, SearchAppsUseCase } from './search-apps.js';

const HTTP = {
  request: async () => {
    throw new Error('network must not be used');
  },
};

function build() {
  const clock = testClock('2024-06-01T00:00:00.000Z');
  const provider = createFakeProvider({});
  const resolveSource = new ResolveSourceUseCase({
    registry: createFakeRegistry([provider]),
    cache: createFakeCache(clock),
    clock,
    logger: silentLogger(),
    http: HTTP,
    credentials: neverCredentials(),
    cacheTtlSeconds: 300,
    httpTimeoutMs: 1_000,
  });
  const store = createFakeStore();
  return {
    store,
    useCase: new SearchAppsUseCase({ store, resolveSource, clock, logger: silentLogger() }),
  };
}

describe('SearchAppsUseCase', () => {
  it('resolves a URL query and persists the record', async () => {
    const { useCase, store } = build();
    const result = await useCase.execute({ q: 'gitlab.com/example/app', limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.queriedSources).toEqual(['github']);
    expect(store.apps.size).toBe(1);
  });

  it('can preview a reference without persisting it', async () => {
    const { useCase, store } = build();
    await useCase.execute({ q: 'github.com/example/app', limit: 20, persist: false });
    expect(store.apps.size).toBe(0);
  });

  it('searches the local store for free-text queries', async () => {
    const { useCase, store } = build();
    await useCase.execute({ q: 'github.com/example/app', limit: 20 });
    const result = await useCase.execute({ q: 'example', limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('Example App');
    expect(store.apps.size).toBe(1);
  });
});

describe('isReferenceQuery', () => {
  it('distinguishes references from search terms', () => {
    expect(isReferenceQuery('github.com/bitwarden/android')).toBe(true);
    expect(isReferenceQuery('owner/repository')).toBe(true);
    expect(isReferenceQuery('osp://example')).toBe(true);
    expect(isReferenceQuery('org.fdroid.fdroid')).toBe(false);
    expect(isReferenceQuery('password manager')).toBe(false);
    expect(isReferenceQuery('note taking')).toBe(false);
  });
});
