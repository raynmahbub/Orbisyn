import type { ResolveResponse } from '@orbisyn/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './Home.js';

/**
 * End-to-end behaviour of the front door: the catalogue loads, a reference is
 * resolved through the gateway, and the record plus its trace reach the screen.
 * The transport is stubbed at the `fetch` boundary so the test exercises the
 * SDK, the response validation and the rendering together.
 */
const catalog = {
  collections: [
    { id: 'featured', title: 'Featured', description: 'Maintained projects worth a look.' },
    { id: 'android', title: 'Android', description: 'Mobile builds.' },
  ],
  entries: [
    {
      reference: 'github.com/florisboard/florisboard',
      collections: ['featured', 'android'],
      rationale: 'Keyboard with no network permission.',
    },
    {
      reference: 'github.com/immich-app/immich',
      collections: ['featured'],
      rationale: 'Self-hosted photo library.',
    },
  ],
};

const resolution: ResolveResponse = {
  app: {
    id: 'florisboard-florisboard',
    ospUri: 'osp://florisboard-florisboard',
    name: 'FlorisBoard',
    summary: 'An open-source keyboard for Android.',
    license: 'Apache-2.0',
    categories: ['keyboard'],
    tags: [],
    platforms: ['android'],
    screenshots: [],
    source: {
      kind: 'github',
      id: 'florisboard/florisboard',
      host: 'github.com',
      path: 'florisboard/florisboard',
      webUrl: 'https://github.com/florisboard/florisboard',
    },
    alternateSources: [],
    archived: false,
    latestVersion: '0.4.0',
    fetchedAt: '2024-06-01T00:00:00.000Z',
  },
  releases: [],
  diagnostics: {
    steps: [{ id: 'detect-source', status: 'ok', durationMs: 1, detail: 'github' }],
    warnings: [],
    durationMs: 42,
    cache: 'miss',
    providerErrors: [],
  },
};

function stubTransport(): ReturnType<typeof vi.fn> {
  const stub = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/catalog')) {
      return new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/resolve')) {
      return new Response(JSON.stringify(resolution), { status: 200 });
    }
    return new Response('{"error":{"code":"not-found","message":"no route"}}', { status: 404 });
  });
  vi.stubGlobal('fetch', stub);
  return stub as unknown as ReturnType<typeof vi.fn>;
}

function renderHome() {
  // `retryDelay: 0` keeps the failure paths deterministic: the hooks declare
  // their own retry counts and the tests must not wait out a backoff.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomeScreen', () => {
  it('renders the catalogue for the default collection and switches collections', async () => {
    stubTransport();
    renderHome();

    expect(await screen.findByText('github.com/florisboard/florisboard')).toBeInTheDocument();
    expect(screen.getByText('github.com/immich-app/immich')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Android' }));

    expect(screen.getByText('github.com/florisboard/florisboard')).toBeInTheDocument();
    expect(screen.queryByText('github.com/immich-app/immich')).not.toBeInTheDocument();
  });

  it('reports an unreachable catalogue without breaking the resolver', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    renderHome();

    expect(await screen.findByText('Catalogue unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText('Source reference')).toBeInTheDocument();
  });

  it('resolves a reference and shows the record with its diagnostics trace', async () => {
    const transport = stubTransport();
    renderHome();

    await userEvent.type(
      screen.getByLabelText('Source reference'),
      'github.com/florisboard/florisboard',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(await screen.findByText('Just resolved')).toBeInTheDocument();
    expect(screen.getAllByText('FlorisBoard').length).toBeGreaterThan(0);
    // Both the form and the resolved-record section render a trace panel.
    expect(screen.getAllByText('Resolution trace').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/42 ms/).length).toBeGreaterThan(0);

    const resolveCall = transport.mock.calls.find(([url]) => String(url).endsWith('/resolve')) as
      | [RequestInfo | URL, RequestInit]
      | undefined;
    expect(resolveCall).toBeDefined();
    expect(JSON.parse(resolveCall?.[1].body as string)).toMatchObject({
      reference: 'github.com/florisboard/florisboard',
      releases: 10,
    });
  });

  it('surfaces a typed gateway error instead of a blank screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              requestId: 'req-1',
              timestamp: '2024-06-01T00:00:00.000Z',
              error: {
                code: 'unsupported-source',
                message: 'That host is not a supported source.',
              },
            }),
            { status: 400 },
          );
        }
        return new Response(JSON.stringify(catalog), { status: 200 });
      }),
    );

    renderHome();
    await userEvent.type(screen.getByLabelText('Source reference'), 'example.invalid/thing');
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(screen.getByText('Not a source we can read')).toBeInTheDocument());
    expect(screen.getByText('That host is not a supported source.')).toBeInTheDocument();
  });
});
