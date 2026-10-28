import { describe, expect, it } from 'vitest';
import { createFakeHttp, createTestContext, jsonRoute } from '../testing/index.js';
import { createFdroidProvider, extractPackageName, parsePackagePage } from './fdroid.js';

const API = 'https://f-droid.org/api/v1/packages/org.fdroid.fdroid';
const PAGE = 'https://f-droid.org/en/packages/org.fdroid.fdroid/';

const VERSIONS = [
  {
    versionCode: 1016001,
    versionName: '1.16.0',
    apkName: 'org.fdroid.fdroid_1016001.apk',
    hash: 'A'.repeat(64),
    hashType: 'sha256',
    size: 8_912_896,
    added: Date.parse('2024-05-12T00:00:00Z'),
    signer: '43238d512c1e5eb2d6569f4a3afbf5523418b82e0a3ed1552770abb9a9c9ccab',
    nativeCode: ['arm64-v8a'],
  },
  {
    versionCode: 1015051,
    versionName: '1.15.1',
    apkName: 'org.fdroid.fdroid_1015051.apk',
    hash: 'b'.repeat(64),
    hashType: 'sha256',
    size: 8_800_000,
    added: Date.parse('2024-02-01T00:00:00Z'),
    signer: '43238d512c1e5eb2d6569f4a3afbf5523418b82e0a3ed1552770abb9a9c9ccab',
  },
];

const HTML_FIXTURE = `<!doctype html>
<html><head>
<title>F-Droid | Free and Open Source Android App Repository</title>
<meta property="og:title" content="F-Droid" />
<meta property="og:description" content="The app store that respects freedom and privacy" />
<link rel="icon" href="/assets/icon.png" />
</head><body>
<h3>F-Droid</h3>
<img class="package-icon" src="/repo/icons-640/org.fdroid.fdroid.png" />
<div class="package-license">License: <a href="/en/docs/GPLv3">GPL-3.0-or-later</a></div>
<div class="package-author">Author: <a href="/en/packages/?author=Ciaran+Gultnieks">Ciaran Gultnieks</a></div>
<a class="external" href="https://f-droid.org">f-droid.org</a>
<a href="/en/packages/?category=System">System</a>
<img class="screenshot" src="/repo/screenshots/org.fdroid.fdroid/1.png" />
</body></html>`;

function build() {
  const http = createFakeHttp([jsonRoute(API, VERSIONS), { url: PAGE, text: HTML_FIXTURE }]);
  return { http, context: createTestContext(http), provider: createFdroidProvider() };
}

describe('F-Droid provider', () => {
  it('resolves a package into verifiable releases', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve(
      'https://f-droid.org/packages/org.fdroid.fdroid',
      context,
      {
        releases: 10,
        refresh: false,
      },
    );

    expect(releases).toHaveLength(2);
    // Newest versionCode first.
    expect(releases[0]?.version).toBe('1.16.0');

    const artifact = releases[0]?.artifacts[0];
    expect(artifact?.platform).toBe('android');
    expect(artifact?.url).toBe('https://f-droid.org/repo/org.fdroid.fdroid_1016001.apk');
    expect(artifact?.checksum).toEqual({ algorithm: 'sha256', value: 'a'.repeat(64) });
    expect(artifact?.signature).toEqual({
      scheme: 'apk-v2',
      keyId: '43238d512c1e5eb2d6569f4a3afbf5523418b82e0a3ed1552770abb9a9c9ccab',
    });
    expect(artifact?.sizeBytes).toBe(8_912_896);
  });

  it('honours the release limit', async () => {
    const { provider, context } = build();
    const { releases } = await provider.resolve('org.fdroid.fdroid', context, {
      releases: 1,
      refresh: false,
    });
    expect(releases).toHaveLength(1);
  });

  it('enriches the record from the package page', async () => {
    const { provider, context } = build();
    const { app } = await provider.resolve('org.fdroid.fdroid', context, {
      releases: 1,
      refresh: false,
    });

    expect(app.id).toBe('fdroid-org-fdroid-fdroid');
    expect(app.name).toBe('F-Droid');
    expect(app.summary).toContain('respects freedom');
    expect(app.license).toBe('GPL-3.0-or-later');
    expect(app.author).toBe('Ciaran Gultnieks');
    expect(app.categories).toEqual(['system']);
    expect(app.iconUrl).toBe('https://f-droid.org/repo/icons-640/org.fdroid.fdroid.png');
    expect(app.platforms).toEqual(['android']);
  });

  it('still resolves when the package page is unavailable', async () => {
    const http = createFakeHttp([jsonRoute(API, VERSIONS)]);
    const context = createTestContext(http);
    const { app } = await createFdroidProvider().resolve('org.fdroid.fdroid', context, {
      releases: 1,
      refresh: false,
    });

    expect(app.name).toBe('org.fdroid.fdroid');
    expect(app.license).toBe('unknown');
  });

  it('reports unknown packages as not found', async () => {
    const http = createFakeHttp([
      { url: 'https://f-droid.org/api/v1/packages/com.example.nothing', status: 404, body: {} },
    ]);
    const context = createTestContext(http);
    await expect(
      createFdroidProvider().resolve('com.example.nothing', context, {
        releases: 1,
        refresh: false,
      }),
    ).rejects.toThrowError(/no published versions/);
  });

  it('only claims package identifiers it can parse', () => {
    const provider = createFdroidProvider();
    expect(provider.supports('fdroid:com.termux')).toBe(true);
    expect(provider.supports('com.termux')).toBe(true);
    expect(provider.supports('https://f-droid.org/en/packages/com.termux/')).toBe(true);
    expect(provider.supports('https://github.com/termux/termux-app')).toBe(false);
  });
});

describe('extractPackageName', () => {
  it('accepts the documented spellings', () => {
    expect(extractPackageName('fdroid:com.termux')).toBe('com.termux');
    expect(extractPackageName('https://f-droid.org/packages/com.termux')).toBe('com.termux');
    expect(extractPackageName('org.fdroid.fdroid')).toBe('org.fdroid.fdroid');
    expect(extractPackageName('not a package')).toBeNull();
  });
});

describe('parsePackagePage', () => {
  it('extracts licence, author, category, icon and screenshots', () => {
    const meta = parsePackagePage(HTML_FIXTURE);
    expect(meta.license).toBe('GPL-3.0-or-later');
    expect(meta.author).toBe('Ciaran Gultnieks');
    expect(meta.categories).toEqual(['system']);
    expect(meta.iconUrl).toContain('org.fdroid.fdroid.png');
    expect(meta.screenshots?.[0]).toContain('screenshots');
  });

  it('survives markup changes by returning what it can', () => {
    expect(parsePackagePage('<html><body>nothing useful</body></html>')).toEqual({});
  });
});
