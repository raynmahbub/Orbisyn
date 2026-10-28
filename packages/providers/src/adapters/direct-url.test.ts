import { describe, expect, it } from 'vitest';
import { createFakeHttp, createTestContext } from '../testing/index.js';
import { createDirectUrlProvider, supportsDirectUrl } from './direct-url.js';

const APK_URL = 'https://mirror.example.org/releases/ExampleApp-2.4.1-arm64-v8a.apk';

function build(routes: Parameters<typeof createFakeHttp>[0] = []) {
  const http = createFakeHttp(routes);
  return { http, context: createTestContext(http), provider: createDirectUrlProvider() };
}

describe('Direct URL provider', () => {
  it('builds a record from HEAD metadata', async () => {
    const { provider, context } = build([
      {
        url: APK_URL,
        method: 'HEAD',
        headers: {
          'content-type': 'application/vnd.android.package-archive',
          'content-length': '12582912',
          'last-modified': 'Wed, 15 May 2024 10:00:00 GMT',
          'content-disposition': 'attachment; filename="ExampleApp-2.4.1-arm64-v8a.apk"',
        },
      },
    ]);

    const { app, releases } = await provider.resolve(APK_URL, context, {
      releases: 1,
      refresh: false,
    });

    expect(app.name).toBe('Example App');
    expect(app.platforms).toEqual(['android']);
    expect(app.license).toBe('unknown');
    expect(app.source.kind).toBe('direct-url');
    expect(releases[0]?.version).toBe('2.4.1');
    expect(releases[0]?.artifacts[0]?.sizeBytes).toBe(12_582_912);
    expect(releases[0]?.artifacts[0]?.architecture).toBe('arm64');
    expect(releases[0]?.publishedAt).toBe('2024-05-15T10:00:00.000Z');
  });

  it('falls back to a ranged GET when the server rejects HEAD', async () => {
    const { provider, context, http } = build([
      { url: APK_URL, method: 'HEAD', status: 405, body: {} },
      {
        url: APK_URL,
        status: 206,
        headers: { 'content-type': 'application/vnd.android.package-archive' },
      },
    ]);

    const { releases } = await provider.resolve(APK_URL, context, { releases: 1, refresh: false });
    expect(releases[0]?.version).toBe('2.4.1');
    expect(http.calls.filter((call) => call.startsWith('HEAD'))).toHaveLength(1);
  });

  it('marks unknown versions instead of inventing one', async () => {
    const { provider, context } = build([
      {
        url: 'https://example.org/nightly/latest.apk',
        method: 'HEAD',
        headers: { 'content-type': 'application/vnd.android.package-archive' },
      },
    ]);

    const { releases, app } = await provider.resolve(
      'https://example.org/nightly/latest.apk',
      context,
      {
        releases: 1,
        refresh: false,
      },
    );
    expect(releases[0]?.version).toBe('unknown');
    expect(app.latestVersion).toBeUndefined();
  });

  it('reports a failing download as not found', async () => {
    const { provider, context } = build([{ url: APK_URL, method: 'HEAD', status: 404, body: {} }]);
    await expect(
      provider.resolve(APK_URL, context, { releases: 1, refresh: false }),
    ).rejects.toThrowError(/responded with 404/);
  });

  it('defers forge URLs to their structured provider', async () => {
    const { provider, context } = build();
    await expect(
      provider.resolve('https://github.com/example/app/releases/download/v1/app.apk', context, {
        releases: 1,
        refresh: false,
      }),
    ).rejects.toThrowError(/resolved by the github provider/);
  });

  it('only claims absolute http(s) URLs', () => {
    expect(supportsDirectUrl(APK_URL)).toBe(true);
    expect(supportsDirectUrl('github.com/example/app')).toBe(false);
    expect(supportsDirectUrl('example.org/file.apk')).toBe(false);
  });
});
