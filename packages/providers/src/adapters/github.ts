import type {
  AppRecord,
  HttpResponse,
  Platform,
  ProviderContext,
  ProviderDescriptor,
  ProviderResolution,
  Release,
  RepositoryRef,
  RepositoryTelemetry,
  ResolveOptions,
  SourceProvider,
} from '@orbisyn/core';
import {
  DomainError,
  deriveAppId,
  forgeKindForHost,
  normalizeLicense,
  parseSourceUrl,
  slugify,
} from '@orbisyn/core';
import { ensureSuccess, ensureSuccessOrNull, lastPageFromLinkHeader } from '../http/errors.js';
import { createCollector, releaseStatistics } from '../shared/collect.js';
import type { RawRelease } from '../shared/releases.js';
import { buildRelease, normalizeTimestamp, takeReleases } from '../shared/releases.js';

/* -------------------------------------------------------------------------- */
/* Upstream payload shapes (only the fields we consume)                        */
/* -------------------------------------------------------------------------- */

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  default_branch: string;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count?: number;
  pushed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  topics?: string[];
  language?: string | null;
  license: { spdx_id?: string | null; name?: string | null; url?: string | null } | null;
  owner: { login: string; avatar_url: string; html_url: string } | null;
}

interface GithubAsset {
  id: number;
  name: string;
  size: number;
  content_type: string | null;
  browser_download_url: string;
  digest?: string | null;
}

interface GithubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
  tarball_url: string | null;
  zipball_url: string | null;
  assets: GithubAsset[];
}

interface GithubCommit {
  commit: { committer: { date: string } | null; author: { date: string } | null };
}

interface GithubContentEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

/* -------------------------------------------------------------------------- */

const DESCRIPTOR: ProviderDescriptor = {
  kind: 'github',
  label: 'GitHub',
  homepage: 'https://github.com',
  status: 'stable',
  examples: ['https://github.com/bitwarden/android', 'github.com/florisboard/florisboard'],
  capabilities: {
    resolveApp: true,
    listReleases: true,
    listArtifacts: true,
    verifyArtifacts: true,
    repositoryStats: true,
    projectGovernance: true,
    authenticated: true,
  },
};

const RELEASES_PER_PAGE = 30;

export function createGithubProvider(baseUrl = 'https://api.github.com'): SourceProvider {
  return {
    descriptor: DESCRIPTOR,
    supports: (reference) => supportsGithubReference(reference),

    async resolve(
      reference: string,
      context: ProviderContext,
      options: ResolveOptions,
    ): Promise<ProviderResolution> {
      const { host, path } = parseSourceUrl(reference);
      const [owner, name] = path.split('/');
      if (owner === undefined || name === undefined) {
        throw DomainError.invalidReference(reference, 'expected github.com/{owner}/{repository}');
      }

      const api = createApi(baseUrl, context);
      const repo = await api.repo(owner, name);
      const appId = deriveAppId(
        host.length > 0 ? host : 'github.com',
        `${owner}/${name}`,
        slugify(name),
      );

      // Telemetry is optional: each call is isolated so one refusal (a missing
      // token, a disabled endpoint) degrades a single health component instead
      // of failing the whole resolution.
      const collector = createCollector(context.logger);
      const contributors = await collector.run('github contributors', () =>
        api.contributors(owner, name),
      );
      const lastCommitAt = await collector.run('github latest commit', () =>
        api.lastCommitDate(owner, name),
      );
      const rootEntries = await collector.run('github root contents', () =>
        api.contents(owner, name, ''),
      );
      const dotGithubEntries = await collector.run('github .github contents', () =>
        api.contents(owner, name, '.github'),
      );

      const rawReleases = await api.releases(owner, name, options.releases);
      const now = context.clock.now();
      const releases = rawReleases.map((raw) =>
        buildRelease(raw, {
          appId,
          source: 'github',
          fetchedAt: context.clock.isoNow(),
        }),
      );

      const repository: RepositoryRef = {
        kind: 'github',
        id: String(repo.id),
        host: 'github.com',
        path: repo.full_name,
        webUrl: repo.html_url,
        ...(repo.default_branch === undefined ? {} : { defaultBranch: repo.default_branch }),
      };

      const license = normalizeLicense(repo.license?.spdx_id ?? repo.license?.name ?? null);
      const stats = releaseStatistics(
        rawReleases
          .map((release) => release.publishedAt)
          .filter((value): value is string => value !== null),
        now,
      );

      const telemetry: RepositoryTelemetry = {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        contributors,
        lastCommitAt,
        releasesLastYear: stats.releasesLastYear,
        medianReleaseIntervalDays: stats.medianIntervalDays,
        archived: repo.archived,
        hasSecurityPolicy:
          rootEntries === null ? null : hasFile(rootEntries, ['SECURITY.md', 'security.md']),
        hasContributingGuide:
          rootEntries === null && dotGithubEntries === null
            ? null
            : hasFile(rootEntries ?? [], ['CONTRIBUTING.md', 'CONTRIBUTING.rst', 'CONTRIBUTING']) ||
              hasFile(dotGithubEntries ?? [], ['CONTRIBUTING.md']),
        hasCi: dotGithubEntries === null ? null : hasDirectory(dotGithubEntries, 'workflows'),
        licenseSpdx: license.spdx,
      };

      const latest = releases[0];
      const app: AppRecord = {
        id: appId,
        ospUri: `osp://${appId}`,
        name: repo.name,
        ...(repo.description === null || repo.description.length === 0
          ? {}
          : { summary: repo.description }),
        ...(repo.description === null ? {} : { description: repo.description }),
        ...(repo.homepage === null || repo.homepage.length === 0
          ? {}
          : { homepage: repo.homepage }),
        ...(repo.owner === null ? {} : { iconUrl: repo.owner.avatar_url }),
        screenshots: [],
        license: license.id,
        ...(repo.license?.url === null || repo.license?.url === undefined
          ? {}
          : { licenseFile: repo.license.url }),
        categories: normalizeTopics(repo.topics),
        tags: normalizeTopics(repo.topics),
        platforms: platformsFromReleases(releases),
        ...(repo.owner === null ? {} : { author: repo.owner.login }),
        source: repository,
        alternateSources: [],
        ...(latest === undefined ? {} : { latestRelease: latest, latestVersion: latest.version }),
        archived: repo.archived,
        fetchedAt: context.clock.isoNow(),
      };

      if (collector.warnings.length > 0) {
        context.logger.debug('github resolution completed with warnings', {
          warnings: collector.warnings,
        });
      }

      return { app, releases, telemetry };
    },
  };
}

export function supportsGithubReference(reference: string): boolean {
  const value = reference.trim();
  if (/^github\.com\//i.test(value) || /^https?:\/\/(www\.)?github\.com\//i.test(value))
    return true;
  try {
    const { host, segments } = parseSourceUrl(value);
    if (forgeKindForHost(host) === 'github') return segments.length >= 2;
  } catch {
    return false;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* API client                                                                 */
/* -------------------------------------------------------------------------- */

function createApi(baseUrl: string, context: ProviderContext) {
  const token = context.credentials.get('github')?.token;
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token === undefined || token.length === 0 ? {} : { authorization: `Bearer ${token}` }),
  };

  const request = (path: string): Promise<HttpResponse> =>
    context.http.request({
      url: `${baseUrl}${path}`,
      headers,
      timeoutMs: context.timeoutMs,
    });

  const call = async (path: string): Promise<HttpResponse> => {
    const response = await request(path);
    ensureSuccess(response, 'github');
    return response;
  };

  return {
    async repo(owner: string, name: string): Promise<GithubRepo> {
      const response = await call(`/repos/${owner}/${name}`);
      return (await response.json()) as GithubRepo;
    },

    async contributors(owner: string, name: string): Promise<number | null> {
      const response = await context.http.request({
        url: `${baseUrl}/repos/${owner}/${name}/contributors?per_page=1&anon=1`,
        headers,
        timeoutMs: context.timeoutMs,
      });
      const usable = await ensureSuccessOrNull(response, 'github');
      if (usable === null) return null;
      return lastPageFromLinkHeader(usable.headers.link);
    },

    async lastCommitDate(owner: string, name: string): Promise<string | null> {
      const response = await context.http.request({
        url: `${baseUrl}/repos/${owner}/${name}/commits?per_page=1`,
        headers,
        timeoutMs: context.timeoutMs,
      });
      const usable = await ensureSuccessOrNull(response, 'github');
      if (usable === null) return null;
      const commits = (await usable.json()) as GithubCommit[];
      const first = commits[0];
      if (first === undefined) return null;
      const date = first.commit.committer?.date ?? first.commit.author?.date ?? null;
      return date === null ? null : normalizeTimestamp(date);
    },

    /**
     * Returns `[]` when the directory genuinely does not exist (404) and `null`
     * when we cannot tell — a distinction the health score depends on.
     */
    async contents(
      owner: string,
      name: string,
      path: string,
    ): Promise<readonly GithubContentEntry[] | null> {
      const response = await context.http.request({
        url: `${baseUrl}/repos/${owner}/${name}/contents/${path}`,
        headers,
        timeoutMs: context.timeoutMs,
      });
      if (response.status === 404) return [];
      const usable = await ensureSuccessOrNull(response, 'github');
      if (usable === null) return null;
      const payload = (await usable.json()) as GithubContentEntry[] | GithubContentEntry;
      return Array.isArray(payload) ? payload : [payload];
    },

    async releases(owner: string, name: string, limit: number): Promise<readonly RawRelease[]> {
      if (limit <= 0) return [];
      const pages = Math.ceil(limit / RELEASES_PER_PAGE);
      const collected: RawRelease[] = [];

      for (let page = 1; page <= pages; page += 1) {
        const response = await call(
          `/repos/${owner}/${name}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`,
        );
        const payload = (await response.json()) as GithubRelease[];
        const mapped = payload.filter((release) => !release.draft).map(mapRelease);
        collected.push(...mapped);
        if (payload.length < RELEASES_PER_PAGE) break;
      }

      return takeReleases(collected, limit);
    },
  };
}

function mapRelease(release: GithubRelease): RawRelease {
  const publishedAt = release.published_at ?? release.created_at;
  return {
    id: String(release.id),
    version: release.tag_name,
    tag: release.tag_name,
    ...(release.name === null ? {} : { title: release.name }),
    ...(release.body === null ? {} : { notes: release.body }),
    notesUrl: `${release.html_url}#release-notes`,
    publishedAt: normalizeTimestamp(publishedAt),
    isPrerelease: release.prerelease,
    sourceUrl: release.html_url,
    assets: [
      ...release.assets.map((asset) => ({
        name: asset.name,
        url: asset.browser_download_url,
        sizeBytes: asset.size,
        ...(asset.content_type === null ? {} : { contentType: asset.content_type }),
        ...(parseSha256Digest(asset.digest) === undefined
          ? {}
          : {
              checksum: parseSha256Digest(asset.digest) as { algorithm: 'sha256'; value: string },
            }),
      })),
      ...sourceArchives(release),
    ],
  };
}

/**
 * GitHub publishes `digest: "sha256:…"` on assets. When present it is a
 * provider-verified checksum, which is strictly better than anything we could
 * compute client-side.
 */
function parseSha256Digest(
  digest: string | null | undefined,
): { algorithm: 'sha256'; value: string } | undefined {
  if (digest === null || digest === undefined) return undefined;
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest.trim());
  if (match?.[1] === undefined) return undefined;
  return { algorithm: 'sha256', value: match[1].toLowerCase() };
}

/**
 * Source archives are mirrors of the tag, not installers. They are kept (with
 * `listingOnly` set downstream) because many projects ship *only* a tarball.
 */
function sourceArchives(release: GithubRelease): readonly {
  name: string;
  url: string;
  contentType: string;
}[] {
  const entries: { name: string; url: string; contentType: string }[] = [];
  if (release.tarball_url !== null) {
    entries.push({
      name: `${release.tag_name}.tar.gz`,
      url: release.tarball_url,
      contentType: 'application/gzip',
    });
  }
  if (release.zipball_url !== null) {
    entries.push({
      name: `${release.tag_name}.zip`,
      url: release.zipball_url,
      contentType: 'application/zip',
    });
  }
  return entries;
}

function platformsFromReleases(releases: readonly Release[]): readonly Platform[] {
  const platforms = new Set<Platform>();
  for (const release of releases) {
    for (const artifact of release.artifacts) {
      platforms.add(artifact.platform);
    }
  }
  // A repository with no attached builds is still a viable source of truth.
  if (platforms.size === 0) platforms.add('web');
  return [...platforms].sort();
}

function normalizeTopics(topics: readonly string[] | undefined): readonly string[] {
  if (topics === undefined) return [];
  return [
    ...new Set(
      topics.map((topic) => topic.toLowerCase().trim()).filter((topic) => topic.length > 0),
    ),
  ]
    .slice(0, 16)
    .sort();
}

function hasFile(entries: readonly GithubContentEntry[], names: readonly string[]): boolean {
  const lowered = new Set(entries.map((entry) => entry.name.toLowerCase()));
  return names.some((name) => lowered.has(name.toLowerCase()));
}

function hasDirectory(entries: readonly GithubContentEntry[], name: string): boolean {
  return entries.some(
    (entry) => entry.type === 'dir' && entry.name.toLowerCase() === name.toLowerCase(),
  );
}
