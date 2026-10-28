import type { AppStorePort } from '@orbisyn/core';
import { createMemoryStore } from './memory.js';

/**
 * Store composition.
 *
 * Everything the gateway persists goes through `AppStorePort`, so replacing the
 * backing implementation is a change to this file alone. The shipped backend
 * keeps its state in the process (see `memory.ts`): a single instance needs no
 * external service, and a deployment that already runs one is free to add a
 * durable backend behind the same port.
 */

/**
 * Identifies the active backend in `/api/health`, which is how an operator
 * confirms what a running instance actually mounted.
 */
export type StoreKind = 'memory' | 'postgres';

export interface StoreBundle {
  readonly store: AppStorePort;
  readonly kind: StoreKind;
}

export function createStore(options: { maxApps?: number } = {}): StoreBundle {
  const maxApps = options.maxApps ?? 10_000;
  return { store: createMemoryStore({ maxApps }), kind: 'memory' };
}
