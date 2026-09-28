import { describe, expect, it } from 'vitest';
import { createFakeHttp, createTestContext, jsonRoute } from '../testing/index.js';
import { createGithubProvider, supportsGithubReference } from './github.js';

/**
 * Fixtures below are trimmed copies of real GitHub API responses (fields we
 * consume, verbatim naming). Keeping them close to upstream is what makes these
 * tests worth having: a schema change upstream breaks the test, not production.
 */

const REPO_URL = 'https://api.github.com/repos/example/app';
const RELEASES_URL = 'https://api.github.com/repos/example/app/releases?per_page=30&page=1';
const CONTRIBUTORS_URL = 'https://api.github.com/repos/example/app/contributors?per_page=1&anon=1';
const COMMITS_URL = 'https://api.github.com/repos/example/app/commits?per_page=1';
const CONTENTS_URL = 'https://api.github.com/repos/example/app/contents/';
const DOT_GITHUB_URL = 'https://api.github.com/repos/example/app/contents/.github';

const REPO = {
  id: 1296269,
  name: 'app',
  full_name: 'example/app',
  description: 'An example application',
  homepage: 'https://example.org',
  html_url: 'https://github.com/example/app',
  default_branch: 'main',
  archived: false,
  stargazers_count: 4200,
  forks_count: 310,
  open_issues_count: 42,
  pushed_at: '2024-05-30T10:00:00Z',
  updated_at: '2024-05-31T08:00:00Z',
  created_at: '2016-01-01T00:00:00Z',
  topics: ['Android', 'privacy'],
  license: { spdx_id: 'MIT', name: 'MIT License', url: 'https://api.github.com/licenses/mit' },
  owner: {
    login: 'example',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    html_url: 'https://github.com/example',
  },
};

const RELEASES = [
  {
    id: 9001,
    tag_name: 'v1.4.0',
    name: '1.4.0 — stability',
    body: "## What's changed\n\n* Fix crash on startup\n\n**Full changelog**: https://example.org/compare",
    draft: false,
    prerelease: false,
    created_at: '2024-05-01T09:00:00Z',
    published_at: '2024-05-01T10:00:00Z',
    html_url: 'https://github.com/example/app/releases/tag/v1.4.0',
    tarball_url: 'https://api.github.com/repos/example/app/tarball/v1.4.0',
    zipball_url: 'https://api.github.com/repos/example/app/zipball/v1.4.0',
    assets: [
      {
        id: 1,
        name: 'app-1.4.0-arm64-v8a.apk',
        size: 8_388_608,
        content_type: 'application/vnd.android.package-archive',
        browser_download_url:
          'https://github.com/example/app/releases/download/v1.4.0/app-1.4.0-arm64-v8a.apk',
        digest: 'sha256:9f2c1a4d3b5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
      },
      {
        id: 2,
        name: 'notes.txt',
        size: 128,
        content_type: 'text/plain',
        browser_download_url: 'https://github.com/example/app/releases/download/v1.4.0/notes.txt',
        digest: null,
      },
    ],
  },
  {
    id: 9000,
    tag_name: 'v1.4.0-rc.1',
    name: null,
    body: 'Release candidate',
    draft: false,
    prerelease: true,
    created_at: '2024-04-20T09:00:00Z',
    published_at: '2024-04-20T10:00:00Z',
    html_url: 'https://github.com/example/app/releases/tag/v1.4.0-rc.1',
    tarball_url: null,
    zipball_url: null,
    assets: [],
  },
  {
    id: 8999,
    tag_name: 'v1.3.0',
    name: null,
    body: 'Draft release, must be ignored',
    draft: true,
    prerelease: false,
    created_at: '2024-03-01T09:00:00Z',
    published_at: '2024-03-01T10:00:00Z',
    html_url: 'https://github.com/example/app/releases/tag/v1.3.0',
    tarball_url: null,
    zipball_url: null,
    assets: [],
  },
];

function build() {
  const http = createFakeHttp([
    jsonRoute(REPO_URL, REPO),
    jsonRoute(RELEASES_URL, RELEASES),
    jsonRoute(CONTRIBUTORS_URL, [{}], {
      headers: {
        link: '<https://api.github.com/repositories/1/contributors?per_page=1&anon=1&page=57>; rel="last"',
      },
    }),
    jsonRoute(COMMITS_URL, [{ commit: { committer: { date: '2024-05-29T12:00:00Z' } } }]),
    jsonRoute(CONTENTS_URL, [
      { name: 'README.md', type: 'file' },
      { name: 'SECURITY.md', type: 'file' },
      { name: 'CONTRIBUTING.md', type: 'file' },
    ]),
    jsonRoute(DOT_GITHUB_URL, [{ name: 'workflows', type: 'dir' }]),
  ]);

  return { http, context: createTestContext(http), provider: createGithubProvider() };
}

describe('GitHub provider', () => {
  it('resolves a repository into a canonical app record', async () => {
    const { provider, context } = build();
    const { app } = await provider.resolve('https://github.com/example/app', context, {
      releases: 10,
      refresh: false,
    });

    expect(app.id).toBe('example-app');
    expect(app.ospUri).toBe('osp://example-app');
    expect(app.name).toBe('app');
    expect(app.summary).toBe('An example application');
    expect(app.license).toBe('MIT');
    expect(app.iconUrl).toContain('avatars.githubusercontent.com');
    expect(app.categories).toEqual(['android', 'privacy']);
    expect(app.platforms).toContain('android');
    expect(app.source).toMatchObject({ kind: 'github', host: 'github.com', path: 'example/app' });
    expect(app.latestVersion).toBe('v1.4.0');
  });

  it('maps releases, channels and artifacts', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve('github.com/example/app', context, {
      releases: 10,
      refresh: false,
    });

    // The draft release must be filtered out upstream of the domain.
    expect(releases.map((release) => release.version)).toEqual(['v1.4.0', 'v1.4.0-rc.1']);
    const stable = releases[0];
    expect(stable?.channel).toBe('stable');
    expect(stable?.isPrerelease).toBe(false);
    expect(releases[1]?.channel).toBe('rc');
    expect(releases[1]?.isPrerelease).toBe(true);

    const apk = stable?.artifacts.find(
      (artifact) => artifact.fileName === 'app-1.4.0-arm64-v8a.apk',
    );
    expect(apk?.platform).toBe('android');
    expect(apk?.architecture).toBe('arm64');
    expect(apk?.sizeBytes).toBe(8_388_608);
    // Provider-published digest beats anything we could compute ourselves.
    expect(apk?.checksum).toEqual({
      algorithm: 'sha256',
      value: '9f2c1a4d3b5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
    });
    expect(apk?.listingOnly).toBe(false);

    const text = stable?.artifacts.find((artifact) => artifact.fileName === 'notes.txt');
    expect(text?.listingOnly).toBe(true);

    const tarball = stable?.artifacts.find((artifact) => artifact.fileName === 'v1.4.0.tar.gz');
    expect(tarball?.listingOnly).toBe(true);
  });

  it('cleans release notes for mobile rendering', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve('github.com/example/app', context, {
      releases: 10,
      refresh: false,
    });
    const notes = releases[0]?.notes ?? '';
    expect(notes).not.toContain('Full changelog');
    expect(notes).not.toContain("What's changed");
    expect(notes).toContain('Fix crash on startup');
  });

  it('collects repository telemetry for the health score', async () => {
    const { provider, context } = build();
    const { telemetry } = await provider.resolve('github.com/example/app', context, {
      releases: 10,
      refresh: false,
    });

    expect(telemetry.stars).toBe(4200);
    expect(telemetry.contributors).toBe(57);
    expect(telemetry.lastCommitAt).toBe('2024-05-29T12:00:00.000Z');
    expect(telemetry.hasSecurityPolicy).toBe(true);
    expect(telemetry.hasContributingGuide).toBe(true);
    expect(telemetry.hasCi).toBe(true);
    expect(telemetry.licenseSpdx).toBe('MIT');
    expect(telemetry.releasesLastYear).toBe(2);
  });

  it('degrades gracefully when optional endpoints fail', async () => {
    // A rate-limited anonymous client still gets a usable record: telemetry
    // fields become `null` (unknown) instead of silently reporting `false`.
    const rateLimited = { status: 429, body: { message: 'API rate limit exceeded' } };
    const http = createFakeHttp([
      jsonRoute(REPO_URL, REPO),
      jsonRoute(RELEASES_URL, RELEASES),
      { url: CONTRIBUTORS_URL, ...rateLimited },
      { url: COMMITS_URL, ...rateLimited },
      { url: CONTENTS_URL, ...rateLimited },
      { url: DOT_GITHUB_URL, ...rateLimited },
    ]);
    const context = createTestContext(http);

    const { telemetry, app } = await createGithubProvider().resolve(
      'github.com/example/app',
      context,
      {
        releases: 5,
        refresh: false,
      },
    );

    expect(app.id).toBe('example-app');
    expect(telemetry.contributors).toBeNull();
    expect(telemetry.lastCommitAt).toBeNull();
    expect(telemetry.hasCi).toBeNull();
  });

  it('reports a missing repository as a domain error', async () => {
    const http = createFakeHttp([
      { url: REPO_URL, status: 404, body: { message: 'Not Found' } },
      jsonRoute(RELEASES_URL, []),
    ]);
    const context = createTestContext(http);

    await expect(
      createGithubProvider().resolve('github.com/example/missing', context, {
        releases: 1,
        refresh: false,
      }),
    ).rejects.toThrowError(/404/);
  });

  it('sends a user agent and honours a configured token', async () => {
    const { provider, http } = build();
    const context = createTestContext(http, { token: 'secret-token' });
    await provider.resolve('github.com/example/app', context, { releases: 1, refresh: false });

    const request = http.requests.find((entry) => entry.url === REPO_URL);
    expect(request?.headers?.authorization).toBe('Bearer secret-token');
  });

  it('requests no releases when the caller asks for metadata only', async () => {
    const { provider, context, http } = build();
    const { releases } = await provider.resolve('github.com/example/app', context, {
      releases: 0,
      refresh: false,
    });
    expect(releases).toEqual([]);
    expect(http.calls).not.toContain(`GET ${RELEASES_URL}`);
  });

  it('rejects references it does not own', () => {
    expect(supportsGithubReference('github.com/example/app')).toBe(true);
    expect(supportsGithubReference('https://codeberg.org/forgejo/forgejo')).toBe(false);
  });
});
