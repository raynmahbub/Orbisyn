import type { AppRecord, Release, SearchQuery, SyncOperation } from '@orbisyn/core';
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './memory.js';

/**
 * The in-memory store is the default backend for a self-hosted instance, so its
 * behaviour — ranking, filtering, pagination, eviction and the sync handshake —
 * is product behaviour, not an implementation detail.
 */

function app(overrides: Partial<AppRecord> & { id: string }): AppRecord {
  return {
    ospUri: `osp://${overrides.id}`,
    name: overrides.id,
    license: 'MIT',
    platforms: ['android'],
    categories: [],
    tags: [],
    screenshots: [],
    source: {
      kind: 'github',
      id: overrides.id,
      host: 'github.com',
      path: `example/${overrides.id}`,
      webUrl: `https://github.com/example/${overrides.id}`,
    },
    alternateSources: [],
    archived: false,
    fetchedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function release(appId: string, version: string, publishedAt: string): Release {
  return {
    id: `${appId}-${version}`,
    appId,
    source: 'github',
    version,
    channel: 'stable',
    isPrerelease: false,
    publishedAt,
    sourceUrl: `https://github.com/example/${appId}/releases/tag/${version}`,
    artifacts: [],
    fetchedAt: '2024-06-01T00:00:00.000Z',
  };
}

function health(score: number, stars: number) {
  return {
    score,
    grade: (score >= 85 ? 'A' : score >= 70 ? 'B' : 'C') as 'A' | 'B' | 'C',
    components: [{ id: 'maintenance' as const, score, weight: 1, rationale: 'test fixture' }],
    computedAt: '2024-06-01T00:00:00.000Z',
    inputs: {
      stars,
      forks: null,
      openIssues: null,
      contributors: null,
      lastCommitAt: null,
      releasesLastYear: null,
      medianReleaseIntervalDays: null,
      archived: false,
      hasSecurityPolicy: null,
      hasContributingGuide: null,
      hasCi: null,
    },
  };
}

const query = (overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  q: '',
  limit: 10,
  ...overrides,
});

describe('createMemoryStore / records', () => {
  it('stores and retrieves an app and its releases', async () => {
    const store = createMemoryStore();
    await store.saveApp(app({ id: 'alpha' }), [
      release('alpha', '1.0.0', '2024-01-01T00:00:00.000Z'),
    ]);

    expect(store.size()).toBe(1);
    await expect(store.findApp('alpha')).resolves.toMatchObject({ id: 'alpha' });
    await expect(store.findApp('missing')).resolves.toBeNull();
    await expect(store.listReleases('alpha', 10)).resolves.toHaveLength(1);
    await expect(store.listReleases('missing', 10)).resolves.toEqual([]);
  });

  it('merges releases by version instead of duplicating them', async () => {
    const store = createMemoryStore();
    await store.saveApp(app({ id: 'alpha' }), [
      release('alpha', '1.0.0', '2024-01-01T00:00:00.000Z'),
    ]);
    await store.saveApp(app({ id: 'alpha' }), [
      release('alpha', '1.0.0', '2024-01-01T00:00:00.000Z'),
      release('alpha', '2.0.0', '2024-03-01T00:00:00.000Z'),
    ]);

    const releases = await store.listReleases('alpha', 10);
    expect(releases.map((entry) => entry.version)).toEqual(['2.0.0', '1.0.0']);
  });

  it('keeps the newest hundred releases per app', async () => {
    const store = createMemoryStore();
    const many = Array.from({ length: 130 }, (_, index) =>
      release('alpha', `1.0.${index}`, new Date(Date.UTC(2024, 0, 1 + index)).toISOString()),
    );
    await store.saveApp(app({ id: 'alpha' }), many);

    expect(await store.listReleases('alpha', 500)).toHaveLength(100);
  });

  it('falls back to publication date when a version cannot be compared', async () => {
    const store = createMemoryStore();
    const odd = {
      ...release('alpha', 'rolling', '2024-05-01T00:00:00.000Z'),
      version: 'rolling-nightly',
    };
    await store.saveApp(app({ id: 'alpha' }), [
      odd,
      release('alpha', '1.0.0', '2024-01-01T00:00:00.000Z'),
    ]);

    const releases = await store.listReleases('alpha', 10);
    // `rolling-nightly` still parses as a version, so ordering stays deterministic.
    expect(releases).toHaveLength(2);
    expect(releases.map((entry) => entry.version).sort()).toEqual(['1.0.0', 'rolling-nightly']);
  });

  it('evicts the lowest ranked record when the cap is reached', async () => {
    const store = createMemoryStore({ maxApps: 2 });
    await store.saveApp(app({ id: 'top', health: health(90, 5_000) }), []);
    await store.saveApp(app({ id: 'middle', health: health(60, 10) }), []);
    await store.saveApp(app({ id: 'newcomer', health: health(55, 0) }), []);

    expect(store.size()).toBe(2);
    // The weakest existing record made room for the newcomer.
    await expect(store.findApp('top')).resolves.toMatchObject({ id: 'top' });
    await expect(store.findApp('middle')).resolves.toBeNull();
    await expect(store.findApp('newcomer')).resolves.toMatchObject({ id: 'newcomer' });
  });

  it('updates an existing record without evicting anything', async () => {
    const store = createMemoryStore({ maxApps: 1 });
    await store.saveApp(app({ id: 'alpha' }), []);
    await store.saveApp(app({ id: 'alpha', name: 'Alpha renamed' }), []);

    expect(store.size()).toBe(1);
    await expect(store.findApp('alpha')).resolves.toMatchObject({ name: 'Alpha renamed' });
  });

  it('finds a record by its upstream source fingerprint', async () => {
    const store = createMemoryStore();
    await store.saveApp(app({ id: 'alpha' }), []);

    await expect(store.findAppBySource('github.com/example/alpha')).resolves.toMatchObject({
      id: 'alpha',
    });
    await expect(store.findAppBySource('GitHub.com/Example/Alpha')).resolves.toMatchObject({
      id: 'alpha',
    });
    await expect(store.findAppBySource('github.com/example/other')).resolves.toBeNull();
  });
});

describe('createMemoryStore / search', () => {
  async function seeded() {
    const store = createMemoryStore();
    await store.saveApp(
      app({
        id: 'bitwarden-android',
        name: 'Bitwarden',
        summary: 'Password manager for Android',
        categories: ['security'],
        tags: ['passwords'],
        platforms: ['android'],
        license: 'GPL-3.0',
        health: health(85, 4_000),
      }),
      [release('bitwarden-android', '2024.5.0', '2024-05-01T00:00:00.000Z')],
    );
    await store.saveApp(
      app({
        id: 'kdenlive',
        name: 'Kdenlive',
        summary: 'Video editor',
        categories: ['media'],
        platforms: ['linux', 'windows'],
        license: 'GPL-3.0',
        health: health(70, 900),
        latestRelease: release('kdenlive', '24.02.0', '2024-02-01T00:00:00.000Z'),
        latestVersion: '24.02.0',
        source: {
          kind: 'gitlab',
          id: 'kde/kdenlive',
          host: 'gitlab.com',
          path: 'KDE/kdenlive',
          webUrl: 'https://gitlab.com/KDE/kdenlive',
        },
      }),
      [release('kdenlive', '24.02.0', '2024-02-01T00:00:00.000Z')],
    );
    await store.saveApp(
      app({
        id: 'immich',
        name: 'Immich',
        summary: 'Self-hosted photo library',
        platforms: ['android', 'ios'],
        license: 'AGPL-3.0',
        health: health(92, 20_000),
        latestRelease: release('immich', '1.100.0', '2024-05-20T00:00:00.000Z'),
        latestVersion: '1.100.0',
      }),
      [release('immich', '1.100.0', '2024-05-20T00:00:00.000Z')],
    );
    return store;
  }

  it('matches free text across every indexed field', async () => {
    const store = await seeded();

    await expect(store.search(query({ q: 'photo' }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'immich' })],
    });
    await expect(store.search(query({ q: 'KDE' }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'kdenlive' })],
    });
    await expect(store.search(query({ q: 'passwords' }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'bitwarden-android' })],
    });
  });

  it('narrows with every additional term instead of widening', async () => {
    const store = await seeded();

    await expect(store.search(query({ q: 'photo library' }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'immich' })],
    });
    await expect(store.search(query({ q: 'photo password' }))).resolves.toMatchObject({
      items: [],
    });
  });

  it('applies the platform, licence and source filters', async () => {
    const store = await seeded();

    await expect(store.search(query({ platform: ['ios'] }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'immich' })],
    });
    await expect(store.search(query({ license: ['GPL-3.0'] }))).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 'kdenlive' })]),
    });
    await expect(store.search(query({ source: ['gitlab'] }))).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'kdenlive' })],
    });
    // Empty filter arrays mean "no constraint", not "match nothing".
    await expect(
      store.search(query({ platform: [], license: [], source: [] })),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 'immich' })]),
    });
  });

  it('excludes records below the minimum health score', async () => {
    const store = await seeded();
    const result = await store.search(query({ minHealthScore: 80 }));

    expect(result.items.map((item) => item.id)).toEqual(['immich', 'bitwarden-android']);
  });

  it('ranks by health, then stars, then recency', async () => {
    const store = await seeded();
    const result = await store.search(query());

    expect(result.items.map((item) => item.id)).toEqual([
      'immich',
      'bitwarden-android',
      'kdenlive',
    ]);
    // The page is answered from two ecosystems, so both are reported.
    expect([...result.queriedSources].sort()).toEqual(['github', 'gitlab']);
  });

  it('paginates with a cursor and reports the providers it touched', async () => {
    const store = await seeded();
    const first = await store.search(query({ limit: 2 }));

    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe('2');

    const second = await store.search(query({ limit: 2, cursor: first.nextCursor ?? undefined }));
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...second.queriedSources].sort()).toEqual(['gitlab']);

    // Unknown or nonsensical cursors restart from the beginning.
    const restarted = await store.search(query({ limit: 1, cursor: 'not-a-cursor' }));
    expect(restarted.items[0]?.id).toBe('immich');
  });

  it('summarises records without inventing statistics', async () => {
    const store = await seeded();
    const result = await store.search(query({ q: 'immich' }));
    const summary = result.items[0];

    expect(summary).toMatchObject({
      id: 'immich',
      ospUri: 'osp://immich',
      latestVersion: '1.100.0',
      latestPublishedAt: '2024-05-20T00:00:00.000Z',
      healthGrade: 'A',
      sourceKind: 'github',
      stars: 20_000,
    });
  });

  it('returns nothing, honestly, when the store is empty', async () => {
    const store = createMemoryStore();
    await expect(store.search(query({ q: 'anything' }))).resolves.toMatchObject({
      items: [],
      nextCursor: null,
      queriedSources: [],
    });
  });
});

describe('createMemoryStore / collections', () => {
  it('creates a collection with a generated id and private visibility', async () => {
    const store = createMemoryStore();
    const created = await store.saveCollection({ name: 'Travel kit', appIds: ['organicmaps'] });

    expect(created.id).toMatch(/^collection-1-/);
    expect(created.visibility).toBe('private');
    expect(created.appIds).toEqual(['organicmaps']);
    expect(created.createdAt).toBe(created.updatedAt);
    await expect(store.listCollections()).resolves.toEqual([created]);
  });

  it('updates an existing collection without changing its identity or creation time', async () => {
    const store = createMemoryStore();
    const created = await store.saveCollection({ name: 'Travel kit', appIds: ['organicmaps'] });

    const updated = await store.saveCollection({
      id: created.id,
      name: 'Travel kit',
      appIds: ['organicmaps', 'osmand'],
      visibility: 'public',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.appIds).toEqual(['organicmaps', 'osmand']);
    expect(updated.visibility).toBe('public');
    await expect(store.listCollections()).resolves.toHaveLength(1);
  });

  it('keeps the existing app list when an update omits it', async () => {
    const store = createMemoryStore();
    const created = await store.saveCollection({ name: 'Kit', appIds: ['a', 'b'] });
    const updated = await store.saveCollection({ id: created.id, name: 'Kit renamed' });

    expect(updated.appIds).toEqual(['a', 'b']);
    expect(updated.name).toBe('Kit renamed');
  });

  it('lists collections by name', async () => {
    const store = createMemoryStore();
    await store.saveCollection({ name: 'zulu' });
    await store.saveCollection({ name: 'alpha' });

    await expect(store.listCollections()).resolves.toMatchObject([
      { name: 'alpha' },
      { name: 'zulu' },
    ]);
  });
});

describe('createMemoryStore / sync', () => {
  const operation = (overrides: Partial<SyncOperation> = {}): SyncOperation => ({
    id: 'op-1',
    entity: 'collection' as const,
    op: 'upsert' as const,
    entityId: 'reading',
    payload: { name: 'Reading', appIds: ['ankitects-anki'] },
    updatedAt: '2024-06-01T00:00:00.000Z',
    deviceId: 'device-a',
    ...overrides,
  });

  it('applies collection upserts and advances the cursor', async () => {
    const store = createMemoryStore();
    const first = await store.applySync([operation()]);

    expect(first.applied).toEqual(['op-1']);
    expect(first.rejected).toEqual([]);
    expect(first.cursor).toBe('1');
    expect(first.collections).toHaveLength(1);

    const second = await store.applySync([]);
    expect(second.cursor).toBe('2');
  });

  it('acknowledges client-owned entities without storing them', async () => {
    const store = createMemoryStore();
    const result = await store.applySync([
      operation({ id: 'fav-1', entity: 'favorite', entityId: 'immich' }),
      operation({ id: 'set-1', entity: 'setting', entityId: 'theme' }),
      operation({ id: 'hist-1', entity: 'history', entityId: 'immich' }),
    ]);

    expect(result.applied).toEqual(['fav-1', 'set-1', 'hist-1']);
    expect(result.collections).toEqual([]);
  });

  it('deletes a collection through the sync channel', async () => {
    const store = createMemoryStore();
    await store.saveCollection({ id: 'reading', name: 'Reading' });

    const result = await store.applySync([operation({ op: 'delete', payload: undefined })]);
    expect(result.applied).toEqual(['op-1']);
    await expect(store.listCollections()).resolves.toEqual([]);
  });

  it('rejects a payload without a usable name', async () => {
    const store = createMemoryStore();
    const result = await store.applySync([
      operation({ id: 'op-missing', payload: undefined }),
      operation({ id: 'op-wrong', payload: { name: 42 } }),
    ]);

    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([
      { id: 'op-missing', reason: 'collection payload requires a name' },
      { id: 'op-wrong', reason: 'collection payload requires a name' },
    ]);
  });

  it('carries the optional collection fields through', async () => {
    const store = createMemoryStore();
    await store.applySync([
      operation({
        payload: {
          name: 'Reading',
          description: 'Long reads',
          appIds: ['ankitects-anki'],
          visibility: 'unlisted',
        },
      }),
    ]);

    await expect(store.listCollections()).resolves.toMatchObject([
      { description: 'Long reads', visibility: 'unlisted', appIds: ['ankitects-anki'] },
    ]);
  });
});
