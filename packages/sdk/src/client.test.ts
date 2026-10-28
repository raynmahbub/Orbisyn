import { describe, expect, it, vi } from 'vitest';
import { OrbisynClient } from './client.js';
import { OrbisynApiError } from './errors.js';

const HEALTH = {
  status: 'ok',
  version: '0.1.0-dev.0',
  uptimeSeconds: 12,
  providers: [{ kind: 'github', state: 'enabled', lastFailureAt: null }],
  store: 'memory',
};

function clientWith(handler: (url: string, init?: RequestInit) => Response, options = {}) {
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  );
  return {
    fetchImpl,
    client: new OrbisynClient({
      baseUrl: 'http://gateway.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      requestIdFactory: () => 'req-1',
      ...options,
    }),
  };
}

describe('OrbisynClient', () => {
  it('validates and returns a health payload', async () => {
    const { client } = clientWith(() => new Response(JSON.stringify(HEALTH), { status: 200 }));
    await expect(client.health()).resolves.toMatchObject({ status: 'ok', store: 'memory' });
  });

  it('sends a request id and unwraps list envelopes', async () => {
    const { client, fetchImpl } = clientWith(
      () => new Response(JSON.stringify({ providers: [] }), { status: 200 }),
    );
    await expect(client.providers()).resolves.toEqual([]);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-orbisyn-request-id']).toBe('req-1');
  });

  it('builds filter query strings for search', async () => {
    const { client, fetchImpl } = clientWith(
      () =>
        new Response(
          JSON.stringify({ items: [], nextCursor: null, tookMs: 1, queriedSources: [] }),
          {
            status: 200,
          },
        ),
    );

    await client.search({
      q: 'maps',
      limit: 5,
      platform: ['android'],
      source: ['github'],
      minHealthScore: 60,
    });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('/search?q=maps&limit=5');
    expect(url).toContain('platform=android');
    expect(url).toContain('source=github');
    expect(url).toContain('minHealthScore=60');
  });

  it('surfaces structured gateway errors with their code and request id', async () => {
    const { client } = clientWith(
      () =>
        new Response(
          JSON.stringify({
            error: { code: 'rate-limited', message: 'slow down', retryAfterSeconds: 30 },
            requestId: 'server-1',
            timestamp: '2024-06-01T00:00:00.000Z',
          }),
          { status: 429 },
        ),
    );

    const error = await client.health().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrbisynApiError);
    const apiError = error as OrbisynApiError;
    expect(apiError.code).toBe('rate-limited');
    expect(apiError.requestId).toBe('server-1');
    expect(apiError.retryAfterSeconds).toBe(30);
    expect(apiError.retryable).toBe(true);
  });

  it('reports a schema mismatch instead of returning corrupt data', async () => {
    const { client } = clientWith(
      () => new Response(JSON.stringify({ status: 'weird' }), { status: 200 }),
    );
    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.code).toBe('internal');
    expect(error.message).toContain('does not match the expected schema');
  });

  it('handles an unstructured failure body', async () => {
    const { client } = clientWith(() => new Response('<html>502</html>', { status: 502 }));
    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.status).toBe(502);
    expect(error.message).toContain('without a structured error body');
  });

  it('maps transport failures to an unreachable-gateway error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const client = new OrbisynClient({
      baseUrl: 'http://gateway.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      requestIdFactory: () => 'req-2',
    });

    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.code).toBe('upstream-unavailable');
    expect(error.retryable).toBe(true);
  });

  it('posts a resolve request and parses the response', async () => {
    const { client, fetchImpl } = clientWith((_, init) => {
      expect(init?.method).toBe('POST');
      return new Response(
        JSON.stringify({
          app: {
            id: 'example-app',
            ospUri: 'osp://example-app',
            name: 'Example App',
            license: 'MIT',
            screenshots: [],
            categories: [],
            tags: [],
            platforms: ['android'],
            source: {
              kind: 'github',
              id: '1',
              host: 'github.com',
              path: 'example/app',
              webUrl: 'https://github.com/example/app',
            },
            alternateSources: [],
            archived: false,
            fetchedAt: '2024-06-01T00:00:00.000Z',
          },
          releases: [],
          diagnostics: {
            steps: [],
            warnings: [],
            durationMs: 5,
            cache: 'miss',
            providerErrors: [],
          },
        }),
        { status: 200 },
      );
    });

    const response = await client.resolve({
      reference: 'github.com/example/app',
      releases: 0,
      refresh: false,
    });
    expect(response.app.id).toBe('example-app');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://gateway.test/resolve');
  });
});

describe('OrbisynClient / remaining surface', () => {
  const RELEASE = {
    id: 'example-app-1.2.0',
    appId: 'example-app',
    source: 'github',
    version: '1.2.0',
    channel: 'stable',
    isPrerelease: false,
    publishedAt: '2024-05-01T00:00:00.000Z',
    sourceUrl: 'https://github.com/example/app/releases/tag/v1.2.0',
    artifacts: [],
    fetchedAt: '2024-06-01T00:00:00.000Z',
  };

  const COLLECTION = {
    id: 'reading',
    name: 'Reading',
    appIds: ['example-app'],
    visibility: 'private',
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
  };

  it('lists releases for an app from the envelope', async () => {
    const { client, fetchImpl } = clientWith(
      () => new Response(JSON.stringify({ releases: [RELEASE] }), { status: 200 }),
    );

    await expect(client.releases('example-app', 5)).resolves.toHaveLength(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://gateway.test/apps/example-app/releases?limit=5',
    );
  });

  it('escapes the app id in the path', async () => {
    const { client, fetchImpl } = clientWith(
      () =>
        new Response(
          JSON.stringify({
            id: 'example-app',
            ospUri: 'osp://example-app',
            name: 'Example App',
            license: 'MIT',
            screenshots: [],
            categories: [],
            tags: [],
            platforms: ['android'],
            source: {
              kind: 'github',
              id: '1',
              host: 'github.com',
              path: 'example/app',
              webUrl: 'https://github.com/example/app',
            },
            alternateSources: [],
            archived: false,
            fetchedAt: '2024-06-01T00:00:00.000Z',
          }),
          { status: 200 },
        ),
    );

    await client.app('osp://example-app');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://gateway.test/apps/osp%3A%2F%2Fexample-app',
    );
  });

  it('reads an OSP resolution document', async () => {
    const { client, fetchImpl } = clientWith(
      () =>
        new Response(
          JSON.stringify({ uri: 'osp://example-app', document: null, app: null, repository: null }),
          { status: 200 },
        ),
    );

    await expect(client.osp('example-app')).resolves.toMatchObject({ uri: 'osp://example-app' });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/osp/example-app');
  });

  it('posts the installed list when checking for updates', async () => {
    const { client, fetchImpl } = clientWith(
      () =>
        new Response(JSON.stringify({ checkedAt: '2024-06-01T00:00:00.000Z', updates: [] }), {
          status: 200,
        }),
    );

    await expect(
      client.checkUpdates([{ appId: 'example-app', version: '1.0.0' }]),
    ).resolves.toMatchObject({ updates: [] });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ installed: [{ appId: 'example-app', version: '1.0.0' }] });
  });

  it('creates a collection', async () => {
    const { client, fetchImpl } = clientWith(
      () => new Response(JSON.stringify(COLLECTION), { status: 200 }),
    );

    await expect(client.createCollection({ name: 'Reading' })).resolves.toMatchObject({
      id: 'reading',
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('unwraps the collections envelope', async () => {
    const { client } = clientWith(
      () => new Response(JSON.stringify({ collections: [COLLECTION] }), { status: 200 }),
    );
    await expect(client.collections()).resolves.toHaveLength(1);
  });

  it('pushes a sync batch', async () => {
    const { client, fetchImpl } = clientWith(
      () =>
        new Response(
          JSON.stringify({
            cursor: '1',
            applied: ['op-1'],
            rejected: [],
            conflicts: [],
            collections: [],
          }),
          { status: 200 },
        ),
    );

    const result = await client.sync({
      deviceId: 'device-a',
      cursor: null,
      operations: [
        {
          id: 'op-1',
          entity: 'collection',
          op: 'upsert',
          entityId: 'reading',
          updatedAt: '2024-06-01T00:00:00.000Z',
          deviceId: 'device-a',
        },
      ],
    });

    expect(result.cursor).toBe('1');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://gateway.test/sync');
  });

  it('sends caller supplied headers and a custom timeout', async () => {
    const { client, fetchImpl } = clientWith(
      () => new Response(JSON.stringify(HEALTH), { status: 200 }),
      {
        headers: { authorization: 'Bearer deployment-token' },
      },
    );

    await client.health();
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer deployment-token');
  });

  it('reports a request that ran past its deadline', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        }),
    );
    const client = new OrbisynClient({
      baseUrl: 'http://gateway.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
      requestIdFactory: () => 'req-slow',
    });

    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.code).toBe('upstream-unavailable');
    expect(error.message).toContain('timed out after 5ms');
    expect(error.requestId).toBe('req-slow');
  });

  it('refuses to construct without a fetch implementation', () => {
    const original = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true });
    try {
      expect(() => new OrbisynClient({ baseUrl: 'http://gateway.test' })).toThrow(
        /requires a fetch/,
      );
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: original, configurable: true });
    }
  });

  it('strips a trailing slash from the base url exactly once', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request) => new Response(JSON.stringify(HEALTH), { status: 200 }),
    );
    const client = new OrbisynClient({
      baseUrl: 'http://gateway.test///',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.health();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://gateway.test/health');
  });

  it('reports an empty body on an error status as an unstructured failure', async () => {
    const { client } = clientWith(() => new Response('', { status: 500 }));
    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
  });

  it('treats a malformed error envelope as unstructured', async () => {
    const { client } = clientWith(() => new Response('{"error":{"code":42}}', { status: 400 }));
    const error = (await client.health().catch((caught: unknown) => caught)) as OrbisynApiError;
    expect(error.message).toContain('without a structured error body');
  });

  it('honours an external abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = (): void => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          };
          if (init?.signal?.aborted === true) abort();
          else init?.signal?.addEventListener('abort', abort);
        }),
    );
    const client = new OrbisynClient({
      baseUrl: 'http://gateway.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.health({ signal: controller.signal })).rejects.toBeInstanceOf(
      OrbisynApiError,
    );
  });
});
