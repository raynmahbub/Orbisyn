import type { SourceKind } from '@orbisyn/core';
import { isDomainError } from '@orbisyn/core';

/**
 * Provider availability tracker.
 *
 * Rate limits and forge outages are routine, not exceptional. Recording the last
 * failure per provider lets `/health` report *degraded* with a reason, instead
 * of a binary up/down that hides which upstream is struggling.
 */
export interface ProviderHealthSnapshot {
  readonly kind: SourceKind;
  readonly state: 'enabled' | 'disabled';
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly consecutiveFailures: number;
  readonly lastErrorCode: string | null;
}

export interface ProviderHealthTracker {
  recordSuccess(kind: SourceKind): void;
  recordFailure(kind: SourceKind, error: unknown): void;
  snapshot(): readonly ProviderHealthSnapshot[];
  isDegraded(): boolean;
}

export function createProviderHealthTracker(
  enabled: readonly SourceKind[],
  clock: { isoNow(): string } = { isoNow: () => new Date().toISOString() },
): ProviderHealthTracker {
  const state = new Map<SourceKind, ProviderHealthSnapshot>(
    enabled.map((kind) => [
      kind,
      {
        kind,
        state: 'enabled',
        lastFailureAt: null,
        lastSuccessAt: null,
        consecutiveFailures: 0,
        lastErrorCode: null,
      },
    ]),
  );

  const update = (
    kind: SourceKind,
    mutate: (current: ProviderHealthSnapshot) => ProviderHealthSnapshot,
  ): void => {
    const current = state.get(kind) ?? {
      kind,
      state: 'enabled' as const,
      lastFailureAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      lastErrorCode: null,
    };
    state.set(kind, mutate(current));
  };

  return {
    recordSuccess(kind) {
      update(kind, (current) => ({
        ...current,
        lastSuccessAt: clock.isoNow(),
        consecutiveFailures: 0,
        lastErrorCode: null,
      }));
    },

    recordFailure(kind, error) {
      update(kind, (current) => ({
        ...current,
        lastFailureAt: clock.isoNow(),
        consecutiveFailures: current.consecutiveFailures + 1,
        lastErrorCode: isDomainError(error) ? error.code : 'unknown',
      }));
    },

    snapshot() {
      return [...state.values()].sort((left, right) => left.kind.localeCompare(right.kind));
    },

    isDegraded() {
      // Three failures in a row on any provider means partial service.
      return [...state.values()].some((entry) => entry.consecutiveFailures >= 3);
    },
  };
}
