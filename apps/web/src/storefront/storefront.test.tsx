import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes.js';
import { StoreProvider } from './StoreProvider.jsx';
import { STORE_STORAGE_KEY } from './state.js';

const RESOLUTION = {
  app: {
    id: 'localsend-localsend',
    ospUri: 'osp://localsend-localsend',
    name: 'LocalSend',
    summary: 'Share files with nearby devices without an intermediary.',
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
    latestRelease: { version: '1.17.0', channel: 'stable' },
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

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubGateway(): ReturnType<typeof vi.fn> {
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/health')) {
      return json({
        status: 'ok',
        store: 'memory',
        version: '1.0.0',
        providers: [{ kind: 'github', state: 'ready' }],
      });
    }
    if (url.endsWith('/api/resolve')) {
      void JSON.parse(String(init?.body ?? '{}'));
      return json(RESOLUTION);
    }
    if (url.endsWith('/api/catalog')) return json({ collections: [], entries: [] });
    return json({ error: { message: 'Not found' } }, 404);
  });
  vi.stubGlobal('fetch', stub);
  return stub as unknown as ReturnType<typeof vi.fn>;
}

function renderStoreRoutes(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </QueryClientProvider>,
  );
}

function resolveBodies(
  stub: ReturnType<typeof vi.fn>,
): { reference?: string; refresh?: boolean }[] {
  return stub.mock.calls.flatMap(([url, init]) => {
    const entry = init as RequestInit | undefined;
    if (!String(url).endsWith('/api/resolve') || typeof entry?.body !== 'string') return [];
    return [JSON.parse(entry.body) as { reference?: string; refresh?: boolean }];
  });
}

let gatewayFetch: ReturnType<typeof stubGateway>;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify({ onboardingSeen: true }));
  document.documentElement.dataset.theme = 'dark';
  document.body.dataset.density = 'comfortable';
  gatewayFetch = stubGateway();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Orbisyn Store routes', () => {
  it('navigates to Explore, filters from the URL and exposes accessible shortcuts', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/');

    expect(screen.getByRole('heading', { name: /Every app\. Every source\./ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#os-main',
    );
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'os-main');

    const exploreLinks = screen.getAllByRole('link', { name: 'Explore' });
    await user.click(exploreLinks[0] as HTMLElement);
    expect(
      await screen.findByRole('heading', { name: 'Find the right app. From any source.' }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Search apps' }), 'localsend');
    expect(await screen.findByText(/for “localsend”/)).toBeInTheDocument();
    expect(screen.getAllByText('LocalSend').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bitwarden')).not.toBeInTheDocument();

    const desktop = screen.getByRole('button', { name: 'Desktop' });
    await user.click(desktop);
    expect(desktop).toHaveClass('is-active');

    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const commands = within(palette).getByRole('textbox', { name: 'Search commands' });
    await waitFor(() => expect(commands).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    );
  });

  it('verifies an app detail against the live resolver and shows upstream evidence', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/app/localsend');

    await user.click(screen.getByRole('button', { name: 'Verify live source' }));

    const evidenceLabel = await screen.findByText('Live upstream verification');
    const evidence = evidenceLabel.closest('.os-live-evidence') as HTMLElement;
    expect(within(evidence).getByText(/LocalSend resolved from github/)).toBeInTheDocument();
    expect(within(evidence).getByText('1.17.0')).toBeInTheDocument();
    expect(within(evidence).getByText(/Resolved in 42 ms/)).toBeInTheDocument();
    expect(resolveBodies(gatewayFetch)).toEqual([
      { reference: 'https://github.com/localsend/localsend', releases: 5, refresh: false },
    ]);
  });

  it('rejects insecure custom sources, then adds and verifies an HTTPS source', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/sources');

    const name = screen.getByLabelText('Source name');
    const url = screen.getByLabelText('Source URL');
    const submit = screen.getByRole('button', { name: /Add to source mesh/ });

    await user.type(name, 'Insecure Registry');
    await user.type(url, 'http://example.org/apps.json');
    await user.click(submit);
    expect(await screen.findByText('Use a valid HTTPS URL')).toBeInTheDocument();
    expect(screen.queryByText('Insecure Registry')).not.toBeInTheDocument();

    await user.clear(name);
    await user.clear(url);
    await user.type(name, 'Campus Forge');
    await user.type(url, 'https://github.com/campus/apps');
    await user.click(submit);

    expect((await screen.findAllByText('Campus Forge')).length).toBeGreaterThan(0);
    expect(
      resolveBodies(gatewayFetch).some(
        (body) => body.reference === 'https://github.com/campus/apps' && body.refresh === false,
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Verify Campus Forge' }));
    expect(await screen.findByText('Source verified')).toBeInTheDocument();
    expect(
      resolveBodies(gatewayFetch).some(
        (body) => body.reference === 'https://github.com/campus/apps' && body.refresh === true,
      ),
    ).toBe(true);
  });

  it('imports an Obtainium export as external references and a custom source', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/sources');

    const content = JSON.stringify({
      name: 'My Obtainium apps',
      apps: [
        {
          id: 'org.example.aurora',
          name: 'Example Aurora App',
          url: 'https://github.com/example/aurora-app',
        },
      ],
    });
    const file = new File([content], 'obtainium.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => content });

    await user.upload(screen.getByLabelText('Import Obtainium JSON'), file);

    expect(await screen.findByText('Obtainium import complete')).toBeInTheDocument();
    expect(screen.getAllByText('My Obtainium apps').length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(STORE_STORAGE_KEY)).toContain('Example Aurora App');

    const libraryLinks = screen.getAllByRole('link', { name: 'Library' });
    await user.click(libraryLinks[0] as HTMLElement);
    await user.click(await screen.findByRole('tab', { name: /Imported/ }));
    expect(await screen.findByText('Example Aurora App')).toBeInTheDocument();
  });

  it('runs the disclosed install preview without claiming installation, and supports wishlists', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/app/localsend');

    const install = screen.getAllByRole('button', { name: 'Install LocalSend' })[0] as HTMLElement;
    await user.click(install);
    expect(await screen.findByText('Install preview queued')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install queue, 1 active' }));
    expect(
      await screen.findByText('Preview complete · nothing installed', {}, { timeout: 6_000 }),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole('button', { name: 'Close install queue' })[0] as HTMLElement,
    );
    expect(screen.getAllByRole('button', { name: 'Install LocalSend' })[0]).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORE_STORAGE_KEY) ?? '{}').installed).toEqual(
      {},
    );

    const saveButtons = screen.getAllByRole('button', { name: 'Add LocalSend to wishlist' });
    await user.click(saveButtons[0] as HTMLElement);
    expect(
      screen.getAllByRole('button', { name: 'Remove LocalSend from wishlist' }).length,
    ).toBeGreaterThan(0);
  });

  it('starts honestly with no installed apps, and persists appearance and density settings', async () => {
    const user = userEvent.setup();
    renderStoreRoutes('/updates');

    expect(screen.getByRole('heading', { name: 'Nothing to update yet.' })).toBeInTheDocument();
    expect(screen.getByText('No apps in your library yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check sources' })).toBeDisabled();

    const settingsLinks = screen.getAllByRole('link', { name: 'Settings' });
    await user.click(settingsLinks[0] as HTMLElement);
    expect(
      await screen.findByRole('heading', { name: 'Settings that respect your choices.' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Daylight/ }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

    await user.click(screen.getByRole('checkbox', { name: /Compact layout/ }));
    await waitFor(() => expect(document.body.dataset.density).toBe('compact'));
    expect(window.localStorage.getItem(STORE_STORAGE_KEY)).toContain('"compact":true');
  });
});
