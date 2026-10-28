import type {
  AppRecord,
  Platform,
  ProviderContext,
  ProviderDescriptor,
  ProviderResolution,
  Release,
  RepositoryRef,
  RepositoryTelemetry,
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
import { ensureSuccess, ensureSuccessOrNull, readTotalCountHeader } from '../http/errors.js';
import { createCollector, releaseStatistics } from '../shared/collect.js';
import type { RawRelease } from '../shared/releases.js';
import { buildRelease, normalizeTimestamp, takeReleases } from '../shared/releases.js';

/**
 * GitLab adapter.
 *
 * Works against gitlab.com and any self-managed instance (`gitlab.example.org`)
 * because every call is relative to a configurable API root.
 */

interface GitlabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  web_url: string;
  default_branch: string | null;
  archived: boolean;
  star_count: number;
  forks_count: number;
  open_issues_count: number;
  last_activity_at: string | null;
  avatar_url: string | null;
  topics?: string[];
  license?: { key?: string | null; name?: string | null; spdx_identifier?: string | null } | null;
  namespace?: { name: string; path: string } | null;
}

interface GitlabRelease {
  tag_name: string;
  name: string | null;
  description: string | null;
  created_at: string;
  released_at: string | null;
  upcoming_release: boolean;
  _links?: { self?: string };
  assets?: {
    count?: number;
    sources?: { format: string; url: string }[];
    links?: {
      id: number;
      name: string;
      url: string;
      direct_asset_url?: string | null;
      link_type?: string;
    }[];
  };
}

interface GitlabCommit {
  committed_date: string;
  created_at: string;
}

const DESCRIPTOR: ProviderDescriptor = {
  kind: 'gitlab',
  label: 'GitLab',
  homepage: 'https://gitlab.com',
  status: 'stable',
  examples: ['https://gitlab.com/KDE/kdenlive', 'gitlab.gnome.org/GNOME/loupe'],
  capabilities: {
    resolveApp: true,
    listReleases: true,
    listArtifacts: true,
    verifyArtifacts: false,
    repositoryStats: true,
    projectGovernance: true,
    authenticated: true,
  },
};

const RELEASES_PER_PAGE = 20;

export function createGitlabProvider(baseUrl = 'https://gitlab.com'): SourceProvider {
  return {
    descriptor: DESCRIPTOR,
    supports: supportsGitlabReference,

    async resolve(reference, context, options): Promise<ProviderResolution> {
      const { host, path } = parseSourceUrl(reference);
      const segments = path.split('/').filter((segment) => segment.length > 0);
      if (segments.length < 2) {
        throw DomainError.invalidReference(reference, 'expected gitlab.com/{namespace}/{project}');
      }
      const projectPath = segments.join('/');
      const encoded = encodeURIComponent(projectPath);
      const instance = instanceFor(host, baseUrl);
      const api = createApi(instance.apiBaseUrl, context);
      const project = await api.project(encoded);

      const appId = deriveAppId(
        host.length > 0 ? host : 'gitlab.com',
        projectPath,
        slugify(project.name),
      );

      const collector = createCollector(context.logger);
      const contributors = await collector.run('gitlab contributors', () =>
        api.contributors(encoded),
      );
      const lastCommitAt = await collector.run('gitlab latest commit', () =>
        api.lastCommitDate(encoded),
      );
      const dotGitlab = await collector.run('gitlab ci config', () =>
        api.fileContent(encoded, '.gitlab-ci.yml'),
      );
      const securityPolicy = await collector.run('gitlab security policy', () =>
        anyFileExists(api, encoded, ['SECURITY.md', '.gitlab/security-policies']),
      );
      const contributingGuide = await collector.run('gitlab contributing guide', () =>
        anyFileExists(api, encoded, ['CONTRIBUTING.md', 'docs/CONTRIBUTING.md']),
      );

      const rawReleases = await api.releases(encoded, options.releases);
      const releases = rawReleases.map((raw) =>
        buildRelease(raw, { appId, source: 'gitlab', fetchedAt: context.clock.isoNow() }),
      );

      const repository: RepositoryRef = {
        kind: 'gitlab',
        id: String(project.id),
        host: new URL(instance.webBaseUrl).host,
        path: project.path_with_namespace,
        webUrl: project.web_url,
        ...(project.default_branch === null ? {} : { defaultBranch: project.default_branch }),
      };

      const license = normalizeLicense(
        project.license?.spdx_identifier ?? project.license?.name ?? null,
      );
      const stats = releaseStatistics(
        rawReleases.map((release) => release.publishedAt),
        context.clock.now(),
      );

      const telemetry: RepositoryTelemetry = {
        stars: project.star_count,
        forks: project.forks_count,
        openIssues: project.open_issues_count,
        contributors,
        lastCommitAt,
        releasesLastYear: stats.releasesLastYear,
        medianReleaseIntervalDays: stats.medianIntervalDays,
        archived: project.archived,
        hasSecurityPolicy: securityPolicy,
        hasContributingGuide: contributingGuide,
        hasCi: dotGitlab === null ? null : dotGitlab.length > 0,
        licenseSpdx: license.spdx,
      };

      const latest = releases[0];
      const topics = normalizeTopics(project.topics);
      const app: AppRecord = {
        id: appId,
        ospUri: `osp://${appId}`,
        name: project.name,
        ...(project.description === null || project.description.length === 0
          ? {}
          : { summary: project.description, description: project.description }),
        homepage: project.web_url,
        ...(project.avatar_url === null ? {} : { iconUrl: project.avatar_url }),
        screenshots: [],
        license: license.id,
        categories: topics,
        tags: topics,
        platforms: platformsFromReleases(releases),
        ...(project.namespace?.name === undefined ? {} : { author: project.namespace.name }),
        source: repository,
        alternateSources: [],
        ...(latest === undefined ? {} : { latestRelease: latest, latestVersion: latest.version }),
        archived: project.archived,
        fetchedAt: context.clock.isoNow(),
      };

      return { app, releases, telemetry };
    },
  };
}

export function supportsGitlabReference(reference: string): boolean {
  const value = reference.trim();
  if (/^gitlab\.com\//i.test(value)) return true;
  if (/^https?:\/\/(www\.)?gitlab\.com\//i.test(value)) return true;
  try {
    const { host } = parseSourceUrl(value);
    return /^gitlab\./i.test(host);
  } catch {
    return false;
  }
}

/**
 * A GitLab reference names its own instance: `gitlab.gnome.org/GNOME/loupe`
 * must be read from gitlab.gnome.org, not from gitlab.com. When the caller
 * constructed the provider with an explicit base URL — tests, or a deployment
 * pinned to one instance — that base wins.
 */
function instanceFor(
  host: string,
  baseUrl: string,
): { readonly apiBaseUrl: string; readonly webBaseUrl: string } {
  const base = new URL(baseUrl);
  if (host.length === 0 || host === base.host) {
    return { apiBaseUrl: baseUrl, webBaseUrl: `https://${base.host}` };
  }
  return { apiBaseUrl: `https://${host}`, webBaseUrl: `https://${host}` };
}

function createApi(baseUrl: string, context: ProviderContext) {
  const token = context.credentials.get('gitlab')?.token;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(token === undefined || token.length === 0 ? {} : { 'private-token': token }),
  };

  const request = (
    path: string,
  ): Promise<Awaited<ReturnType<ProviderContext['http']['request']>>> =>
    context.http.request({
      url: `${baseUrl}/api/v4${path}`,
      headers,
      timeoutMs: context.timeoutMs,
    });

  return {
    async project(encodedPath: string): Promise<GitlabProject> {
      const response = await request(`/projects/${encodedPath}`);
      ensureSuccess(response, 'gitlab');
      return (await response.json()) as GitlabProject;
    },

    async contributors(encodedPath: string): Promise<number | null> {
      const response = await request(
        `/projects/${encodedPath}/repository/contributors?per_page=1&page=1`,
      );
      const usable = await ensureSuccessOrNull(response, 'gitlab');
      if (usable === null) return null;
      const total = readTotalCountHeader(usable.headers);
      if (total !== null) return total;
      const body = (await usable.json()) as unknown[];
      return body.length;
    },

    async lastCommitDate(encodedPath: string): Promise<string | null> {
      const response = await request(`/projects/${encodedPath}/repository/commits?per_page=1`);
      const usable = await ensureSuccessOrNull(response, 'gitlab');
      if (usable === null) return null;
      const commits = (await usable.json()) as GitlabCommit[];
      const first = commits[0];
      if (first === undefined) return null;
      return normalizeTimestamp(first.committed_date ?? first.created_at);
    },

    /** `true`/`false` when GitLab answers definitively, `null` otherwise. */
    async fileExists(encodedPath: string, filePath: string): Promise<boolean | null> {
      const response = await request(
        `/projects/${encodedPath}/repository/files/${encodeURIComponent(filePath)}?ref=HEAD`,
      );
      if (response.status === 200) return true;
      if (response.status === 404) return false;
      return null;
    },

    async fileContent(encodedPath: string, filePath: string): Promise<string | null> {
      const response = await request(
        `/projects/${encodedPath}/repository/files/${encodeURIComponent(filePath)}?ref=HEAD`,
      );
      const usable = await ensureSuccessOrNull(response, 'gitlab');
      if (usable === null) return null;
      const payload = (await usable.json()) as { content?: string };
      return payload.content ?? '';
    },

    async releases(encodedPath: string, limit: number): Promise<readonly RawRelease[]> {
      if (limit <= 0) return [];
      const pages = Math.ceil(limit / RELEASES_PER_PAGE);
      const collected: RawRelease[] = [];

      for (let page = 1; page <= pages; page += 1) {
        const response = await request(
          `/projects/${encodedPath}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}&order_by=released_at`,
        );
        ensureSuccess(response, 'gitlab');
        const payload = (await response.json()) as GitlabRelease[];
        collected.push(
          ...payload
            .filter((release) => !release.upcoming_release)
            .map((release) => mapRelease(baseUrl, encodedPath, release)),
        );
        if (payload.length < RELEASES_PER_PAGE) break;
      }

      return takeReleases(collected, limit);
    },
  };
}

function mapRelease(baseUrl: string, encodedPath: string, release: GitlabRelease): RawRelease {
  const assets = [
    ...(release.assets?.links ?? []).map((link) => ({
      name: link.name,
      url: link.direct_asset_url ?? link.url,
    })),
    ...(release.assets?.sources ?? []).map((source) => ({
      name: `${release.tag_name}.${source.format}`,
      url: source.url,
    })),
  ];

  return {
    id: `${release.tag_name}`,
    version: release.tag_name,
    tag: release.tag_name,
    ...(release.name === null ? {} : { title: release.name }),
    ...(release.description === null ? {} : { notes: release.description }),
    notesUrl: `${baseUrl}/${encodedPath}/-/releases/${encodeURIComponent(release.tag_name)}`,
    publishedAt: normalizeTimestamp(release.released_at ?? release.created_at),
    isPrerelease: false,
    sourceUrl: `${baseUrl}/${encodedPath}/-/releases/${encodeURIComponent(release.tag_name)}`,
    assets,
  };
}

/**
 * `true` when at least one path exists, `false` when GitLab definitively says
 * none does, and `null` when the answer is unavailable (so the health score
 * records "unknown" rather than a false negative).
 */
async function anyFileExists(
  api: { fileExists(encodedPath: string, filePath: string): Promise<boolean | null> },
  encodedPath: string,
  paths: readonly string[],
): Promise<boolean | null> {
  const results: (boolean | null)[] = [];
  for (const path of paths) {
    results.push(await api.fileExists(encodedPath, path));
  }
  if (results.some((value) => value === true)) return true;
  return results.includes(null) ? null : false;
}

function platformsFromReleases(releases: readonly Release[]): readonly Platform[] {
  const platforms = new Set<Platform>();
  for (const release of releases) {
    for (const artifact of release.artifacts) platforms.add(artifact.platform);
  }
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

/** Re-exported for the detector: GitLab is the only adapter with a wildcard host rule. */
export function isGitlabHost(host: string): boolean {
  return forgeKindForHost(host) === 'gitlab';
}
