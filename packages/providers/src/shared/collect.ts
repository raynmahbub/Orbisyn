import type { LoggerPort } from '@orbisyn/core';
import { isDomainError } from '@orbisyn/core';
import { medianReleaseIntervalDays } from './releases.js';

/**
 * Optional telemetry must never break a resolution.
 *
 * A forge that refuses one statistics endpoint (missing token, disabled API,
 * upstream 500) should degrade the health score, not the whole app record. Every
 * optional call goes through {@link collect}, which records failures as warnings
 * and resolves to `null`.
 */

export interface Collector {
  readonly warnings: string[];
  run<T>(label: string, work: () => Promise<T>): Promise<T | null>;
  runAll(entries: ReadonlyArray<readonly [string, () => Promise<unknown>]>): Promise<void>;
}

export function createCollector(logger: LoggerPort): Collector {
  const warnings: string[] = [];

  const run = async <T>(label: string, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      const message = isDomainError(error) ? `${error.code}: ${error.message}` : describe(error);
      warnings.push(`${label} unavailable (${message})`);
      logger.debug('optional provider call failed', { label, reason: message });
      return null;
    }
  };

  return {
    warnings,
    run,
    async runAll(entries): Promise<void> {
      // Sequential by design: predictable upstream load and per-call rate limits.
      for (const [label, work] of entries) {
        await run(label, work);
      }
    },
  };
}

export interface ReleaseStatistics {
  readonly releasesLastYear: number | null;
  readonly medianIntervalDays: number | null;
}

export function releaseStatistics(publishedAt: readonly string[], now: Date): ReleaseStatistics {
  const timestamps = publishedAt
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return { releasesLastYear: null, medianIntervalDays: null };
  }
  const yearAgo = now.getTime() - 365 * 86_400_000;
  const recent = timestamps.filter((value) => value >= yearAgo).length;
  return {
    releasesLastYear: recent,
    medianIntervalDays: medianReleaseIntervalDays(publishedAt),
  };
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}
