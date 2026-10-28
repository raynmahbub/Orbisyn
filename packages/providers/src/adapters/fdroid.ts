import type {
  AppRecord,
  Checksum,
  Platform,
  ProviderContext,
  ProviderDescriptor,
  ProviderResolution,
  Release,
  RepositoryRef,
  RepositoryTelemetry,
  SourceProvider,
} from '@orbisyn/core';
import { DomainError, normalizeLicense, slugify } from '@orbisyn/core';
import { ensureSuccess, ensureSuccessOrNull } from '../http/errors.js';
import { createCollector, releaseStatistics } from '../shared/collect.js';
import type { RawRelease } from '../shared/releases.js';
import { buildRelease } from '../shared/releases.js';

/**
 * F-Droid adapter.
 *
 * F-Droid is the strongest source in our set for *verification*: every version
 * comes with a SHA-256 hash and the signing certificate fingerprint, so an
 * artifact can be independently confirmed. Metadata that only exists in HTML is
 * scraped conservatively, and anything we cannot confirm is reported as
 * unknown rather than guessed.
 */

interface FdroidVersion {
  versionCode: number;
  versionName?: string | null;
  apkName?: string | null;
  hash?: string | null;
  hashType?: string | null;
  size?: number | null;
  added?: number | null;
  signer?: string | null;
  minSdkVersion?: number | null;
  maxSdkVersion?: number | null;
  nativeCode?: string[] | null;
  permissions?: string[] | null;
}

export interface FdroidAdapterOptions {
  readonly apiBaseUrl?: string;
  readonly webBaseUrl?: string;
  readonly repoBaseUrl?: string;
}

const DESCRIPTOR: ProviderDescriptor = {
  kind: 'fdroid',
  label: 'F-Droid',
  homepage: 'https://f-droid.org',
  status: 'stable',
  examples: [
    'https://f-droid.org/packages/org.fdroid.fdroid',
    'org.telegram.messenger',
    'fdroid:com.termux',
  ],
  capabilities: {
    resolveApp: true,
    listReleases: true,
    listArtifacts: true,
    // The index carries a signature fingerprint and a hash for every APK.
    verifyArtifacts: true,
    // F-Droid publishes no stars/forks: the score reflects that honestly.
    repositoryStats: false,
    projectGovernance: true,
    authenticated: false,
  },
};

const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,}$/i;

export function createFdroidProvider(options: FdroidAdapterOptions = {}): SourceProvider {
  const apiBaseUrl = options.apiBaseUrl ?? 'https://f-droid.org/api/v1';
  const webBaseUrl = options.webBaseUrl ?? 'https://f-droid.org';
  const repoBaseUrl = options.repoBaseUrl ?? 'https://f-droid.org/repo';

  return {
    descriptor: DESCRIPTOR,
    supports: supportsFdroidReference,

    async resolve(reference, context, resolveOptions): Promise<ProviderResolution> {
      const packageName = extractPackageName(reference);
      if (packageName === null) {
        throw DomainError.invalidReference(
          reference,
          'expected an F-Droid package name or package URL',
        );
      }

      const versions = await fetchVersions(apiBaseUrl, packageName, context);
      if (versions.length === 0) {
        throw DomainError.notFound(`F-Droid has no published versions for ${packageName}`, {
          packageName,
        });
      }

      const appId = `fdroid-${slugify(packageName)}`;
      const collector = createCollector(context.logger);

      // Metadata scraping is optional: the index alone is enough to resolve.
      const pageMeta = await collector.run('fdroid package page', () =>
        fetchPackagePage(webBaseUrl, packageName, context),
      );

      const rawReleases: RawRelease[] = versions
        .slice()
        .sort((left, right) => right.versionCode - left.versionCode)
        .map((version) => mapVersion(repoBaseUrl, packageName, version));

      const releases = rawReleases.map((raw) =>
        buildRelease(raw, { appId, source: 'fdroid', fetchedAt: context.clock.isoNow() }),
      );

      const limited =
        resolveOptions.releases <= 0
          ? ([] as readonly Release[])
          : releases.slice(0, resolveOptions.releases);

      const stats = releaseStatistics(
        rawReleases.map((release) => release.publishedAt),
        context.clock.now(),
      );

      const license = normalizeLicense(pageMeta?.license ?? null);
      const telemetry: RepositoryTelemetry = {
        stars: null,
        forks: null,
        openIssues: null,
        contributors: null,
        // F-Droid publishes no commit history; release recency is our signal.
        lastCommitAt: rawReleases[0]?.publishedAt ?? null,
        releasesLastYear: stats.releasesLastYear,
        medianReleaseIntervalDays: stats.medianIntervalDays,
        archived: false,
        // The index says nothing about the project's own security policy.
        hasSecurityPolicy: null,
        hasContributingGuide: null,
        hasCi: null,
        licenseSpdx: license.spdx,
      };

      const repository: RepositoryRef = {
        kind: 'fdroid',
        id: packageName,
        host: new URL(webBaseUrl).host,
        path: `packages/${packageName}`,
        webUrl: `${webBaseUrl}/en/packages/${packageName}/`,
      };

      const latest = limited[0];
      const app: AppRecord = {
        id: appId,
        ospUri: `osp://${appId}`,
        name: pageMeta?.name ?? packageName,
        ...(pageMeta?.summary === undefined
          ? {}
          : { summary: pageMeta.summary, description: pageMeta.summary }),
        ...(pageMeta?.website === undefined ? {} : { homepage: pageMeta.website }),
        ...(pageMeta?.iconUrl === undefined ? {} : { iconUrl: pageMeta.iconUrl }),
        screenshots: pageMeta?.screenshots ?? [],
        license: license.id,
        categories: pageMeta?.categories ?? [],
        tags: ['f-droid', ...(pageMeta?.categories ?? [])],
        platforms: ['android'] satisfies Platform[],
        ...(pageMeta?.author === undefined ? {} : { author: pageMeta.author }),
        source: repository,
        alternateSources: [],
        ...(latest === undefined ? {} : { latestRelease: latest, latestVersion: latest.version }),
        archived: false,
        fetchedAt: context.clock.isoNow(),
      };

      return { app, releases: limited, telemetry };
    },
  };
}

/**
 * Accepted spellings:
 *   f-droid.org/packages/<pkg> · f-droid.org/en/packages/<pkg>
 *   fdroid:<pkg> · <pkg> (reverse-DNS, at least one dot)
 */
export function supportsFdroidReference(reference: string): boolean {
  return extractPackageName(reference) !== null;
}

export function extractPackageName(reference: string): string | null {
  const value = reference.trim();
  if (value.length === 0) return null;

  if (/^fdroid:/i.test(value)) {
    const candidate = value.slice('fdroid:'.length).replace(/^\/+/, '');
    return PACKAGE_NAME.test(candidate) ? candidate : null;
  }

  if (/^(https?:\/\/)?(www\.)?f-droid\.org\//i.test(value)) {
    const match = /\/(?:[a-z]{2}\/)?packages\/([^/?#]+)/i.exec(value);
    const candidate = match?.[1];
    return candidate !== undefined && PACKAGE_NAME.test(candidate) ? candidate : null;
  }

  // A bare reverse-DNS identifier: no slashes, at least two segments.
  if (!value.includes('/') && !value.includes(' ') && PACKAGE_NAME.test(value)) {
    return value;
  }

  return null;
}

async function fetchVersions(
  apiBaseUrl: string,
  packageName: string,
  context: ProviderContext,
): Promise<readonly FdroidVersion[]> {
  const response = await context.http.request({
    url: `${apiBaseUrl}/packages/${encodeURIComponent(packageName)}`,
    timeoutMs: context.timeoutMs,
  });
  if (response.status === 404) return [];
  ensureSuccess(response, 'fdroid');
  const payload = (await response.json()) as FdroidVersion[] | FdroidVersion;
  return Array.isArray(payload) ? payload : [payload];
}

function mapVersion(repoBaseUrl: string, packageName: string, version: FdroidVersion): RawRelease {
  const versionLabel = version.versionName ?? String(version.versionCode);
  const apkName = version.apkName ?? `${packageName}_${version.versionCode}.apk`;
  const checksum = parseChecksum(version);

  return {
    id: String(version.versionCode),
    version: versionLabel,
    ...(version.versionCode === undefined ? {} : { tag: String(version.versionCode) }),
    ...(version.versionName === null || version.versionName === undefined
      ? {}
      : { title: version.versionName }),
    publishedAt:
      version.added === null || version.added === undefined
        ? new Date(0).toISOString()
        : new Date(version.added).toISOString(),
    isPrerelease: false,
    sourceUrl: `${repoBaseUrl}/${apkName}`,
    assets: [
      {
        name: apkName,
        url: `${repoBaseUrl}/${apkName}`,
        ...(version.size === null || version.size === undefined ? {} : { sizeBytes: version.size }),
        contentType: 'application/vnd.android.package-archive',
        ...(checksum === undefined ? {} : { checksum }),
        ...(version.signer === null || version.signer === undefined
          ? {}
          : { signature: { scheme: 'apk-v2' as const, keyId: version.signer } }),
      },
    ],
  };
}

function parseChecksum(version: FdroidVersion): Checksum | undefined {
  const hash = version.hash;
  if (hash === null || hash === undefined || hash.length === 0) return undefined;
  const declared = (version.hashType ?? 'sha256').toLowerCase();
  const algorithm: Checksum['algorithm'] =
    declared === 'sha1'
      ? 'sha1'
      : declared === 'md5'
        ? 'md5'
        : declared === 'sha512'
          ? 'sha512'
          : 'sha256';
  return { algorithm, value: hash.toLowerCase() };
}

/* -------------------------------------------------------------------------- */
/* HTML metadata (best effort, clearly documented as such)                     */
/* -------------------------------------------------------------------------- */

export interface FdroidPageMeta {
  readonly name?: string;
  readonly summary?: string;
  readonly iconUrl?: string;
  readonly license?: string;
  readonly website?: string;
  readonly author?: string;
  readonly categories?: readonly string[];
  readonly screenshots?: readonly string[];
}

export async function fetchPackagePage(
  webBaseUrl: string,
  packageName: string,
  context: ProviderContext,
): Promise<FdroidPageMeta | null> {
  const response = await context.http.request({
    url: `${webBaseUrl}/en/packages/${packageName}/`,
    headers: { accept: 'text/html' },
    timeoutMs: context.timeoutMs,
  });
  const usable = await ensureSuccessOrNull(response, 'fdroid');
  if (usable === null) return null;
  return parsePackagePage(await usable.text());
}

/**
 * Parses the small, stable subset of the package page we depend on. Every value
 * is optional: if F-Droid changes its markup, resolution still succeeds with
 * the API data alone.
 */
export function parsePackagePage(html: string): FdroidPageMeta {
  const tags: Record<string, string> = {};
  const metaTag = /<meta\s+[^>]*>/gi;
  for (const tag of html.match(metaTag) ?? []) {
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key !== undefined && content !== undefined)
      tags[key.toLowerCase()] = decodeEntities(content);
  }

  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const packageTitle = /<h3[^>]*>([^<]*)<\/h3>/i.exec(html)?.[1];
  const name = (packageTitle ?? tags['og:title'] ?? title ?? '')
    .replace(/\s*\|\s*F-Droid.*$/i, '')
    .trim();

  const licenseMatch = /License:[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/i.exec(html);
  const websiteMatch =
    /<a[^>]+class=["'][^"']*external[^"']*["'][^>]+href=["'](https?:\/\/[^"']+)["']/i.exec(html);
  const iconMatch =
    /<img[^>]+class=["'][^"']*package-icon[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html);
  const summary = tags['og:description'] ?? tags.description;
  const authorMatch = /Author:[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/i.exec(html);
  const categories = [...html.matchAll(/href="\/en\/packages\/\?category=([^"&]+)"/gi)]
    .map((match) =>
      decodeURIComponent(match[1] ?? '')
        .replace(/\+/g, ' ')
        .trim()
        .toLowerCase(),
    )
    .filter((value) => value.length > 0);

  const screenshots = [
    ...html.matchAll(/<img[^>]+class=["'][^"']*screenshot[^"']*["'][^>]+src=["']([^"']+)["']/gi),
  ]
    .map((match) => match[1] ?? '')
    .filter((value) => value.length > 0)
    .slice(0, 12);

  return {
    ...(name.length === 0 ? {} : { name }),
    ...(summary === undefined ? {} : { summary }),
    ...(websiteMatch?.[1] === undefined ? {} : { website: websiteMatch[1] }),
    ...(iconMatch?.[1] === undefined ? {} : { iconUrl: absoluteIcon(iconMatch[1]) }),
    ...(licenseMatch?.[1] === undefined ? {} : { license: licenseMatch[1].trim() }),
    ...(authorMatch?.[1] === undefined ? {} : { author: authorMatch[1].trim() }),
    ...(categories.length === 0 ? {} : { categories: [...new Set(categories)] }),
    ...(screenshots.length === 0 ? {} : { screenshots }),
  };
}

function absoluteIcon(value: string): string {
  if (value.startsWith('http')) return value;
  return value.startsWith('/') ? `https://f-droid.org${value}` : `https://f-droid.org/${value}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
