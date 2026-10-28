import { OspDocumentSchema, ospUriForId } from '@orbisyn/contracts';
import type { AppRecord, RepositoryRef } from '@orbisyn/core';
import { canonicalOspUri, ospIdFromUri } from '@orbisyn/core';
import { describe, expect, it, vi } from 'vitest';
import {
  appRecordFromDocument,
  candidateDocumentUrls,
  discoverOspDocument,
  documentToRepositoryRef,
  verifyDocumentAgainstApp,
} from './document.js';

const DOCUMENT = {
  spec: '1.0',
  id: 'example-app',
  name: 'Example App',
  summary: 'An OSP aware application',
  license: 'MIT',
  platforms: ['android', 'linux'],
  categories: ['utilities'],
  sources: [{ kind: 'github', url: 'https://github.com/example/app' }],
  mirrors: ['https://example.org'],
  artifacts: [],
  replaces: [],
  maintainers: [{ name: 'Example Team', url: 'https://example.org/team' }],
  updatedAt: '2024-05-01T00:00:00.000Z',
};

const REFERENCE: RepositoryRef = {
  kind: 'github',
  id: '1',
  host: 'github.com',
  path: 'example/app',
  webUrl: 'https://github.com/example/app',
  defaultBranch: 'main',
};

describe('OSP identity', () => {
  it('canonicalises URIs from any spelling', () => {
    expect(canonicalOspUri('osp://github.com/bitwarden/android')).toBe('osp://bitwarden-android');
    expect(canonicalOspUri('OSP://Bitwarden-Android')).toBe('osp://bitwarden-android');
    expect(ospIdFromUri('osp://bitwarden-android')).toBe('bitwarden-android');
    expect(ospUriForId('bitwarden-android')).toBe('osp://bitwarden-android');
    expect(canonicalOspUri('https://github.com/example/app')).toBeNull();
  });
});

describe('candidateDocumentUrls', () => {
  it('uses the documented raw-content paths per provider', () => {
    expect(candidateDocumentUrls(REFERENCE)[0]?.url).toBe(
      'https://raw.githubusercontent.com/example/app/HEAD/orbisyn.json',
    );

    const gitlab: RepositoryRef = {
      ...REFERENCE,
      kind: 'gitlab',
      host: 'gitlab.com',
      path: 'KDE/kdenlive',
    };
    expect(candidateDocumentUrls(gitlab)[0]?.url).toBe(
      'https://gitlab.com/KDE/kdenlive/-/raw/HEAD/orbisyn.json',
    );

    const forgejo: RepositoryRef = {
      ...REFERENCE,
      kind: 'forgejo',
      host: 'forgejo.example.org',
      path: 'team/project',
    };
    expect(candidateDocumentUrls(forgejo)[0]?.url).toBe(
      'https://forgejo.example.org/team/project/raw/HEAD/orbisyn.json',
    );
  });

  it('follows the default branch name when the forge family needs it', () => {
    const codeberg: RepositoryRef = {
      ...REFERENCE,
      kind: 'codeberg',
      host: 'codeberg.org',
      path: 'forgejo/forgejo',
      defaultBranch: 'develop',
    };
    expect(candidateDocumentUrls(codeberg).map((entry) => entry.url)).toEqual([
      'https://codeberg.org/forgejo/forgejo/raw/HEAD/orbisyn.json',
      'https://codeberg.org/forgejo/forgejo/raw/branch/develop/orbisyn.json',
    ]);
  });

  it('looks next to the file for a direct download url', () => {
    const direct: RepositoryRef = {
      ...REFERENCE,
      kind: 'direct-url',
      host: 'downloads.example.org',
      path: 'files/app-1.0.AppImage',
      webUrl: 'https://downloads.example.org/files/app-1.0.AppImage',
    };
    expect(candidateDocumentUrls(direct)[0]?.url).toBe(
      'https://downloads.example.org/files/orbisyn.json',
    );
  });

  it('does not pretend F-Droid packages publish documents', () => {
    expect(candidateDocumentUrls({ ...REFERENCE, kind: 'fdroid' })).toEqual([]);
  });
});

describe('discoverOspDocument', () => {
  it('returns the first valid document', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/HEAD/orbisyn.json')) {
        return new Response(JSON.stringify(DOCUMENT), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await discoverOspDocument(REFERENCE, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result?.document.id).toBe('example-app');
    expect(result?.warnings).toEqual([]);
  });

  it('reports a malformed document and keeps looking', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) =>
      String(url).endsWith('/HEAD/orbisyn.json')
        ? new Response('{"id": 42}', { status: 200 })
        : new Response(JSON.stringify(DOCUMENT), { status: 200 }),
    );

    const result = await discoverOspDocument(REFERENCE, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result?.document.id).toBe('example-app');
    expect(result?.warnings[0]).toContain('does not satisfy the OSP schema');
  });

  it('returns null when nothing is published', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const result = await discoverOspDocument(REFERENCE, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });
});

describe('appRecordFromDocument', () => {
  it('produces a record without inventing data', () => {
    const document = OspDocumentSchema.parse(DOCUMENT);
    const app = appRecordFromDocument(document, { now: new Date('2024-06-01T00:00:00.000Z') });

    expect(app.id).toBe('example-app');
    expect(app.ospUri).toBe('osp://example-app');
    expect(app.license).toBe('MIT');
    expect(app.platforms).toEqual(['android', 'linux']);
    expect(app.author).toBe('Example Team');
    expect(app.source).toMatchObject({ kind: 'github', host: 'github.com', path: 'example/app' });
    expect(app.latestRelease).toBeUndefined();
    expect(app.fetchedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('refuses to guess a repository when the document declares none', () => {
    // The schema requires a source, so this guard is only reachable for a
    // document assembled in memory — which is exactly why it is tested here.
    const document = OspDocumentSchema.parse(DOCUMENT);
    const withoutSources = { ...document, sources: [] } as typeof document;
    expect(() => documentToRepositoryRef(withoutSources)).toThrow(/declares no source/);
  });

  it('falls back to the resolved repository reference', () => {
    const document = OspDocumentSchema.parse(DOCUMENT);
    const app = appRecordFromDocument(document, { fallbackSource: REFERENCE });
    expect(app.source.path).toBe('example/app');
  });
});

describe('documentToRepositoryRef', () => {
  it('derives a repository reference from the primary source', () => {
    const reference = documentToRepositoryRef(OspDocumentSchema.parse(DOCUMENT));
    expect(reference).toMatchObject({ kind: 'github', host: 'github.com', path: 'example/app' });
  });
});

describe('verifyDocumentAgainstApp', () => {
  const app: AppRecord = {
    id: 'example-app',
    ospUri: 'osp://example-app',
    name: 'Example App',
    screenshots: [],
    license: 'MIT',
    categories: [],
    tags: [],
    platforms: ['android'],
    source: REFERENCE,
    alternateSources: [],
    archived: false,
    fetchedAt: '2024-06-01T00:00:00.000Z',
  };

  it('confirms matching documents', () => {
    const verification = verifyDocumentAgainstApp(OspDocumentSchema.parse(DOCUMENT), app);
    expect(verification.consistent).toBe(true);
    expect(verification.confirmed).toEqual(
      expect.arrayContaining(['identity', 'licence', 'platforms']),
    );
  });

  it('reports identity and licence conflicts', () => {
    const conflicting = OspDocumentSchema.parse({
      ...DOCUMENT,
      id: 'other-app',
      license: 'AGPL-3.0',
      platforms: ['ios'],
    });
    const verification = verifyDocumentAgainstApp(conflicting, app);
    expect(verification.consistent).toBe(false);
    expect(verification.mismatches).toHaveLength(3);
  });
});
