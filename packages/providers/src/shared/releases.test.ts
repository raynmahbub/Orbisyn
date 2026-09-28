import { describe, expect, it } from 'vitest';
import type { RawRelease } from './releases.js';
import {
  buildRelease,
  medianReleaseIntervalDays,
  normalizeTimestamp,
  orderReleases,
  summarizeNotes,
  takeReleases,
} from './releases.js';

function raw(overrides: Partial<RawRelease> = {}): RawRelease {
  return {
    id: '1',
    version: '1.0.0',
    publishedAt: '2024-01-01T00:00:00Z',
    isPrerelease: false,
    sourceUrl: 'https://example.org/releases/1.0.0',
    assets: [],
    ...overrides,
  };
}

describe('buildRelease', () => {
  it('derives the channel, the id and the artifacts', () => {
    const release = buildRelease(
      raw({
        version: '2.0.0-rc.1',
        isPrerelease: true,
        assets: [{ name: 'app-2.0.0.apk', url: 'https://example.org/app.apk', sizeBytes: 10 }],
      }),
      { appId: 'example', source: 'github', fetchedAt: '2024-06-01T00:00:00.000Z' },
    );

    expect(release.id).toBe('example:1');
    expect(release.appId).toBe('example');
    expect(release.channel).toBe('rc');
    expect(release.isPrerelease).toBe(true);
    expect(release.publishedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(release.artifacts[0]?.platform).toBe('android');
  });

  it('marks source archives as listings rather than installers', () => {
    const release = buildRelease(
      raw({ assets: [{ name: 'v1.0.0.tar.gz', url: 'https://example.org/a.tar.gz' }] }),
      {
        appId: 'example',
        source: 'gitlab',
        fetchedAt: '2024-06-01T00:00:00.000Z',
      },
    );
    expect(release.artifacts[0]?.listingOnly).toBe(true);
  });
});

describe('orderReleases', () => {
  it('ranks stable builds above pre-releases of the same line', () => {
    const ordered = orderReleases([
      raw({ id: 'rc', version: '1.21.0-rc1' }),
      raw({ id: 'stable', version: '1.21.0' }),
      raw({ id: 'beta', version: '1.21.0-beta.2' }),
    ]);
    expect(ordered.map((release) => release.id)).toEqual(['stable', 'rc', 'beta']);
  });

  it('orders by version, then by publication date', () => {
    const ordered = orderReleases([
      raw({ id: 'old', version: '1.0.0', publishedAt: '2023-01-01T00:00:00Z' }),
      raw({ id: 'new', version: '1.0.0', publishedAt: '2024-01-01T00:00:00Z' }),
      raw({ id: 'big', version: '2.0.0' }),
    ]);
    expect(ordered.map((release) => release.id)).toEqual(['big', 'new', 'old']);
  });

  it('still orders releases whose tags are not semantic versions', () => {
    const ordered = orderReleases([
      raw({ id: 'a', version: 'rolling', publishedAt: '2024-01-01T00:00:00Z' }),
      raw({ id: 'b', version: 'rolling', publishedAt: '2024-05-01T00:00:00Z' }),
    ]);
    expect(ordered.map((release) => release.id)).toEqual(['b', 'a']);
  });
});

describe('takeReleases', () => {
  it('returns the newest N releases', () => {
    const releases = [
      raw({ id: '1', version: '1.0.0' }),
      raw({ id: '2', version: '3.0.0' }),
      raw({ id: '3', version: '2.0.0' }),
    ];
    expect(takeReleases(releases, 2).map((entry) => entry.id)).toEqual(['2', '3']);
    expect(takeReleases(releases, 0)).toEqual([]);
  });
});

describe('summarizeNotes', () => {
  it('removes CI noise and collapses blank lines', () => {
    const notes = summarizeNotes(
      "# What's changed\n\n* Fix\n\n\n\n**Full changelog**: https://x\n<!-- comment -->",
    );
    expect(notes).toBe('* Fix');
  });

  it('truncates long notes on a line boundary', () => {
    const long = Array.from({ length: 200 }, (_, index) => `* Change number ${index}`).join('\n');
    const notes = summarizeNotes(long, 200);
    expect(notes.length).toBeLessThanOrEqual(205);
    expect(notes.endsWith('…')).toBe(true);
  });
});

describe('medianReleaseIntervalDays', () => {
  it('computes the median of the intervals between releases', () => {
    expect(
      medianReleaseIntervalDays([
        '2024-01-01T00:00:00Z',
        '2024-01-11T00:00:00Z',
        '2024-01-31T00:00:00Z',
      ]),
    ).toBe(15);
  });

  it('returns null when there is nothing to compare', () => {
    expect(medianReleaseIntervalDays([])).toBeNull();
    expect(medianReleaseIntervalDays(['2024-01-01T00:00:00Z'])).toBeNull();
  });
});

describe('normalizeTimestamp', () => {
  it('falls back to the epoch for missing or invalid dates', () => {
    expect(normalizeTimestamp('2024-05-01T10:00:00Z')).toBe('2024-05-01T10:00:00.000Z');
    expect(normalizeTimestamp(null)).toBe('1970-01-01T00:00:00.000Z');
    expect(normalizeTimestamp('not a date')).toBe('1970-01-01T00:00:00.000Z');
  });
});
