import { describe, expect, it } from 'vitest';
import type { Collection, SyncOperation } from '../model.js';
import { createFakeStore, silentLogger, testClock } from '../testing/fakes.js';
import { SyncLibraryUseCase } from './sync-library.js';

const DEVICE = 'device-1';

function operation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: 'op-1',
    entity: 'collection',
    op: 'upsert',
    entityId: 'favourites',
    payload: { name: 'Favourites', appIds: ['a', 'b'] },
    updatedAt: '2024-06-01T10:00:00.000Z',
    deviceId: DEVICE,
    ...overrides,
  };
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'favourites',
    name: 'Favourites',
    appIds: ['a'],
    visibility: 'private',
    createdAt: '2024-05-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function build(seed: readonly Collection[] = []) {
  const store = createFakeStore();
  for (const entry of seed) store.collections.set(entry.id, entry);
  const useCase = new SyncLibraryUseCase({
    store,
    clock: testClock('2024-06-01T12:00:00.000Z'),
    logger: silentLogger(),
    maxOperations: 100,
  });
  return { store, useCase };
}

describe('SyncLibraryUseCase', () => {
  it('applies an operation when there is no remote entity yet', async () => {
    const { useCase, store } = build();
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });

    expect(result.applied).toEqual(['op-1']);
    expect(result.conflicts).toHaveLength(0);
    expect(store.collections.get('favourites')?.appIds).toEqual(['a', 'b']);
  });

  it('applies a newer local edit', async () => {
    const { useCase } = build([collection()]);
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });
    expect(result.applied).toEqual(['op-1']);
  });

  it('keeps the remote version when it is newer and reports the conflict', async () => {
    const { useCase, store } = build([
      collection({ updatedAt: '2024-06-02T00:00:00.000Z', appIds: ['remote'] }),
    ]);
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });

    expect(result.applied).toHaveLength(0);
    expect(result.conflicts[0]?.resolution).toBe('remote-wins');
    expect(store.collections.get('favourites')?.appIds).toEqual(['remote']);
  });

  it('escalates same-timestamp divergence to a manual merge', async () => {
    const { useCase } = build([
      collection({ updatedAt: '2024-06-01T10:00:00.000Z', appIds: ['something-else'] }),
    ]);
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });
    expect(result.conflicts[0]?.resolution).toBe('manual');
  });

  it('treats an identical replay as a no-op', async () => {
    const { useCase } = build([
      collection({ updatedAt: '2024-06-01T10:00:00.000Z', appIds: ['a', 'b'] }),
    ]);
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });
    expect(result.applied).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('ignores duplicate operation ids inside one stream', async () => {
    const { useCase } = build();
    const result = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation(), operation({ updatedAt: '2024-06-01T09:00:00.000Z' })],
    });
    expect(result.applied).toEqual(['op-1']);
  });

  it('advances the cursor so the next sync can resume', async () => {
    const { useCase } = build();
    const first = await useCase.execute({
      deviceId: DEVICE,
      cursor: null,
      operations: [operation()],
    });
    const second = await useCase.execute({
      deviceId: DEVICE,
      cursor: first.cursor,
      operations: [],
    });
    expect(Number(second.cursor)).toBeGreaterThan(Number(first.cursor));
  });

  it('rejects streams larger than the configured limit', async () => {
    const { useCase } = build();
    const operations = Array.from({ length: 101 }, (_, index) =>
      operation({ id: `op-${index}`, entityId: `collection-${index}` }),
    );
    await expect(
      useCase.execute({ deviceId: DEVICE, cursor: null, operations }),
    ).rejects.toThrowError(/exceeds 100 operations/);
  });
});
