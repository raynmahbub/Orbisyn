import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../errors.js';
import {
  createFakeCache,
  createFakeProvider,
  createFakeRegistry,
  createProviderResolution,
  neverCredentials,
  silentLogger,
  testClock,
} from '../testing/fakes.js';
import { normalizeReference, ResolveSourceUseCase } from './resolve-source.js';

const HTTP = { request: vi.fn() };

function build(options: {
  resolve?: () => Promise<ReturnType<typeof createProviderResolution>>;
  supports?: (reference: string) => boolean;
}) {
  const clock = testClock('2024-06-01T00:00:00.000Z');
  const cache = createFakeCache(clock);
  const provider = createFakeProvider({
    ...(options.supports === undefined ? {} : { supports: options.supports }),
    ...(options.resolve === undefined
      ? {}
      : { resolve: () => options.resolve?.() ?? Promise.resolve(createProviderResolution()) }),
  });
  const useCase = new ResolveSourceUseCase({
    registry: createFakeRegistry([provider]),
    cache,
    clock,
    logger: silentLogger(),
    http: HTTP,
    credentials: neverCredentials(),
    cacheTtlSeconds: 300,
    httpTimeoutMs: 5_000,
  });
  return { useCase, cache, clock, provider };
}

describe('ResolveSourceUseCase', () => {
  beforeEach(() => {
    HTTP.request.mockReset();
  });

  it('resolves a reference and records each pipeline step', async () => {
    const { useCase } = build({});
    const result = await useCase.execute({
      reference: 'github.com/example/app',
      releases: 5,
      refresh: false,
    });

    expect(result.app.id).toBe('example-app');
    expect(result.releases).toHaveLength(1);
    expect(result.diagnostics.cache).toBe('miss');
    expect(result.diagnostics.steps.map((step) => step.id)).toEqual([
      'detect-provider',
      'provider-resolve',
      'assess-health',
    ]);
    expect(result.app.health?.grade).toBeTypeOf('string');
  });

  it('normalises the comparable latest version to semver', async () => {
    const resolution = createProviderResolution();
    const firstRelease = resolution.releases[0];
    if (firstRelease === undefined) throw new Error('fixture must contain a release');
    const { useCase } = build({
      resolve: async () => ({
        ...resolution,
        releases: [{ ...firstRelease, version: 'v1.4.0' }],
        app: { ...resolution.app, latestVersion: 'v1.4.0' },
      }),
    });

    const result = await useCase.execute({
      reference: 'github.com/example/app',
      releases: 5,
      refresh: false,
    });
    expect(result.app.latestVersion).toBe('1.4.0');
    // The upstream tag is preserved verbatim on the release itself.
    expect(result.releases[0]?.version).toBe('v1.4.0');
  });

  it('omits the comparable version when the tag is not semantic', async () => {
    const resolution = createProviderResolution();
    const firstRelease = resolution.releases[0];
    if (firstRelease === undefined) throw new Error('fixture must contain a release');
    const { useCase } = build({
      resolve: async () => ({
        ...resolution,
        releases: [{ ...firstRelease, version: 'rolling' }],
        app: { ...resolution.app, latestVersion: 'rolling' },
      }),
    });

    const result = await useCase.execute({
      reference: 'github.com/example/app',
      releases: 5,
      refresh: false,
    });
    expect(result.app.latestVersion).toBeUndefined();
  });

  it('serves a warm cache entry without calling the provider again', async () => {
    const { useCase, provider } = build({});
    await useCase.execute({ reference: 'github.com/example/app', releases: 5, refresh: false });
    const second = await useCase.execute({
      reference: 'github.com/example/app',
      releases: 5,
      refresh: false,
    });

    expect(second.diagnostics.cache).toBe('hit');
    expect(provider.calls).toHaveLength(1);
  });

  it('bypasses the cache when a refresh is requested', async () => {
    const { useCase, provider } = build({});
    await useCase.execute({ reference: 'github.com/example/app', releases: 5, refresh: false });
    await useCase.execute({ reference: 'github.com/example/app', releases: 5, refresh: true });
    expect(provider.calls).toHaveLength(2);
  });

  it('falls back to stale data when the upstream fails', async () => {
    const resolution = createProviderResolution();
    let shouldFail = false;
    const { useCase, clock } = build({
      resolve: async () => {
        if (shouldFail) throw DomainError.rateLimited('github', 60);
        return resolution;
      },
    });

    await useCase.execute({ reference: 'github.com/example/app', releases: 5, refresh: false });
    // Age the entry past its TTL, then make the provider fail.
    clock.advance(10 * 60 * 1000);
    shouldFail = true;

    const result = await useCase.execute({
      reference: 'github.com/example/app',
      releases: 5,
      refresh: false,
    });
    expect(result.diagnostics.cache).toBe('revalidate');
    expect(result.diagnostics.warnings[0]).toContain('cached data');
    expect(result.diagnostics.providerErrors[0]?.code).toBe('rate-limited');
    expect(result.app.id).toBe('example-app');
  });

  it('propagates the failure when there is nothing cached', async () => {
    const { useCase } = build({
      resolve: async () => {
        throw DomainError.notFound('missing');
      },
    });
    await expect(
      useCase.execute({ reference: 'github.com/example/app', releases: 5, refresh: false }),
    ).rejects.toThrowError(/missing/);
  });

  it('rejects references no provider claims', async () => {
    const { useCase } = build({ supports: () => false });
    await expect(
      useCase.execute({ reference: 'what is this', releases: 5, refresh: false }),
    ).rejects.toThrowError(/No source provider/);
  });
});

describe('normalizeReference', () => {
  it('collapses cosmetic differences for cache keys', () => {
    expect(normalizeReference('HTTPS://GitHub.com/Example/App.git/')).toBe(
      'github.com/example/app',
    );
  });
});
