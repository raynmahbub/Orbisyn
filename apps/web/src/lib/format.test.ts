import type { AppSummary } from '@orbisyn/core';
import { describe, expect, it } from 'vitest';
import {
  absoluteDate,
  channelTone,
  downloadName,
  fileSize,
  formatDuration,
  healthTone,
  licenseSummary,
  licenseTone,
  platformGlyph,
  platformLabel,
  relativeTime,
} from './format.js';

describe('platform helpers', () => {
  it('labels every platform the domain knows about', () => {
    expect(platformLabel('android')).toBe('Android');
    expect(platformLabel('linux')).toBe('Linux');
    expect(platformGlyph('ios')).toBe('🍎');
  });
});

describe('date formatting', () => {
  it('formats absolute dates and refuses to invent one for the epoch', () => {
    expect(absoluteDate(null)).toBe('unknown');
    expect(absoluteDate('1970-01-01T00:00:00.000Z')).toBe('unknown');
    expect(absoluteDate('2024-05-01T10:00:00.000Z')).toMatch(/2024/);
  });

  it('describes recent timestamps relatively', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toMatch(/hour/);
    expect(relativeTime(null)).toBe('unknown');
  });
});

describe('artifact naming and sizes', () => {
  it('prefers the upstream file name, falls back to the URL, then the MIME type', () => {
    expect(downloadName({ url: 'https://x/a', fileName: 'app-1.0.apk' })).toBe('app-1.0.apk');
    expect(downloadName({ url: 'https://x/releases/app-1.0.apk?token=1' })).toBe('app-1.0.apk');
    expect(
      downloadName({ url: 'https://x/download', contentType: 'application/x-debian-package' }),
    ).toBe('download.deb');
  });

  it('renders human readable sizes', () => {
    expect(fileSize(undefined)).toBe('unknown size');
    expect(fileSize(1024)).toBe('1.00 KiB');
  });
});

describe('licence presentation', () => {
  it('classifies licence obligations for the UI', () => {
    expect(licenseTone('MIT')).toBe('permissive');
    expect(licenseTone('GPL-3.0-or-later')).toBe('copyleft');
    expect(licenseTone('AGPL-3.0')).toBe('network');
    expect(licenseTone('Proprietary')).toBe('unknown');
  });

  it('explains the licence in a sentence', () => {
    expect(licenseSummary('MIT')).toContain('Permissive');
    expect(licenseSummary('Proprietary thing')).toContain('not declared upstream');
  });
});

describe('badge tones', () => {
  it('maps health grades to tones', () => {
    expect(healthTone('A')).toBe('success');
    expect(healthTone('C')).toBe('warning');
    expect(healthTone('E')).toBe('error');
    expect(healthTone(null)).toBe('neutral');
  });

  it('maps release channels to tones', () => {
    expect(channelTone('stable')).toBe('success');
    expect(channelTone('nightly')).toBe('error');
    expect(channelTone('unknown')).toBe('neutral');
  });
});

describe('formatDuration', () => {
  it('switches units around a second', () => {
    expect(formatDuration(240)).toBe('240 ms');
    expect(formatDuration(1500)).toBe('1.50 s');
    expect(formatDuration(45_000)).toBe('45.0 s');
  });
});

describe('AppSummary contract used by the cards', () => {
  it('keeps the fields the card renders', () => {
    const summary: AppSummary = {
      id: 'example-app',
      ospUri: 'osp://example-app',
      name: 'Example App',
      license: 'MIT',
      platforms: ['android'],
      categories: [],
      archived: false,
      fetchedAt: '2024-06-01T00:00:00.000Z',
      latestVersion: '1.2.0',
      latestPublishedAt: '2024-05-01T00:00:00.000Z',
      healthGrade: 'A',
      sourceKind: 'github',
      stars: 1200,
    };
    expect(summary.latestVersion).toBe('1.2.0');
    expect(platformLabel(summary.platforms[0] as 'android')).toBe('Android');
  });
});
