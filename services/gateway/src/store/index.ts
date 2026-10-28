import type { AppStorePort } from '@orbisyn/core';
import { createMemoryStore } from './memory.js';

/**
 * Store composition.
 *
 * Everything the gateway persists goes through `AppStorePort`. Tests and
 * embedded callers can use the in-memory adapter; the process entry point uses
 * the atomic JSON file adapter for durable single-instance self-hosting.
 */

/**
 * Identifies the active backend in `/api/health`, which is how an operator
 * confirms what a running instance actually mounted.
 */
export type StoreKind = 'memory' | 'file';

export interface StoreBundle {
  readonly store: AppStorePort;
  readonly kind: StoreKind;
}

export function createStore(options: { maxApps?: number } = {}): StoreBundle {
  const maxApps = options.maxApps ?? 10_000;
  return { store: createMemoryStore({ maxApps }), kind: 'memory' };
}

export { createFileStore } from './file.js';
