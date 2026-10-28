import type { Platform, Release } from '@orbisyn/core';
import { extensionFor, formatBytes, normalizeLicense } from '@orbisyn/core';

/**
 * Presentation helpers.
 *
 * Formatting is a real responsibility: a version, a size or a licence rendered
 * wrong is what makes a metadata tool untrustworthy. These functions are pure
 * and unit tested.
 */

const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  android: 'Android',
  ios: 'iOS',
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  web: 'Web',
};

const PLATFORM_GLYPHS: Readonly<Record<Platform, string>> = {
  android: '🤖',
  ios: '🍎',
  macos: '🖥️',
  windows: '🪟',
  linux: '🐧',
  web: '🌐',
};

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}

export function platformGlyph(platform: Platform): string {
  return PLATFORM_GLYPHS[platform];
}

export function relativeTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return 'unknown';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp) || timestamp === 0) return 'unknown';

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(seconds) < 90) return formatter.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 90) return formatter.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return formatter.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 45) return formatter.format(-days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 18) return formatter.format(-months, 'month');
  return formatter.format(-Math.round(days / 365), 'year');
}

export function absoluteDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return 'unknown';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp) || timestamp === 0) return 'unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp);
}

export function fileSize(bytes: number | undefined): string {
  return formatBytes(bytes);
}

export function downloadName(artifact: {
  url: string;
  fileName?: string;
  contentType?: string;
}): string {
  if (artifact.fileName !== undefined && artifact.fileName.length > 0) return artifact.fileName;
  const fromUrl = artifact.url.split('/').pop()?.split('?')[0];
  if (fromUrl?.includes('.')) return fromUrl;
  return `download.${extensionFor(artifact.contentType, undefined)}`;
}

export type LicenseTone = 'permissive' | 'copyleft' | 'network' | 'unknown';

export function licenseTone(license: string): LicenseTone {
  const normalized = normalizeLicense(license);
  if (normalized.spdx === null) return 'unknown';
  if (normalized.copyleft === 'network') return 'network';
  if (normalized.copyleft === 'none') return 'permissive';
  return 'copyleft';
}

export function licenseSummary(license: string): string {
  const normalized = normalizeLicense(license);
  if (normalized.spdx === null) return 'Licence not declared upstream';
  const family: Record<LicenseTone, string> = {
    permissive: 'Permissive licence',
    copyleft: 'Copyleft licence',
    network: 'Network copyleft licence',
    unknown: 'Licence not declared upstream',
  };
  return `${family[licenseTone(license)]} · ${normalized.name}`;
}

export function healthTone(
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | null,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (grade === null) return 'neutral';
  if (grade === 'A' || grade === 'B') return 'success';
  if (grade === 'C') return 'warning';
  return 'error';
}

export function channelTone(
  channel: Release['channel'],
): 'success' | 'warning' | 'error' | 'neutral' {
  switch (channel) {
    case 'stable':
      return 'success';
    case 'beta':
    case 'rc':
      return 'warning';
    case 'nightly':
      return 'error';
    default:
      return 'neutral';
  }
}

/** Builds the query string the resolver screen uses for shareable links. */
export function referenceLink(reference: string): string {
  return `/resolve?ref=${encodeURIComponent(reference)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}
