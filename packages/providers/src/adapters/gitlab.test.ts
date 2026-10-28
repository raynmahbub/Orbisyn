import { describe, expect, it } from 'vitest';
import { createFakeHttp, createTestContext, jsonRoute } from '../testing/index.js';
import { createGitlabProvider, supportsGitlabReference } from './gitlab.js';

const API = 'https://gitlab.com/api/v4';
const PROJECT = 'KDE/kdenlive';
const ENCODED = encodeURIComponent(PROJECT);
const PROJECT_URL = `${API}/projects/${ENCODED}`;
const RELEASES_URL = `${API}/projects/${ENCODED}/releases?per_page=20&page=1&order_by=released_at`;
const CONTRIBUTORS_URL = `${API}/projects/${ENCODED}/repository/contributors?per_page=1&page=1`;
const COMMITS_URL = `${API}/projects/${ENCODED}/repository/commits?per_page=1`;
const FILE = (path: string, status = 200) => ({
  url: `${API}/projects/${ENCODED}/repository/files/${encodeURIComponent(path)}?ref=HEAD`,
  status,
  body: status === 200 ? { content: 'Y29uZmln' } : { message: '404 File Not Found' },
});

const PROJECT_BODY = {
  id: 2832814,
  name: 'kdenlive',
  path_with_namespace: PROJECT,
  description: 'Powerful multi-track video editor',
  web_url: 'https://gitlab.com/KDE/kdenlive',
  default_branch: 'master',
  archived: false,
  star_count: 1_800,
  forks_count: 210,
  open_issues_count: 320,
  last_activity_at: '2024-05-31T00:00:00Z',
  avatar_url: 'https://gitlab.com/uploads/avatar.png',
  topics: ['video-editor'],
  license: {
    key: 'gpl-3.0',
    name: 'GNU General Public License v3.0 or later',
    spdx_identifier: 'GPL-3.0-or-later',
  },
  namespace: { name: 'KDE', path: 'kde' },
};

const RELEASES = [
  {
    tag_name: 'v24.05.0',
    name: '24.05.0',
    description: 'Spring release',
    created_at: '2024-05-10T00:00:00Z',
    released_at: '2024-05-10T09:00:00Z',
    upcoming_release: false,
    assets: {
      count: 2,
      sources: [
        {
          format: 'tar.gz',
          url: 'https://gitlab.com/KDE/kdenlive/-/archive/v24.05.0/kdenlive-v24.05.0.tar.gz',
        },
      ],
      links: [
        {
          id: 1,
          name: 'kdenlive-24.05.0-x86_64.AppImage',
          url: 'https://download.kde.org/stable/kdenlive/24.05/linux/kdenlive-24.05.0-x86_64.AppImage',
          link_type: 'package',
        },
      ],
    },
  },
  {
    tag_name: 'v24.08.0',
    name: 'Upcoming',
    description: null,
    created_at: '2024-08-01T00:00:00Z',
    released_at: null,
    upcoming_release: true,
    assets: { count: 0, sources: [], links: [] },
  },
];

function build() {
  const http = createFakeHttp([
    jsonRoute(PROJECT_URL, PROJECT_BODY),
    jsonRoute(RELEASES_URL, RELEASES),
    jsonRoute(CONTRIBUTORS_URL, [{}], { headers: { 'x-total': '482' } }),
    jsonRoute(COMMITS_URL, [
      { committed_date: '2024-05-29T10:00:00Z', created_at: '2024-05-29T10:00:00Z' },
    ]),
    FILE('.gitlab-ci.yml', 200),
    FILE('SECURITY.md', 200),
    FILE('.gitlab/security-policies', 404),
    FILE('CONTRIBUTING.md', 404),
    FILE('docs/CONTRIBUTING.md', 404),
  ]);
  return { http, context: createTestContext(http), provider: createGitlabProvider() };
}

describe('GitLab provider', () => {
  it('URL-encodes nested project paths', async () => {
    const { provider, context, http } = build();
    await provider.resolve('https://gitlab.com/KDE/kdenlive', context, {
      releases: 5,
      refresh: false,
    });
    expect(http.calls[0]).toBe(`GET ${API}/projects/KDE%2Fkdenlive`);
  });

  it('resolves a project into a canonical record', async () => {
    const { provider, context } = build();
    const { app } = await provider.resolve('gitlab.com/KDE/kdenlive', context, {
      releases: 5,
      refresh: false,
    });

    expect(app.name).toBe('kdenlive');
    expect(app.license).toBe('GPL-3.0-or-later');
    expect(app.author).toBe('KDE');
    expect(app.source.kind).toBe('gitlab');
  });

  it('maps asset links and source archives, skipping upcoming releases', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve('gitlab.com/KDE/kdenlive', context, {
      releases: 5,
      refresh: false,
    });

    expect(releases).toHaveLength(1);
    const artifacts = releases[0]?.artifacts ?? [];
    const appImage = artifacts.find((artifact) => artifact.fileName?.endsWith('.AppImage'));
    expect(appImage?.architecture).toBe('x86_64');
    expect(appImage?.platform).toBe('linux');
    expect(artifacts.some((artifact) => artifact.fileName?.endsWith('.tar.gz'))).toBe(true);
  });

  it('collects telemetry from headers and files', async () => {
    const { provider, context } = build();
    const { telemetry } = await provider.resolve('gitlab.com/KDE/kdenlive', context, {
      releases: 5,
      refresh: false,
    });

    expect(telemetry.contributors).toBe(482);
    expect(telemetry.lastCommitAt).toBe('2024-05-29T10:00:00.000Z');
    expect(telemetry.hasCi).toBe(true);
    expect(telemetry.hasSecurityPolicy).toBe(true);
    expect(telemetry.hasContributingGuide).toBe(false);
  });

  it('only claims gitlab.com and gitlab.* hosts', () => {
    expect(supportsGitlabReference('gitlab.com/KDE/kdenlive')).toBe(true);
    expect(supportsGitlabReference('https://gitlab.gnome.org/GNOME/loupe')).toBe(true);
    expect(supportsGitlabReference('github.com/KDE/kdenlive')).toBe(false);
  });
});

describe('GitLab provider on a self-managed instance', () => {
  const HOST = 'gitlab.gnome.org';
  const API_BASE = `https://${HOST}/api/v4`;
  const PROJECT_PATH = 'GNOME/loupe';
  const PATH = encodeURIComponent(PROJECT_PATH);
  const file = (path: string, status: number) => ({
    url: `${API_BASE}/projects/${PATH}/repository/files/${encodeURIComponent(path)}?ref=HEAD`,
    status,
    body: status === 200 ? { content: 'Y29uZmln' } : { message: '404 File Not Found' },
  });

  function build() {
    const http = createFakeHttp([
      jsonRoute(`${API_BASE}/projects/${PATH}`, {
        ...PROJECT_BODY,
        name: 'Loupe',
        path_with_namespace: PROJECT_PATH,
        web_url: `https://${HOST}/${PROJECT_PATH}`,
        avatar_url: `https://${HOST}/uploads/avatar.png`,
        namespace: { name: 'GNOME', path: 'gnome' },
      }),
      jsonRoute(
        `${API_BASE}/projects/${PATH}/releases?per_page=20&page=1&order_by=released_at`,
        [],
      ),
      jsonRoute(`${API_BASE}/projects/${PATH}/repository/contributors?per_page=1&page=1`, [], {
        headers: { 'x-total': '37' },
      }),
      jsonRoute(`${API_BASE}/projects/${PATH}/repository/commits?per_page=1`, []),
      file('.gitlab-ci.yml', 200),
      file('SECURITY.md', 200),
      file('.gitlab/security-policies', 404),
      file('CONTRIBUTING.md', 200),
    ]);
    return { http, context: createTestContext(http), provider: createGitlabProvider() };
  }

  it('reads the instance named in the reference, not gitlab.com', async () => {
    const { provider, context, http } = build();

    const { app } = await provider.resolve(`https://${HOST}/${PROJECT_PATH}`, context, {
      releases: 0,
      refresh: false,
    });

    expect(http.calls[0]).toBe(`GET ${API_BASE}/projects/${PATH}`);
    expect(http.calls.every((call) => call.includes(HOST))).toBe(true);
    expect(app.source.host).toBe(HOST);
    expect(app.source.webUrl).toBe(`https://${HOST}/${PROJECT_PATH}`);
    expect(app.ospUri).toBe('osp://gnome-loupe');
  });
});
