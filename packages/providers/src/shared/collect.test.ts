import { DomainError } from '@orbisyn/core';
import { describe, expect, it, vi } from 'vitest';
import { createCollector, describe as describeError, releaseStatistics } from './collect.js';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

describe('createCollector', () => {
  it('returns the value of a successful call and records no warning', async () => {
    const collector = createCollector(logger);
    await expect(collector.run('stars', async () => 42)).resolves.toBe(42);
    expect(collector.warnings).toEqual([]);
  });

  it('degrades a failing optional call into a warning', async () => {
    const collector = createCollector(logger);

    const result = await collector.run('contributors', async () => {
      throw new DomainError({ code: 'source-rate-limited', message: 'API rate limit exceeded' });
    });

    expect(result).toBeNull();
    expect(collector.warnings).toEqual([
      'contributors unavailable (source-rate-limited: API rate limit exceeded)',
    ]);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('describes a failure that is not a domain error', async () => {
    const collector = createCollector(logger);
    await collector.run('commits', async () => {
      throw new Error('socket hang up');
    });
    expect(collector.warnings[0]).toContain('socket hang up');
  });

  it('runs a batch sequentially so upstream load stays predictable', async () => {
    const collector = createCollector(logger);
    const order: string[] = [];

    await collector.runAll([
      ['a', async () => order.push('a')],
      ['b', async () => order.push('b')],
      ['c', async () => order.push('c')],
    ]);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('keeps going when one call in a batch fails', async () => {
    const collector = createCollector(logger);
    const order: string[] = [];

    await collector.runAll([
      ['a', async () => order.push('a')],
      [
        'b',
        async () => {
          throw new Error('nope');
        },
      ],
      ['c', async () => order.push('c')],
    ]);

    expect(order).toEqual(['a', 'c']);
    expect(collector.warnings).toHaveLength(1);
  });
});

describe('releaseStatistics', () => {
  const now = new Date('2024-06-01T00:00:00.000Z');

  it('counts releases from the last year and the median interval', () => {
    const stats = releaseStatistics(
      ['2024-05-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z', '2023-01-01T00:00:00.000Z'],
      now,
    );

    expect(stats.releasesLastYear).toBe(2);
    expect(stats.medianIntervalDays).toBeGreaterThan(0);
  });

  it('returns nulls when nothing is published', () => {
    expect(releaseStatistics([], now)).toEqual({
      releasesLastYear: null,
      medianIntervalDays: null,
    });
  });

  it('ignores timestamps that cannot be parsed', () => {
    const stats = releaseStatistics(['not-a-date', '2024-05-01T00:00:00.000Z'], now);
    expect(stats.releasesLastYear).toBe(1);
  });
});

describe('describe', () => {
  it('reads errors, strings and everything else', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('boom')).toBe('boom');
    expect(describeError({ code: 'x' })).toBe('unknown error');
  });
});
