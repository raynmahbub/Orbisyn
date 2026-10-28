import type { AppRecord } from '@orbisyn/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore } from './local-store.js';

/**
 * Device-local state is the user's own data, and it is the only state Orbisyn
 * keeps. These tests cover the operations the interface depends on: favouriting,
 * install tracking, the resolution cache and the export path.
 */
beforeEach(async () => {
  await localStore.clearCache();
  await localStore.saveSettings({ theme: 'dark', defaultChannel: 'stable', cacheTtlMinutes: 60 });
  for (const id of await localStore.favourites()) await localStore.toggleFavourite(id);
  for (const entry of await localStore.installed()) await localStore.removeInstall(entry.appId);
  // Favourites are toggled off rather than cleared: the store owns plain
  // IndexedDB keys and the public surface stays small on purpose.
});

const app: AppRecord = {
  id: 'florisboard',
  ospUri: 'osp://florisboard',
  name: 'FlorisBoard',
  license: 'Apache-2.0',
  platforms: ['android'],
  categories: ['keyboard'],
  archived: false,
  fetchedAt: '2024-06-01T00:00:00.000Z',
  source: {
    kind: 'github',
    id: 'florisboard/florisboard',
    host: 'github.com',
    path: 'florisboard/florisboard',
    webUrl: 'https://github.com/florisboard/florisboard',
  },
  alternateSources: [],
  screenshots: [],
  tags: [],
};

describe('favourites', () => {
  it('toggles an app on and off, reporting the resulting state', async () => {
    expect(await localStore.toggleFavourite('florisboard')).toBe(true);
    expect(await localStore.favourites()).toEqual(['florisboard']);
    expect(await localStore.toggleFavourite('florisboard')).toBe(false);
    expect(await localStore.favourites()).toEqual([]);
  });
});

describe('installed apps', () => {
  it('replaces an entry for the same app instead of duplicating it', async () => {
    await localStore.recordInstall({
      appId: 'florisboard',
      name: 'FlorisBoard',
      version: '0.3.0',
      channel: 'stable',
      installedAt: '2024-01-01T00:00:00.000Z',
    });
    await localStore.recordInstall({
      appId: 'florisboard',
      name: 'FlorisBoard',
      version: '0.4.0',
      channel: 'stable',
      installedAt: '2024-02-01T00:00:00.000Z',
    });

    const installed = await localStore.installed();
    expect(installed).toHaveLength(1);
    expect(installed[0]?.version).toBe('0.4.0');
  });

  it('removes an entry by app id', async () => {
    await localStore.recordInstall({
      appId: 'florisboard',
      name: 'FlorisBoard',
      version: '0.4.0',
      channel: 'stable',
      installedAt: '2024-02-01T00:00:00.000Z',
    });
    await localStore.removeInstall('florisboard');
    expect(await localStore.installed()).toEqual([]);
  });
});

describe('resolution cache', () => {
  it('stores a resolution with a TTL and reads it back by key', async () => {
    await localStore.cacheResolution('resolve:florisboard', { app, releases: [] }, 60);

    const cached = await localStore.readResolution('resolve:florisboard');
    expect(cached?.app.id).toBe('florisboard');
    expect(cached?.storedAt).toBeDefined();
    expect(new Date(cached?.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('replaces a previous entry for the same key and returns null for unknown keys', async () => {
    await localStore.cacheResolution('resolve:florisboard', { app, releases: [] }, 60);
    await localStore.cacheResolution(
      'resolve:florisboard',
      { app: { ...app, name: 'FlorisBoard 2' }, releases: [] },
      60,
    );

    expect(await localStore.readResolution('resolve:florisboard')).toMatchObject({
      app: { name: 'FlorisBoard 2' },
    });
    expect(await localStore.readResolution('resolve:missing')).toBeNull();
  });
});

describe('settings', () => {
  it('merges stored values over the defaults', async () => {
    await localStore.saveSettings({ theme: 'light', defaultChannel: 'beta', cacheTtlMinutes: 15 });
    expect(await localStore.settings()).toEqual({
      theme: 'light',
      defaultChannel: 'beta',
      cacheTtlMinutes: 15,
    });
  });
});

describe('onboarding', () => {
  it('is unseen until it is marked seen', async () => {
    expect(await localStore.onboardingSeen()).toBe(false);
    await localStore.markOnboardingSeen();
    expect(await localStore.onboardingSeen()).toBe(true);
  });
});

describe('exportData', () => {
  it('produces a portable document describing only this device', async () => {
    await localStore.toggleFavourite('florisboard');
    const exported = JSON.parse(await localStore.exportData()) as Record<string, unknown>;

    expect(exported.schema).toBe('orbisyn.user-data/1');
    expect(exported.favourites).toEqual(['florisboard']);
    expect(exported.exportedAt).toBeTypeOf('string');
  });
});
