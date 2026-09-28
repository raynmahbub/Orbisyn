import { describe, expect, it } from 'vitest';
import { createFakeHttp, createTestContext, jsonRoute } from '../testing/index.js';
import { CODEBERG_CONFIG, createGiteaFamilyProvider, forgejoConfigForHost } from './gitea.js';

const API = 'https://codeberg.org/api/v1';
const REPO_URL = `${API}/repos/forgejo/forgejo`;
const RELEASES_URL = `${API}/repos/forgejo/forgejo/releases?limit=25&page=1`;
const CONTRIBUTORS_URL = `${API}/repos/forgejo/forgejo/contributors?limit=1`;
const COMMITS_URL = `${API}/repos/forgejo/forgejo/commits?limit=1`;
const ROOT_URL = `${API}/repos/forgejo/forgejo/contents/`;
const FORGEJO_WORKFLOWS_URL = `${API}/repos/forgejo/forgejo/contents/.forgejo/workflows`;
const GITHUB_WORKFLOWS_URL = `${API}/repos/forgejo/forgejo/contents/.github/workflows`;

const REPO = {
  id: 42,
  name: 'forgejo',
  full_name: 'forgejo/forgejo',
  description: 'Beyond coding. We forge.',
  website: 'https://forgejo.org',
  html_url: 'https://codeberg.org/forgejo/forgejo',
  default_branch: 'forgejo',
  archived: false,
  stars_count: 3_100,
  forks_count: 260,
  open_issues_count: 512,
  topics: ['git', 'self-hosted'],
  updated_at: '2024-05-31T00:00:00Z',
  license: { spdx_id: 'GPL-3.0-or-later', name: 'GNU GPL v3.0 or later' },
  owner: { login: 'forgejo', avatar_url: 'https://codeberg.org/avatars/forgejo' },
};

const RELEASES = [
  {
    id: 7,
    tag_name: 'v1.21.11-1',
    name: 'Forgejo v1.21.11-1',
    body: 'Security release',
    draft: false,
    prerelease: false,
    created_at: '2024-05-01T00:00:00Z',
    published_at: '2024-05-01T01:00:00Z',
    html_url: 'https://codeberg.org/forgejo/forgejo/releases/tag/v1.21.11-1',
    tarball_url: 'https://codeberg.org/forgejo/forgejo/archive/v1.21.11-1.tar.gz',
    zipball_url: null,
    assets: [
      {
        id: 1,
        name: 'forgejo-1.21.11-linux-amd64',
        size: 104_857_600,
        browser_download_url:
          'https://codeberg.org/forgejo/forgejo/releases/download/v1.21.11-1/forgejo-1.21.11-linux-amd64',
        mime: 'application/octet-stream',
      },
      {
        id: 2,
        name: 'forgejo-1.21.11-linux-arm64.AppImage',
        size: 94_371_840,
        browser_download_url:
          'https://codeberg.org/forgejo/forgejo/releases/download/v1.21.11-1/forgejo-1.21.11-linux-arm64.AppImage',
        mime: 'application/x-appimage',
      },
    ],
  },
  {
    id: 6,
    tag_name: 'v1.21.11-1-rc1',
    name: null,
    body: null,
    draft: false,
    prerelease: true,
    created_at: '2024-04-25T00:00:00Z',
    published_at: '2024-04-25T01:00:00Z',
    html_url: 'https://codeberg.org/forgejo/forgejo/releases/tag/v1.21.11-1-rc1',
    tarball_url: null,
    zipball_url: null,
  },
];

function build() {
  const http = createFakeHttp([
    jsonRoute(REPO_URL, REPO),
    jsonRoute(RELEASES_URL, RELEASES),
    jsonRoute(CONTRIBUTORS_URL, [{}], { headers: { 'x-total-count': '913' } }),
    jsonRoute(COMMITS_URL, [
      { commit: { committer: { date: '2024-05-30T08:00:00Z' } }, created: '2024-05-30T08:00:00Z' },
    ]),
    jsonRoute(ROOT_URL, [
      { name: 'README.md', type: 'file' },
      { name: 'SECURITY.md', type: 'file' },
      { name: 'CONTRIBUTING.md', type: 'file' },
    ]),
    jsonRoute(FORGEJO_WORKFLOWS_URL, [{ name: 'release.yml', type: 'file' }]),
    jsonRoute(GITHUB_WORKFLOWS_URL, [], { status: 404, body: { message: 'not found' } }),
  ]);

  return {
    http,
    context: createTestContext(http),
    provider: createGiteaFamilyProvider(CODEBERG_CONFIG),
  };
}

describe('Gitea-family provider (Codeberg)', () => {
  it('resolves a Codeberg repository', async () => {
    const { provider, context } = build();
    const { app } = await provider.resolve('https://codeberg.org/forgejo/forgejo', context, {
      releases: 10,
      refresh: false,
    });

    expect(app.id).toBe('forgejo-forgejo');
    expect(app.license).toBe('GPL-3.0-or-later');
    expect(app.source).toMatchObject({
      kind: 'codeberg',
      host: 'codeberg.org',
      path: 'forgejo/forgejo',
    });
    expect(app.platforms).toContain('linux');
  });

  it('maps release assets including architecture suffixes', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve('codeberg.org/forgejo/forgejo', context, {
      releases: 10,
      refresh: false,
    });

    const [stable, candidate] = releases;
    expect(stable?.version).toBe('v1.21.11-1');
    expect(candidate?.isPrerelease).toBe(true);
    expect(candidate?.channel).toBe('rc');

    const appImage = stable?.artifacts.find((artifact) => artifact.fileName?.endsWith('.AppImage'));
    expect(appImage?.architecture).toBe('arm64');
    expect(appImage?.listingOnly).toBe(false);
  });

  it('reads contributor totals from the forge headers', async () => {
    const { provider, context } = build();
    const { telemetry } = await provider.resolve('codeberg.org/forgejo/forgejo', context, {
      releases: 5,
      refresh: false,
    });

    expect(telemetry.contributors).toBe(913);
    expect(telemetry.hasCi).toBe(true);
    expect(telemetry.stars).toBe(3_100);
  });

  it('namespaces the label of a self-hosted instance by host', () => {
    const provider = createGiteaFamilyProvider(forgejoConfigForHost('forgejo.example.org'));
    expect(provider.descriptor.label).toContain('forgejo.example.org');
    expect(provider.descriptor.kind).toBe('forgejo');
    expect(provider.supports('forgejo.example.org/team/project')).toBe(true);
    expect(provider.supports('codeberg.org/forgejo/forgejo')).toBe(false);
  });
});
