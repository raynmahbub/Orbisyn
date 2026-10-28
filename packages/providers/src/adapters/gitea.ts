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
  SourceKind,
  SourceProvider,
} from '@orbisyn/core';
import { DomainError, deriveAppId, normalizeLicense, parseSourceUrl, slugify } from '@orbisyn/core';
import { ensureSuccess, ensureSuccessOrNull, readTotalCountHeader } from '../http/errors.js';
import { createCollector, releaseStatistics } from '../shared/collect.js';
import type { RawRelease } from '../shared/releases.js';
import { buildRelease, normalizeTimestamp, takeReleases } from '../shared/releases.js';

/**
 * Gitea-family adapter — one implementation serving three ecosystems.
 *
 * Forgejo is a Gitea fork and Codeberg runs Forgejo, so they share the `/api/v1`
 * surface. Parameterising the API root gives us Codeberg, the Forgejo project
 * itself, and any self-hosted instance (`forgejo.example.org/team/project`)
 * without duplicating a line of parsing logic.
 */

export interface GiteaFamilyConfig {
  readonly kind: SourceKind;
  readonly label: string;
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
  readonly status: ProviderDescriptor['status'];
  readonly examples: readonly string[];
}

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  website: string | null;
  html_url: string;
  default_branch: string;
  archived: boolean;
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
  topics?: string[];
  avatar_url?: string | null;
  updated_at: string | null;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  owner?: { login: string; avatar_url: string } | null;
}

interface GiteaRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
  tarball_url?: string | null;
  zipball_url?: string | null;
  assets?: {
    id: number;
    name: string;
    size: number;
    browser_download_url: string;
    mime?: string;
  }[];
}

interface GiteaCommit {
  commit: { committer?: { date: string } | null; author?: { date: string } | null };
  created?: string | null;
}

interface GiteaContentEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

const RELEASES_PER_PAGE = 25;

export function createGiteaFamilyProvider(config: GiteaFamilyConfig): SourceProvider {
  const apiHost = new URL(config.apiBaseUrl).host;

  const descriptor: ProviderDescriptor = {
    kind: config.kind,
    label: config.label,
    homepage: config.webBaseUrl,
    status: config.status,
    examples: config.examples,
    capabilities: {
      resolveApp: true,
      listReleases: true,
      listArtifacts: true,
      // Gitea exposes asset hashes only through the signed attachment API.
      verifyArtifacts: false,
      repositoryStats: true,
      projectGovernance: true,
      authenticated: true,
    },
  };

  return {
    descriptor,

    supports: (reference) => {
      const { host, segments } = safeParse(reference);
      if (host === null) return false;
      if (host === apiHost) return segments.length >= 2;
      return false;
    },

    async resolve(reference, context, options): Promise<ProviderResolution> {
      const { host, path } = parseSourceUrl(reference);
      const [owner, name] = path.split('/');
      if (owner === undefined || name === undefined) {
        throw DomainError.invalidReference(reference, `expected ${apiHost}/{owner}/{repository}`);
      }
      void host;

      const api = createApi(config.apiBaseUrl, context);
      const repo = await api.repo(owner, name);
      const appId = deriveAppId(apiHost, `${owner}/${name}`, slugify(name));

      const collector = createCollector(context.logger);
      const contributors = await collector.run(`${config.kind} contributors`, () =>
        api.contributors(owner, name),
      );
      const lastCommitAt = await collector.run(`${config.kind} latest commit`, () =>
        api.lastCommitDate(owner, name),
      );
      const rootEntries = await collector.run(`${config.kind} root contents`, () =>
        api.contents(owner, name, ''),
      );
      const workflowDir = await collector.run(`${config.kind} workflows`, async () => [
        ...((await api.contents(owner, name, '.forgejo/workflows')) ?? []),
        ...((await api.contents(owner, name, '.github/workflows')) ?? []),
      ]);

      const rawReleases = await api.releases(owner, name, options.releases);
      const releases = rawReleases.map((raw) =>
        buildRelease(raw, { appId, source: config.kind, fetchedAt: context.clock.isoNow() }),
      );

      const repository: RepositoryRef = {
        kind: config.kind,
        id: String(repo.id),
        host: apiHost,
        path: repo.full_name,
        webUrl: repo.html_url,
        ...(repo.default_branch === undefined ? {} : { defaultBranch: repo.default_branch }),
      };

      const license = normalizeLicense(repo.license?.spdx_id ?? repo.license?.name ?? null);
      const stats = releaseStatistics(
        rawReleases.map((release) => release.publishedAt),
        context.clock.now(),
      );

      const telemetry: RepositoryTelemetry = {
        stars: repo.stars_count,
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
          rootEntries === null ? null : hasFile(rootEntries, ['CONTRIBUTING.md', 'CONTRIBUTING']),
        hasCi: workflowDir === null ? null : workflowDir.length > 0,
        licenseSpdx: license.spdx,
      };

      const topics = normalizeTopics(repo.topics);
      const latest = releases[0];
      const app: AppRecord = {
        id: appId,
        ospUri: `osp://${appId}`,
        name: repo.name,
        ...(repo.description === null || repo.description.length === 0
          ? {}
          : { summary: repo.description, description: repo.description }),
        ...(repo.website === null || repo.website.length === 0 ? {} : { homepage: repo.website }),
        ...(resolveIcon(repo) === null ? {} : { iconUrl: resolveIcon(repo) as string }),
        screenshots: [],
        license: license.id,
        categories: topics,
        tags: topics,
        platforms: platformsFromReleases(releases),
        ...(repo.owner?.login === undefined ? {} : { author: repo.owner.login }),
        source: repository,
        alternateSources: [],
        ...(latest === undefined ? {} : { latestRelease: latest, latestVersion: latest.version }),
        archived: repo.archived,
        fetchedAt: context.clock.isoNow(),
      };

      return { app, releases, telemetry };
    },
  };
}

export const CODEBERG_CONFIG: GiteaFamilyConfig = {
  kind: 'codeberg',
  label: 'Codeberg',
  apiBaseUrl: 'https://codeberg.org/api/v1',
  webBaseUrl: 'https://codeberg.org',
  status: 'stable',
  examples: [
    'https://codeberg.org/forgejo/forgejo',
    'https://codeberg.org/Freeyourgadget/Gadgetbridge',
  ],
};

/**
 * Self-hosted Forgejo instances. The detector accepts any `forgejo.*` / `gitea.*`
 * host and the operator can extend it with `ORBISYN_FORGE_HOSTS`.
 */
export function forgejoConfigForHost(host: string): GiteaFamilyConfig {
  const normalized = host.split(':')[0] ?? host;
  return {
    kind: 'forgejo',
    label: `Forgejo (${normalized})`,
    apiBaseUrl: `https://${host}/api/v1`,
    webBaseUrl: `https://${host}`,
    status: 'beta',
    examples: [`https://${host}/forgejo/forgejo`],
  };
}

function createApi(apiBaseUrl: string, context: ProviderContext) {
  const token =
    context.credentials.get('forgejo')?.token ?? context.credentials.get('codeberg')?.token;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(token === undefined || token.length === 0 ? {} : { authorization: `token ${token}` }),
  };

  const request = (path: string): Promise<HttpResponse> =>
    context.http.request({ url: `${apiBaseUrl}${path}`, headers, timeoutMs: context.timeoutMs });

  return {
    async repo(owner: string, name: string): Promise<GiteaRepo> {
      const response = await request(`/repos/${owner}/${name}`);
      ensureSuccess(response, 'gitea');
      return (await response.json()) as GiteaRepo;
    },

    async contributors(owner: string, name: string): Promise<number | null> {
      const response = await request(`/repos/${owner}/${name}/contributors?limit=1`);
      const usable = await ensureSuccessOrNull(response, 'gitea');
      if (usable === null) return null;
      const total = readTotalCountHeader(usable.headers);
      if (total !== null) return total;
      const body = (await usable.json()) as unknown[];
      return body.length;
    },

    async lastCommitDate(owner: string, name: string): Promise<string | null> {
      const response = await request(`/repos/${owner}/${name}/commits?limit=1`);
      const usable = await ensureSuccessOrNull(response, 'gitea');
      if (usable === null) return null;
      const commits = (await usable.json()) as GiteaCommit[];
      const first = commits[0];
      if (first === undefined) return null;
      const date =
        first.commit.committer?.date ?? first.commit.author?.date ?? first.created ?? null;
      return date === null ? null : normalizeTimestamp(date);
    },

    /** `[]` for a missing directory (404), `null` when the answer is unknown. */
    async contents(
      owner: string,
      name: string,
      path: string,
    ): Promise<readonly GiteaContentEntry[] | null> {
      const response = await request(`/repos/${owner}/${name}/contents/${path}`);
      if (response.status === 404) return [];
      const usable = await ensureSuccessOrNull(response, 'gitea');
      if (usable === null) return null;
      const payload = (await usable.json()) as GiteaContentEntry[] | GiteaContentEntry;
      return Array.isArray(payload) ? payload : [payload];
    },

    async releases(owner: string, name: string, limit: number): Promise<readonly RawRelease[]> {
      if (limit <= 0) return [];
      const pages = Math.ceil(limit / RELEASES_PER_PAGE);
      const collected: RawRelease[] = [];

      for (let page = 1; page <= pages; page += 1) {
        const response = await request(
          `/repos/${owner}/${name}/releases?limit=${RELEASES_PER_PAGE}&page=${page}`,
        );
        ensureSuccess(response, 'gitea');
        const payload = (await response.json()) as GiteaRelease[];
        collected.push(...payload.filter((release) => !release.draft).map(mapRelease));
        if (payload.length < RELEASES_PER_PAGE) break;
      }

      return takeReleases(collected, limit);
    },
  };
}

function mapRelease(release: GiteaRelease): RawRelease {
  const assets = [
    ...(release.assets ?? []).map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      sizeBytes: asset.size,
      ...(asset.mime === undefined || asset.mime.length === 0 ? {} : { contentType: asset.mime }),
    })),
    ...(release.tarball_url === null || release.tarball_url === undefined
      ? []
      : [
          {
            name: `${release.tag_name}.tar.gz`,
            url: release.tarball_url,
            contentType: 'application/gzip',
          },
        ]),
    ...(release.zipball_url === null || release.zipball_url === undefined
      ? []
      : [
          {
            name: `${release.tag_name}.zip`,
            url: release.zipball_url,
            contentType: 'application/zip',
          },
        ]),
  ];

  return {
    id: String(release.id),
    version: release.tag_name,
    tag: release.tag_name,
    ...(release.name === null ? {} : { title: release.name }),
    ...(release.body === null ? {} : { notes: release.body }),
    notesUrl: release.html_url,
    publishedAt: normalizeTimestamp(release.published_at ?? release.created_at),
    isPrerelease: release.prerelease,
    sourceUrl: release.html_url,
    assets,
  };
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

function hasFile(entries: readonly GiteaContentEntry[], names: readonly string[]): boolean {
  const lowered = new Set(entries.map((entry) => entry.name.toLowerCase()));
  return names.some((name) => lowered.has(name.toLowerCase()));
}

function resolveIcon(repo: GiteaRepo): string | null {
  if (repo.avatar_url !== undefined && repo.avatar_url !== null && repo.avatar_url.length > 0) {
    return repo.avatar_url;
  }
  if (repo.owner?.avatar_url !== undefined && repo.owner.avatar_url.length > 0) {
    return repo.owner.avatar_url;
  }
  return null;
}

function safeParse(reference: string): { host: string | null; segments: readonly string[] } {
  try {
    const parsed = parseSourceUrl(reference);
    return { host: parsed.host, segments: parsed.segments };
  } catch {
    return { host: null, segments: [] };
  }
}
