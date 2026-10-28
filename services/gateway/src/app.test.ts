import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './testing/harness.js';

/**
 * End-to-end coverage of the gateway's HTTP surface, using scripted upstream
 * responses so every assertion is about *our* behaviour.
 */

const REPO = {
  id: 1,
  name: 'app',
  full_name: 'example/app',
  description: 'An example application',
  homepage: null,
  html_url: 'https://github.com/example/app',
  default_branch: 'main',
  archived: false,
  stargazers_count: 1500,
  forks_count: 100,
  open_issues_count: 20,
  pushed_at: '2024-05-30T00:00:00Z',
  updated_at: '2024-05-30T00:00:00Z',
  created_at: '2020-01-01T00:00:00Z',
  topics: ['utilities'],
  license: { spdx_id: 'MIT', name: 'MIT License', url: 'https://api.github.com/licenses/mit' },
  owner: {
    login: 'example',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
    html_url: 'https://github.com/example',
  },
};

const RELEASE = {
  id: 10,
  tag_name: 'v1.2.0',
  name: '1.2.0',
  body: 'Changes',
  draft: false,
  prerelease: false,
  created_at: '2024-05-01T00:00:00Z',
  published_at: '2024-05-01T00:00:00Z',
  html_url: 'https://github.com/example/app/releases/tag/v1.2.0',
  tarball_url: null,
  zipball_url: null,
  assets: [
    {
      id: 1,
      name: 'app-1.2.0.apk',
      size: 1024,
      content_type: 'application/vnd.android.package-archive',
      browser_download_url: 'https://github.com/example/app/releases/download/v1.2.0/app-1.2.0.apk',
      digest: null,
    },
  ],
};

function githubRoutes() {
  return [
    { url: 'https://api.github.com/repos/example/app', body: REPO },
    { url: /repos\/example\/app\/releases/, body: [RELEASE] },
    {
      url: /repos\/example\/app\/contributors/,
      body: [{}],
      headers: { link: '<https://api.github.com/x?page=12>; rel="last"' },
    },
    {
      url: /repos\/example\/app\/commits/,
      body: [{ commit: { committer: { date: '2024-05-29T00:00:00Z' } } }],
    },
    { url: /repos\/example\/app\/contents\//, body: [{ name: 'README.md', type: 'file' }] },
    { url: /repos\/example\/app\/contents\/\.github/, body: [{ name: 'workflows', type: 'dir' }] },
  ];
}

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('system routes', () => {
  it('reports health, provider capabilities and the curated catalogue', async () => {
    harness = await createHarness();
    const health = await harness.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', store: 'memory' });

    const providers = await harness.app.inject({ method: 'GET', url: '/api/providers' });
    expect(providers.json().providers.map((entry: { kind: string }) => entry.kind)).toContain(
      'github',
    );

    const catalog = await harness.app.inject({ method: 'GET', url: '/api/catalog' });
    expect(catalog.json().collections.length).toBeGreaterThan(3);
    expect(catalog.json().entries[0].reference).toContain('github.com');
  });
});

describe('POST /resolve', () => {
  it('resolves a source, persists it and reports diagnostics', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'https://github.com/example/app', releases: 5, refresh: false },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.app.id).toBe('example-app');
    expect(body.app.license).toBe('MIT');
    expect(body.app.health.score).toBeGreaterThan(0);
    expect(body.releases[0].version).toBe('v1.2.0');
    expect(body.diagnostics.steps.map((step: { id: string }) => step.id)).toContain(
      'assess-health',
    );

    // The record is available afterwards without another upstream call.
    const stored = await harness.app.inject({ method: 'GET', url: '/api/apps/example-app' });
    expect(stored.statusCode).toBe(200);
    expect(stored.json().name).toBe('app');
  });

  it('serves the second request from cache', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    const payload = { reference: 'github.com/example/app', releases: 5, refresh: false };

    await harness.app.inject({ method: 'POST', url: '/api/resolve', payload });
    const callsAfterFirst = harness.requests.length;
    const second = await harness.app.inject({ method: 'POST', url: '/api/resolve', payload });

    expect(second.json().diagnostics.cache).toBe('hit');
    expect(harness.requests.length).toBe(callsAfterFirst);
  });

  it('validates the request body', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'x' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('validation-failed');
    expect(body.error.details.reference).toBeDefined();
    expect(body.requestId).toBeTypeOf('string');
  });

  it('maps an unknown forge host to an actionable error', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: {
        reference: 'https://forgejo.example.org/team/project',
        releases: 1,
        refresh: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('unsupported-source');
    expect(response.json().error.message).toContain('ORBISYN_FORGE_HOSTS');
  });

  it('surfaces upstream rate limiting as 429 with a retry hint', async () => {
    harness = await createHarness({
      routes: [
        {
          url: 'https://api.github.com/repos/example/app',
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' },
        },
      ],
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'github.com/example/app', releases: 1, refresh: false },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('rate-limited');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('returns 404 for a missing repository', async () => {
    harness = await createHarness({
      routes: [{ url: 'https://api.github.com/repos/example/missing', status: 404 }],
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'github.com/example/missing', releases: 1, refresh: false },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not-found');
  });

  it('degrades /health to degraded after repeated provider failures', async () => {
    harness = await createHarness({
      routes: [{ url: /api\.github\.com/, status: 500 }],
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await harness.app.inject({
        method: 'POST',
        url: '/api/resolve',
        payload: { reference: 'github.com/example/app', releases: 1, refresh: true },
      });
    }

    const health = await harness.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json().status).toBe('degraded');
  });
});

describe('GET /search', () => {
  it('resolves a reference query and finds it afterwards by free text', async () => {
    harness = await createHarness({ routes: githubRoutes() });

    const direct = await harness.app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('github.com/example/app')}&limit=10`,
    });
    expect(direct.statusCode).toBe(200);
    expect(direct.json().items[0].id).toBe('example-app');

    const text = await harness.app.inject({ method: 'GET', url: '/api/search?q=example&limit=10' });
    expect(text.json().items).toHaveLength(1);
    expect(text.json().items[0].stars).toBe(1500);
  });

  it('accepts repeated and single-valued filters', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    await harness.app.inject({
      method: 'GET',
      url: '/api/search?q=github.com/example/app&limit=5',
    });

    const filtered = await harness.app.inject({
      method: 'GET',
      url: '/api/search?q=example&platform=android&source=github&minHealthScore=1&limit=5',
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items).toHaveLength(1);

    const excluded = await harness.app.inject({
      method: 'GET',
      url: '/api/search?q=example&platform=ios&limit=5',
    });
    expect(excluded.json().items).toHaveLength(0);
  });

  it('rejects an empty query', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/api/search?q=&limit=5' });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /apps/:id/releases', () => {
  it('returns the stored release history', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'github.com/example/app', releases: 5, refresh: false },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/apps/example-app/releases?limit=5',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().releases[0].artifacts[0].platform).toBe('android');
  });

  it('404s for an unknown app', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/api/apps/nope/releases' });
    expect(response.statusCode).toBe(404);
  });
});

describe('OSP routes', () => {
  it('resolves a canonical identity for a known record', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'github.com/example/app', releases: 1, refresh: false },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/osp/osp%3A%2F%2Fexample-app',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().uri).toBe('osp://example-app');
    expect(response.json().repository.path).toBe('example/app');
  });

  it('explains that an unknown identity must be resolved first', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/osp/osp%3A%2F%2Funknown-app',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).toContain('Resolve the upstream source once');
  });
});

describe('library routes', () => {
  it('creates a collection and syncs an offline queue', async () => {
    harness = await createHarness();

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/collections',
      payload: { name: 'Favourites', appIds: ['example-app'] },
    });
    expect(created.statusCode).toBe(201);
    const collectionId = created.json().id;

    const synced = await harness.app.inject({
      method: 'POST',
      url: '/api/sync',
      payload: {
        deviceId: 'device-1',
        cursor: null,
        operations: [
          {
            id: 'op-1',
            entity: 'collection',
            op: 'upsert',
            entityId: collectionId,
            payload: { name: 'Favourites', appIds: ['example-app', 'other-app'] },
            updatedAt: new Date(Date.now() + 60_000).toISOString(),
            deviceId: 'device-1',
          },
        ],
      },
    });

    expect(synced.statusCode).toBe(200);
    expect(synced.json().applied).toEqual(['op-1']);
    expect(synced.json().conflicts).toHaveLength(0);

    const listed = await harness.app.inject({ method: 'GET', url: '/api/collections' });
    expect(listed.json().collections[0].appIds).toEqual(['example-app', 'other-app']);
  });

  it('reports an update when a stored release is newer than the installed one', async () => {
    harness = await createHarness({ routes: githubRoutes() });
    await harness.app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { reference: 'github.com/example/app', releases: 5, refresh: false },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/updates/check',
      payload: { installed: [{ appId: 'example-app', version: '1.1.0' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().updates[0].latestVersion).toBe('v1.2.0');
  });
});

describe('unknown routes', () => {
  it('returns the error envelope', async () => {
    harness = await createHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not-found');
  });
});

describe('web client delivery', () => {
  /**
   * A self-hosted install serves the client from the same process, so the two
   * halves must not shadow each other: `/apps/:id` is a page, `/api/apps/:id` is
   * a resource. Both are exercised here against a temporary build output.
   */
  it('serves the shell for a client route and the API for an API route', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'orbisyn-web-'));
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>Orbisyn</title>', 'utf8');

    harness = await createHarness({ config: { webRoot }, registerStatic: true });

    try {
      const shell = await harness.app.inject({ method: 'GET', url: '/apps/example-app' });
      expect(shell.statusCode).toBe(200);
      expect(shell.headers['content-type']).toContain('text/html');
      expect(shell.body).toContain('Orbisyn');

      const missing = await harness.app.inject({ method: 'GET', url: '/api/apps/example-app' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('not-found');
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });

  it('answers unknown API routes with the envelope when no client is mounted', async () => {
    harness = await createHarness({
      config: { webRoot: join(tmpdir(), 'orbisyn-web-absent') },
      registerStatic: true,
    });
    const response = await harness.app.inject({ method: 'GET', url: '/apps/example-app' });

    // With no built client on disk the gateway is API-only, and an unknown path
    // is a 404 in the documented envelope.
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not-found');
  });

  it('serves a bundle that appears after the gateway started', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'orbisyn-web-'));
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>Orbisyn</title>', 'utf8');

    harness = await createHarness({ config: { webRoot }, registerStatic: true });

    try {
      // A rebuild replaces the hashed bundles while the process keeps running, so
      // files that were absent at boot must still be served.
      await writeFile(join(webRoot, 'bundle-2f4a.js'), 'export const ready = true;\n', 'utf8');

      const response = await harness.app.inject({ method: 'GET', url: '/bundle-2f4a.js' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('javascript');
      expect(response.body).toContain('ready');
    } finally {
      await rm(webRoot, { recursive: true, force: true });
    }
  });
});
