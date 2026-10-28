import type {
  Architecture,
  Artifact,
  Checksum,
  Platform,
  Release,
  ReleaseChannel,
} from '@orbisyn/core';
import { classifyArtifact, compareVersions, detectChannel } from '@orbisyn/core';

/**
 * Release normalisation shared by every forge adapter. Each adapter maps its
 * own payload into {@link RawRelease} and this module turns it into the domain
 * {@link Release}, which guarantees that release ordering, channel detection and
 * artifact classification behave identically across providers.
 */

export interface RawAsset {
  readonly name: string;
  readonly url: string;
  readonly sizeBytes?: number;
  readonly contentType?: string;
  readonly checksum?: Checksum;
  readonly signature?: Artifact['signature'];
}

export interface RawRelease {
  readonly id: string;
  readonly version: string;
  readonly tag?: string;
  readonly title?: string;
  readonly notes?: string;
  readonly notesUrl?: string;
  readonly publishedAt: string;
  readonly isPrerelease: boolean;
  readonly sourceUrl: string;
  readonly assets: readonly RawAsset[];
}

export interface BuildReleaseOptions {
  readonly appId: string;
  readonly source: Release['source'];
  readonly fetchedAt: string;
  /** Fallback platform when an asset carries no recognisable installer hint. */
  readonly defaultPlatform?: Platform;
}

export function buildRelease(raw: RawRelease, options: BuildReleaseOptions): Release {
  const channel: ReleaseChannel = detectChannel(raw.version, raw.isPrerelease);

  return {
    id: `${options.appId}:${raw.id}`,
    appId: options.appId,
    source: options.source,
    version: raw.version,
    ...(raw.tag === undefined ? {} : { tag: raw.tag }),
    ...(raw.title === undefined || raw.title.length === 0 ? {} : { title: raw.title }),
    channel,
    isPrerelease: raw.isPrerelease || channel !== 'stable',
    publishedAt: normalizeTimestamp(raw.publishedAt),
    ...(raw.notes === undefined ? {} : { notes: summarizeNotes(raw.notes) }),
    ...(raw.notesUrl === undefined ? {} : { notesUrl: raw.notesUrl }),
    sourceUrl: raw.sourceUrl,
    artifacts: raw.assets.map((asset) => buildArtifact(asset, options.defaultPlatform)),
    fetchedAt: options.fetchedAt,
  };
}

export function buildArtifact(asset: RawAsset, defaultPlatform?: Platform): Artifact {
  const classification = classifyArtifact({
    fileName: asset.name,
    ...(asset.contentType === undefined ? {} : { contentType: asset.contentType }),
    url: asset.url,
  });

  const platform: Platform = defaultPlatform ?? classification.platform;
  const architecture: Architecture = classification.architecture;

  return {
    url: asset.url,
    fileName: asset.name,
    ...(asset.sizeBytes === undefined ? {} : { sizeBytes: asset.sizeBytes }),
    ...(asset.contentType === undefined ? {} : { contentType: asset.contentType }),
    platform,
    architecture,
    ...(asset.checksum === undefined ? {} : { checksum: asset.checksum }),
    ...(asset.signature === undefined ? {} : { signature: asset.signature }),
    listingOnly: !classification.installable,
  };
}

/**
 * Release notes are rendered as Markdown in a mobile view. We strip the noisy
 * parts (CI banners, full commit lists, duplicate whitespace) and cap the size
 * so a 1 MB changelog cannot bloat the cache.
 */
export function summarizeNotes(notes: string, limit = 4_000): string {
  let text = notes
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*#{1,3}\s*(what'?s changed|changelog|full changelog)\s*$/gim, '')
    .replace(/^\s*\*\*full changelog\*\*:\s*.*$/gim, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length <= limit) return text;

  // Cut on a line boundary so we never truncate mid-link or mid-word.
  text = text.slice(0, limit);
  const lastBreak = text.lastIndexOf('\n');
  return `${(lastBreak > limit * 0.6 ? text.slice(0, lastBreak) : text).trimEnd()}\n\n…`;
}

export function normalizeTimestamp(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return new Date(0).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

/**
 * Channel precedence, most release-ready first. A project's stable build must
 * always outrank a pre-release of the same major line: users looking at
 * "latest" expect the build they are told to install.
 */
const CHANNEL_RANK: Readonly<Record<Release['channel'], number>> = {
  stable: 0,
  unknown: 1,
  rc: 2,
  beta: 3,
  nightly: 4,
};

/** Newest first, stable across providers that return releases out of order. */
export function orderReleases(releases: readonly RawRelease[]): readonly RawRelease[] {
  return [...releases].sort((left, right) => {
    const leftChannel = detectChannel(left.version, left.isPrerelease);
    const rightChannel = detectChannel(right.version, right.isPrerelease);
    const byChannel = CHANNEL_RANK[leftChannel] - CHANNEL_RANK[rightChannel];
    if (byChannel !== 0) return byChannel;

    try {
      const byVersion = compareVersions(right.version, left.version);
      if (byVersion !== 0) return byVersion;
    } catch {
      // Fall through to the publication date for non-semver tags.
    }
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });
}

export function takeReleases(
  releases: readonly RawRelease[],
  limit: number,
): readonly RawRelease[] {
  if (limit <= 0) return [];
  return orderReleases(releases).slice(0, limit);
}

/**
 * Median days between the two most recent releases is a poor signal; we use the
 * median of *all* intervals inside the window, which resists a single long gap.
 */
export function medianReleaseIntervalDays(publishedAt: readonly string[]): number | null {
  const timestamps = publishedAt
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (timestamps.length < 2) return null;

  const intervals: number[] = [];
  for (let index = 0; index < timestamps.length - 1; index += 1) {
    const newer = timestamps[index] ?? 0;
    const older = timestamps[index + 1] ?? 0;
    intervals.push((newer - older) / 86_400_000);
  }
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  if (intervals.length % 2 === 1) return intervals[middle] ?? null;
  const left = intervals[middle - 1];
  const right = intervals[middle];
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}
