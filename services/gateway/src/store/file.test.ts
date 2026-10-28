import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppRecord, Release } from '@orbisyn/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileStore } from './file.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function temporaryStorePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orbisyn-file-store-'));
  directories.push(directory);
  return join(directory, 'nested', 'store.json');
}

function app(id: string): AppRecord {
  return {
    id,
    ospUri: `osp://${id}`,
    name: `App ${id}`,
    license: 'MIT',
    platforms: ['android'],
    categories: ['utilities'],
    tags: [],
    screenshots: [],
    source: {
      kind: 'github',
      id,
      host: 'github.com',
      path: `example/${id}`,
      webUrl: `https://github.com/example/${id}`,
    },
    alternateSources: [],
    archived: false,
    fetchedAt: '2025-01-01T00:00:00.000Z',
  };
}

function release(appId: string, version: string): Release {
  return {
    id: `${appId}:${version}`,
    appId,
    source: 'github',
    version,
    channel: 'stable',
    isPrerelease: false,
    publishedAt: '2025-01-01T00:00:00.000Z',
    sourceUrl: `https://github.com/example/${appId}/releases/tag/${version}`,
    artifacts: [],
    fetchedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('createFileStore', () => {
  it('persists records, releases, and collections across store instances', async () => {
    const filePath = await temporaryStorePath();
    const first = await createFileStore({ filePath });
    await Promise.all([
      first.store.saveApp(app('alpha'), [release('alpha', '1.0.0')]),
      first.store.saveApp(app('beta'), [release('beta', '2.0.0')]),
    ]);
    const collection = await first.store.saveCollection({
      name: 'Essentials',
      appIds: ['alpha', 'beta'],
      visibility: 'private',
    });

    const restarted = await createFileStore({ filePath });
    await expect(restarted.store.findApp('alpha')).resolves.toMatchObject({ name: 'App alpha' });
    await expect(restarted.store.findApp('beta')).resolves.toMatchObject({ name: 'App beta' });
    await expect(restarted.store.listReleases('alpha', 10)).resolves.toMatchObject([
      { version: '1.0.0' },
    ]);
    await expect(restarted.store.listCollections()).resolves.toMatchObject([
      { id: collection.id, name: 'Essentials', appIds: ['alpha', 'beta'] },
    ]);
  });

  it('persists the sync cursor so a restart does not replay an older cursor', async () => {
    const filePath = await temporaryStorePath();
    const first = await createFileStore({ filePath });
    const operation = {
      id: 'op-1',
      entity: 'collection' as const,
      op: 'upsert' as const,
      entityId: 'reading-list',
      payload: { name: 'Reading list', appIds: ['alpha'], visibility: 'private' as const },
      updatedAt: '2025-01-01T00:00:00.000Z',
      deviceId: 'device-a',
    };

    await expect(first.store.applySync([operation])).resolves.toMatchObject({
      cursor: '1',
      applied: ['op-1'],
    });

    const restarted = await createFileStore({ filePath });
    await expect(restarted.store.applySync([])).resolves.toMatchObject({
      cursor: '2',
      collections: [{ id: 'reading-list', name: 'Reading list' }],
    });
  });

  it('refuses to silently replace a corrupt or unsupported snapshot', async () => {
    const filePath = await temporaryStorePath();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not json', 'utf8');

    await expect(createFileStore({ filePath })).rejects.toThrow(/not valid JSON/);
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{not json');
  });

  it('rolls back an in-memory mutation when the durable write fails', async () => {
    const filePath = await temporaryStorePath();
    const store = await createFileStore({ filePath });
    await mkdir(dirname(filePath), { recursive: true });
    await mkdir(filePath);

    await expect(store.store.saveApp(app('not-saved'), [])).rejects.toThrow(/cannot persist/);
    await expect(store.store.findApp('not-saved')).resolves.toBeNull();
  });

  it('writes complete valid snapshots using an atomic replacement', async () => {
    const filePath = await temporaryStorePath();
    const store = await createFileStore({ filePath });
    await store.store.saveApp(app('atomic'), [release('atomic', '1.0.0')]);

    const raw = JSON.parse(await readFile(filePath, 'utf8')) as {
      version: number;
      apps: { app: { id: string }; releases: { version: string }[] }[];
    };
    expect(raw.version).toBe(1);
    expect(raw.apps).toMatchObject([{ app: { id: 'atomic' }, releases: [{ version: '1.0.0' }] }]);
  });
});
