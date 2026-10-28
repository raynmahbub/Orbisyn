import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  detectChannel,
  isNewer,
  parseVersion,
  requireVersion,
  sortByVersionDesc,
  toSemver,
} from './version.js';

describe('parseVersion', () => {
  it('parses plain semantic versions', () => {
    const parsed = parseVersion('1.2.3');
    expect(parsed.core).toEqual([1, 2, 3]);
    expect(parsed.channel).toBe('stable');
    expect(parsed.isValid).toBe(true);
    expect(parsed.isCalver).toBe(false);
  });

  it('tolerates a leading v and a build suffix', () => {
    const parsed = parseVersion('v2.0.1+build.7');
    expect(parsed.core).toEqual([2, 0, 1]);
    expect(parsed.build).toBe('build.7');
  });

  it('detects pre-release channels and keeps their identifiers', () => {
    expect(parseVersion('1.0.0-beta.2').channel).toBe('beta');
    expect(parseVersion('1.0.0-beta.2').prerelease).toEqual(['beta', 2]);
    expect(parseVersion('3.1.0-rc1').channel).toBe('rc');
    expect(parseVersion('2024.09.1-nightly').channel).toBe('nightly');
    expect(parseVersion('2.0.0-alpha').channel).toBe('beta');
  });

  it('keeps a purely numeric packaging revision on the stable channel', () => {
    // `v1.21.11-1` is the current Forgejo stable build, not a pre-release.
    expect(parseVersion('v1.21.11-1').channel).toBe('stable');
    expect(parseVersion('2.1.60-1').channel).toBe('stable');
    expect(parseVersion('1.0.0-2').prerelease).toEqual([2]);
  });

  it('recognises calendar versioning', () => {
    expect(parseVersion('2024.10.1').isCalver).toBe(true);
    expect(parseVersion('24.10').isCalver).toBe(false);
  });

  it('marks unusable input instead of throwing', () => {
    expect(parseVersion('latest').isValid).toBe(false);
    expect(parseVersion('').isValid).toBe(false);
  });
});

describe('requireVersion', () => {
  it('throws a domain error for unparseable input', () => {
    expect(() => requireVersion('nightly')).toThrowError(/not usable/);
  });
});

describe('compareVersions', () => {
  it('orders by numeric segments, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('treats a pre-release as older than its stable release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('orders numeric identifiers before alphanumeric ones', () => {
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
  });

  it('compares calendar versions correctly', () => {
    expect(compareVersions('2024.09.1', '2023.12.9')).toBeGreaterThan(0);
  });

  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });
});

describe('isNewer', () => {
  it('treats a missing baseline as an update', () => {
    expect(isNewer('1.0.0', null)).toBe(true);
    expect(isNewer('1.0.0', '')).toBe(true);
  });

  it('falls back to inequality when the baseline is unparseable', () => {
    expect(isNewer('1.0.0', 'rolling')).toBe(true);
    expect(isNewer('rolling', 'rolling')).toBe(false);
  });
});

describe('sortByVersionDesc', () => {
  it('sorts newest first and keeps invalid versions stable', () => {
    const items = ['1.0.0', '1.2.0', '1.1.9'];
    expect(sortByVersionDesc(items, (value) => value)).toEqual(['1.2.0', '1.1.9', '1.0.0']);
  });
});

describe('detectChannel', () => {
  it('reports unknown for unparseable versions', () => {
    expect(detectChannel('latest')).toBe('unknown');
  });

  it('reports unknown when the version is stable but flagged prerelease', () => {
    expect(detectChannel('1.0.0', true)).toBe('unknown');
    expect(detectChannel('1.0.0', false)).toBe('stable');
  });
});

describe('toSemver', () => {
  it('normalises to major.minor.patch', () => {
    expect(toSemver('v1.2')).toBe('1.2.0');
    expect(toSemver('1.2.3-rc.1')).toBe('1.2.3-rc.1');
    expect(toSemver('rolling')).toBeUndefined();
  });
});
