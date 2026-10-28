import type { SyncConflict, SyncOperation, SyncResult } from '../model.js';
import type { AppStorePort, ClockPort, LoggerPort } from '../ports.js';

/**
 * SyncLibrary.
 *
 * Offline-first means the client keeps working while disconnected and uploads a
 * *stream* of operations later. The server must therefore be idempotent,
 * order-and-conflict aware, and explicit about what it refused to apply.
 *
 * Conflict policy (documented, not improvised):
 *
 * | Case                                   | Resolution      |
 * | -------------------------------------- | --------------- |
 * | remote missing                         | apply           |
 * | local `updatedAt` newer than remote    | apply           |
 * | remote newer than local                | keep remote, report conflict |
 * | equal timestamps, different payload    | report, require manual merge |
 * | operation already acknowledged         | skip (idempotent replay)      |
 */

export interface SyncLibraryDeps {
  readonly store: AppStorePort;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
  /** Reject streams larger than this; protects the gateway from abuse. */
  readonly maxOperations: number;
}

export interface SyncEnvelope {
  readonly deviceId: string;
  readonly cursor: string | null;
  readonly operations: readonly SyncOperation[];
}

export class SyncLibraryUseCase {
  constructor(private readonly deps: SyncLibraryDeps) {}

  async execute(envelope: SyncEnvelope): Promise<SyncResult> {
    if (envelope.operations.length > this.deps.maxOperations) {
      throw new Error(`sync stream exceeds ${this.deps.maxOperations} operations`);
    }

    const deletesForUnknownEntities = new Set<string>();
    const conflicts: SyncConflict[] = [];
    const applicable: SyncOperation[] = [];

    const collections = await this.deps.store.listCollections();
    const byId = new Map(collections.map((collection) => [collection.id, collection]));

    for (const operation of dedupeById(envelope.operations)) {
      if (operation.entity !== 'collection') {
        applicable.push(operation);
        continue;
      }

      const existing = byId.get(operation.entityId);
      if (operation.op === 'delete' && existing === undefined) {
        deletesForUnknownEntities.add(operation.entityId);
        continue;
      }
      if (existing === undefined) {
        applicable.push(operation);
        continue;
      }

      const comparison = compareTimestamps(operation.updatedAt, existing.updatedAt);
      if (comparison > 0) {
        applicable.push(operation);
        continue;
      }
      if (comparison < 0) {
        conflicts.push({
          entityId: operation.entityId,
          localUpdatedAt: operation.updatedAt,
          remoteUpdatedAt: existing.updatedAt,
          resolution: 'remote-wins',
        });
        continue;
      }

      if (samePayload(operation, existing)) continue;

      conflicts.push({
        entityId: operation.entityId,
        localUpdatedAt: operation.updatedAt,
        remoteUpdatedAt: existing.updatedAt,
        resolution: 'manual',
      });
    }

    const applied = await this.deps.store.applySync(applicable);
    this.deps.logger.info('sync applied', {
      deviceId: envelope.deviceId,
      received: envelope.operations.length,
      applied: applied.applied.length,
      conflicts: conflicts.length,
      ignoredDeletes: deletesForUnknownEntities.size,
    });

    return {
      cursor: applied.cursor,
      applied: applied.applied,
      rejected: applied.rejected,
      conflicts,
      collections: applied.collections,
    };
  }
}

function dedupeById(operations: readonly SyncOperation[]): readonly SyncOperation[] {
  const seen = new Map<string, SyncOperation>();
  for (const operation of operations) {
    const previous = seen.get(operation.id);
    if (previous === undefined || compareTimestamps(operation.updatedAt, previous.updatedAt) > 0) {
      seen.set(operation.id, operation);
    }
  }
  return [...seen.values()];
}

function compareTimestamps(left: string, right: string): number {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function samePayload(operation: SyncOperation, existing: { appIds: readonly string[] }): boolean {
  const payload = operation.payload;
  if (payload === null || typeof payload !== 'object' || !('appIds' in payload)) return false;
  const candidate = (payload as { appIds?: unknown }).appIds;
  if (!Array.isArray(candidate)) return false;
  if (candidate.length !== existing.appIds.length) return false;
  return candidate.every((value, index) => value === existing.appIds[index]);
}
