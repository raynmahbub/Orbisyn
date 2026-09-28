import type {
  AppRecord,
  Platform,
  ProviderContext,
  ProviderDescriptor,
  ProviderResolution,
  SourceProvider,
} from '@orbisyn/core';
import {
  classifyArtifact,
  DomainError,
  extensionFor,
  parseSourceUrl,
  slugify,
} from '@orbisyn/core';
import type { RawAsset } from '../shared/releases.js';
import { buildRelease } from '../shared/releases.js';

/**
 * Direct URL adapter — the escape hatch.
 *
 * Not every project lives in a forge feed: there are mirrors, vendor download
 * pages, `nightly.link` bundles and jailbroken iOS builds. Given nothing but a
 * URL we issue a `HEAD` (falling back to a ranged `GET` for servers that reject
 * it) and construct the most honest record the evidence supports: a single
 * release whose version is parsed from the file name, with everything we could
 * not observe left explicitly unknown.
 *
 * This provider never claims to know a licence, and therefore never scores the
 * project's licensing component.
 */

const DESCRIPTOR: ProviderDescriptor = {
  kind: 'direct-url',
  label: 'Direct download',
  homepage: 'https://github.com/raynmahbub/Orbisyn/blob/main/docs/providers/direct-url.md',
  status: 'beta',
  examples: [
    'https://example.org/releases/app-1.4.2.apk',
    'https://mirror.example.org/tool-2.0.AppImage',
  ],
  capabilities: {
    resolveApp: true,
    listReleases: false,
    listArtifacts: true,
    verifyArtifacts: false,
    repositoryStats: false,
    projectGovernance: false,
    authenticated: false,
  },
};

/**
 * `app-1.4.2-arm64-v8a.apk` → `1.4.2`; `tool_v2.0.AppImage` → `2.0`;
 * `build-2.1.0-rc3.apk` → `2.1.0-rc3`. Architecture and platform tokens
 * (`arm64`, `x86_64`, `universal`, `linux` …) are never part of a version.
 */
const VERSION_CORE = /v?(\d+(?:\.\d+){1,3})/;
const PRERELEASE_SUFFIX = /^[-_.]?(alpha|beta|rc|preview|pre|nightly|snapshot|dev)\.?(\d{1,3})?/i;
const VERSION_IN_NAME = /v?\d+(?:\.\d+){1,3}/;

export function createDirectUrlProvider(): SourceProvider {
  return {
    descriptor: DESCRIPTOR,
    supports: (reference) => supportsDirectUrl(reference),

    async resolve(reference, context, options): Promise<ProviderResolution> {
      const parsed = safeParse(reference);
      if (parsed === null) {
        throw DomainError.invalidReference(reference, 'expected an absolute http(s) URL');
      }
      if (
        parsed.host === 'github.com' ||
        parsed.host === 'gitlab.com' ||
        parsed.host === 'codeberg.org'
      ) {
        // Forge URLs must go through their structured adapter: guessing from a
        // page URL would produce a worse record than the API does.
        throw DomainError.invalidReference(
          reference,
          `${parsed.host} URLs are resolved by the ${parsed.host.split('.')[0]} provider`,
        );
      }

      const probe = await probeUrl(reference, context);
      const fileName = probe.fileName ?? fileNameFromPath(parsed.path);
      const platform = classifyArtifact({
        fileName,
        ...(probe.contentType === undefined ? {} : { contentType: probe.contentType }),
        url: reference,
      }).platform;

      const version = versionFromFileName(fileName);
      const appId = deriveUrlAppId(parsed.host, fileName);

      const asset: RawAsset = {
        name: fileName,
        url: reference,
        ...(probe.sizeBytes === undefined ? {} : { sizeBytes: probe.sizeBytes }),
        ...(probe.contentType === undefined ? {} : { contentType: probe.contentType }),
      };

      const release = buildRelease(
        {
          id: `${appId}@${version}`,
          version,
          title: fileName,
          publishedAt: probe.lastModified ?? new Date(0).toISOString(),
          isPrerelease: false,
          sourceUrl: reference,
          assets: [asset],
        },
        {
          appId,
          source: 'direct-url',
          fetchedAt: context.clock.isoNow(),
          defaultPlatform: platform,
        },
      );

      const releases = options.releases <= 0 ? [] : [release];
      const platformSet = new Set<Platform>([platform]);

      const app: AppRecord = {
        id: appId,
        ospUri: `osp://${appId}`,
        name: humanizeFileName(fileName),
        summary: `Download distributed directly from ${parsed.host}`,
        screenshots: [],
        license: 'unknown',
        categories: [],
        tags: ['direct-download'],
        platforms: [...platformSet],
        source: {
          kind: 'direct-url',
          id: reference,
          host: parsed.host,
          path: parsed.path,
          webUrl: `${parsed.protocol}://${parsed.host}`,
        },
        alternateSources: [],
        latestRelease: release,
        ...(version === 'unknown' ? {} : { latestVersion: version }),
        archived: false,
        fetchedAt: context.clock.isoNow(),
      };

      return {
        app,
        releases,
        telemetry: {
          stars: null,
          forks: null,
          openIssues: null,
          contributors: null,
          lastCommitAt: probe.lastModified ?? null,
          releasesLastYear: null,
          medianReleaseIntervalDays: null,
          archived: false,
          hasSecurityPolicy: null,
          hasContributingGuide: null,
          hasCi: null,
          licenseSpdx: null,
        },
      };
    },
  };
}

export function supportsDirectUrl(reference: string): boolean {
  return safeParse(reference) !== null;
}

interface ProbeResult {
  readonly sizeBytes?: number;
  readonly contentType?: string;
  readonly fileName?: string;
  readonly lastModified?: string;
}

async function probeUrl(url: string, context: ProviderContext): Promise<ProbeResult> {
  const head = await context.http.request({ url, method: 'HEAD', timeoutMs: context.timeoutMs });

  if (head.status === 405 || head.status === 501) {
    const ranged = await context.http.request({
      url,
      headers: { range: 'bytes=0-0' },
      timeoutMs: context.timeoutMs,
    });
    return fromHeaders(ranged.headers, ranged.status);
  }

  if (!head.ok) {
    throw DomainError.notFound(`the URL ${url} responded with ${head.status}`, { url });
  }

  return fromHeaders(head.headers, head.status);
}

function fromHeaders(headers: Readonly<Record<string, string>>, status: number): ProbeResult {
  const length = headers['content-length'];
  const disposition = headers['content-disposition'];
  const fileName = disposition === undefined ? undefined : parseContentDisposition(disposition);
  const contentType = headers['content-type']?.split(';')[0]?.trim();
  const sizeBytes =
    length === undefined
      ? undefined
      : status === 206
        ? undefined
        : Number.isFinite(Number.parseInt(length, 10))
          ? Number.parseInt(length, 10)
          : undefined;

  return {
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
    ...(contentType === undefined || contentType.length === 0 ? {} : { contentType }),
    ...(fileName === undefined ? {} : { fileName }),
    ...(headers['last-modified'] === undefined
      ? {}
      : { lastModified: new Date(headers['last-modified']).toISOString() }),
  };
}

function parseContentDisposition(value: string): string | undefined {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8?.[1] !== undefined) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1]?.trim();
}

function fileNameFromPath(path: string): string {
  const last = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .at(-1);
  return last === undefined || last.length === 0 ? 'download' : last;
}

function versionFromFileName(fileName: string): string {
  const core = VERSION_CORE.exec(fileName);
  if (core?.[1] === undefined) return 'unknown';

  const index = (core.index ?? 0) + core[0].length;
  const suffix = PRERELEASE_SUFFIX.exec(fileName.slice(index));
  if (suffix?.[1] === undefined) return core[1];

  const label = suffix[1].toLowerCase();
  return suffix[2] === undefined ? `${core[1]}-${label}` : `${core[1]}-${label}.${suffix[2]}`;
}

function humanizeFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]{1,8}$/i, '');
  const withoutVersion = withoutExtension.replace(/[-_.]?v?\d+(\.\d+){1,3}.*$/i, '');
  const base = withoutVersion.length > 0 ? withoutVersion : withoutExtension;
  const words = base
    // `ExampleApp` and `example_app` both read best as two words.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length === 0) return 'Direct download';
  return words.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function deriveUrlAppId(host: string, fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]{1,8}$/i, '').replace(VERSION_IN_NAME, '');
  const base = slugify(stem.length > 2 ? stem : host.split('.').slice(0, 2).join('-'));
  // Two different files on the same host must not collapse into one id.
  const suffix = slugify(extensionFor(undefined, fileName)).slice(0, 12);
  return `${base}-${suffix}`.slice(0, 96).replace(/-+$/g, '');
}

function safeParse(reference: string): ReturnType<typeof parseSourceUrl> | null {
  const value = reference.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return parseSourceUrl(value);
  } catch {
    return null;
  }
}
