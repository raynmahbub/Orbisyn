import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGatewayStatus, useLiveVerification } from './hooks.js';

const resolution = {
  app: {
    id: 'localsend-localsend',
    ospUri: 'osp://localsend-localsend',
    name: 'LocalSend',
    summary: 'Share files with nearby devices.',
    license: 'MIT',
    categories: ['utilities'],
    tags: [],
    platforms: ['android', 'windows', 'macos', 'linux'],
    screenshots: [],
    source: {
      kind: 'github',
      id: 'localsend/localsend',
      host: 'github.com',
      path: 'localsend/localsend',
      webUrl: 'https://github.com/localsend/localsend',
    },
    alternateSources: [],
    archived: false,
    latestVersion: '1.17.0',
    health: { grade: 'A' },
    fetchedAt: '2026-10-27T09:00:00.000Z',
  },
  releases: [
    {
      id: 'release-1',
      version: '1.17.0',
      channel: 'stable',
      publishedAt: '2026-10-20T09:00:00.000Z',
      sourceUrl: 'https://github.com/localsend/localsend/releases/tag/v1.17.0',
      artifacts: [
        {
          id: 'artifact-1',
          name: 'LocalSend.apk',
          platform: 'android',
          url: 'https://example.org/LocalSend.apk',
          checksum: 'sha256:abc123',
        },
      ],
    },
  ],
  diagnostics: {
    steps: [{ id: 'detect-source', status: 'ok', durationMs: 1, detail: 'github' }],
    warnings: [],
    durationMs: 42,
    cache: 'miss',
    providerErrors: [],
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGatewayStatus', () => {
  it('reports a healthy same-origin gateway', async () => {
    const stub = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/health');
      return jsonResponse({
        status: 'ok',
        store: 'memory',
        version: '1.0.0',
        providers: [{ kind: 'github', state: 'ready' }],
      });
    });
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useGatewayStatus());
    await waitFor(() => expect(result.current.state).toBe('online'));

    expect(String(stub.mock.calls[0]?.[0])).toBe('/api/health');
    expect(result.current).toMatchObject({
      store: 'memory',
      version: '1.0.0',
      providers: [{ kind: 'github', state: 'ready' }],
    });
  });

  it('degrades gracefully when the gateway is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    const { result } = renderHook(() => useGatewayStatus());
    await waitFor(() => expect(result.current.state).toBe('offline'));
  });
});

describe('useLiveVerification', () => {
  it('posts the canonical reference to /api/resolve and exposes live facts', async () => {
    const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(resolution);
    });
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useLiveVerification());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.verify('github.com/localsend/localsend');
    });

    expect(result.current.status).toBe('success');
    expect(result.current.data?.app.name).toBe('LocalSend');
    expect(result.current.data?.releases[0]?.version).toBe('1.17.0');
    expect(String(stub.mock.calls[0]?.[0])).toBe('/api/resolve');
    expect(JSON.parse(stub.mock.calls[0]?.[1]?.body as string)).toEqual({
      reference: 'github.com/localsend/localsend',
      releases: 5,
      refresh: false,
    });
  });

  it('surfaces a typed gateway error rather than pretending the source is live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'Unsupported source host.' } }, 400)),
    );

    const { result } = renderHook(() => useLiveVerification());
    await act(async () => {
      await result.current.verify('example.invalid/app');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Unsupported source host.');
    expect(result.current.data).toBeUndefined();
  });
});
