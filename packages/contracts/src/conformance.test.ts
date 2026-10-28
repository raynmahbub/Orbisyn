import type * as Domain from '@orbisyn/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as Wire from './index.js';
import {
  AppRecordSchema,
  AppSummarySchema,
  ArtifactSchema,
  CollectionSchema,
  DiagnosticsSchema,
  HealthStatusSchema,
  ProviderDescriptorSchema,
  ReleaseSchema,
  RepositoryHealthSchema,
  RepositoryRefSchema,
  ResolveResponseSchema,
  SearchResponseSchema,
  SyncOperationSchema,
  SyncResponseSchema,
} from './index.js';

/**
 * Wire ↔ domain conformance.
 *
 * The domain model in `@orbisyn/core` and the schemas in this package are
 * intentionally separate: the domain must not depend on a validation library,
 * and the wire format must be free to evolve. These assertions make the
 * duplication safe — if the two ever drift, `npm run typecheck` fails instead of
 * a client receiving a payload it cannot parse.
 *
 * `toEqualTypeOf` on the key sets is the important half: a field added to one
 * side but not the other is exactly the mistake this file exists to catch.
 */

describe('type-level conformance', () => {
  it('keeps wire payloads assignable to the domain model', () => {
    expectTypeOf<Wire.AppRecord>().toExtend<Domain.AppRecord>();
    expectTypeOf<Wire.Release>().toExtend<Domain.Release>();
    expectTypeOf<Wire.Artifact>().toExtend<Domain.Artifact>();
    expectTypeOf<Wire.RepositoryRef>().toExtend<Domain.RepositoryRef>();
    expectTypeOf<Wire.RepositoryHealth>().toExtend<Domain.RepositoryHealth>();
    expectTypeOf<Wire.Collection>().toExtend<Domain.Collection>();
    expectTypeOf<Wire.SyncOperation>().toExtend<Domain.SyncOperation>();
    expectTypeOf<Wire.Diagnostics>().toExtend<Domain.Diagnostics>();
    expectTypeOf<Wire.ResolveResponse>().toExtend<Domain.ResolveResponse>();
    expectTypeOf<Wire.ProviderDescriptor>().toExtend<Domain.ProviderDescriptor>();
  });

  it('agrees on the exact set of fields of each record', () => {
    expectTypeOf<keyof Wire.AppRecord>().toEqualTypeOf<keyof Domain.AppRecord>();
    expectTypeOf<keyof Wire.AppSummary>().toEqualTypeOf<keyof Domain.AppSummary>();
    expectTypeOf<keyof Wire.Release>().toEqualTypeOf<keyof Domain.Release>();
    expectTypeOf<keyof Wire.Artifact>().toEqualTypeOf<keyof Domain.Artifact>();
    expectTypeOf<keyof Wire.RepositoryRef>().toEqualTypeOf<keyof Domain.RepositoryRef>();
    expectTypeOf<keyof Wire.RepositoryHealth>().toEqualTypeOf<keyof Domain.RepositoryHealth>();
    expectTypeOf<keyof Wire.Collection>().toEqualTypeOf<keyof Domain.Collection>();
    expectTypeOf<keyof Wire.SyncOperation>().toEqualTypeOf<keyof Domain.SyncOperation>();
    expectTypeOf<keyof Wire.Diagnostics>().toEqualTypeOf<keyof Domain.Diagnostics>();
    expectTypeOf<keyof Wire.SearchResponse>().toEqualTypeOf<keyof Domain.SearchResult>();
  });

  it('agrees on enum members', () => {
    expectTypeOf<Wire.Platform>().toEqualTypeOf<Domain.Platform>();
    expectTypeOf<Wire.SourceKind>().toEqualTypeOf<Domain.SourceKind>();
    expectTypeOf<Wire.ReleaseChannel>().toEqualTypeOf<Domain.ReleaseChannel>();
    expectTypeOf<Wire.Architecture>().toEqualTypeOf<Domain.Architecture>();
    expectTypeOf<keyof Wire.ProviderCapabilities>().toEqualTypeOf<
      keyof Domain.ProviderCapabilities
    >();
  });
});

describe('runtime conformance', () => {
  const artifact = {
    url: 'https://example.org/app-1.4.0.apk',
    fileName: 'app-1.4.0.apk',
    sizeBytes: 1024,
    platform: 'android',
    architecture: 'arm64',
    listingOnly: false,
  };

  const release = {
    id: 'example:1',
    appId: 'example-app',
    source: 'github',
    version: '1.4.0',
    channel: 'stable',
    isPrerelease: false,
    publishedAt: '2024-05-01T10:00:00.000Z',
    sourceUrl: 'https://github.com/example/app/releases/tag/v1.4.0',
    artifacts: [artifact],
    fetchedAt: '2024-06-01T00:00:00.000Z',
  };

  const app = {
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
  };

  it('parses a minimal payload and satisfies the domain type', () => {
    const parsed: Domain.AppRecord = AppRecordSchema.parse(app);
    expect(parsed.id).toBe('example-app');
    expect(parsed.screenshots).toEqual([]);
  });

  it('fills documented defaults rather than rejecting them', () => {
    const parsed = ArtifactSchema.parse({
      url: 'https://example.org/tool',
      platform: 'linux',
    });
    expect(parsed.architecture).toBe('unknown');
    expect(parsed.listingOnly).toBe(false);
  });

  it('rejects payloads that would break the domain', () => {
    expect(AppRecordSchema.safeParse({ ...app, id: 'Not Valid' }).success).toBe(false);
    expect(ReleaseSchema.safeParse({ ...release, version: '' }).success).toBe(false);
    expect(
      RepositoryRefSchema.safeParse({
        kind: 'bitbucket',
        id: '1',
        host: 'h',
        path: 'p',
        webUrl: 'https://h/p',
      }).success,
    ).toBe(false);
  });

  it('keeps the response envelopes in sync with the domain', () => {
    const resolved: Domain.ResolveResponse = ResolveResponseSchema.parse({
      app,
      releases: [release],
      diagnostics: {
        steps: [{ id: 'detect-provider', status: 'ok', durationMs: 1 }],
        warnings: [],
        durationMs: 12,
        cache: 'miss',
        providerErrors: [],
      },
    });
    expect(resolved.releases).toHaveLength(1);

    const summary: Domain.AppSummary = AppSummarySchema.parse({
      id: app.id,
      ospUri: app.ospUri,
      name: app.name,
      license: app.license,
      platforms: app.platforms,
      categories: [],
      archived: false,
      fetchedAt: app.fetchedAt,
      latestVersion: null,
      latestPublishedAt: null,
      healthGrade: null,
      sourceKind: 'github',
      stars: null,
    });
    expect(summary.latestVersion).toBeNull();

    const collection: Domain.Collection = CollectionSchema.parse({
      id: 'collection-1',
      name: 'Favourites',
      appIds: [app.id],
      visibility: 'private',
      createdAt: app.fetchedAt,
      updatedAt: app.fetchedAt,
    });
    expect(collection.visibility).toBe('private');

    const operation: Domain.SyncOperation = SyncOperationSchema.parse({
      id: 'op-1',
      entity: 'collection',
      op: 'upsert',
      entityId: collection.id,
      payload: { name: 'Favourites' },
      updatedAt: app.fetchedAt,
      deviceId: 'device-1',
    });
    expect(operation.entity).toBe('collection');

    const sync: Domain.SyncResult = SyncResponseSchema.parse({
      cursor: '1',
      applied: ['op-1'],
      rejected: [],
      conflicts: [],
      collections: [collection],
    });
    expect(sync.cursor).toBe('1');

    expect(DiagnosticsSchema.parse(resolved.diagnostics).cache).toBe('miss');
    expect(
      SearchResponseSchema.parse({
        items: [summary],
        nextCursor: null,
        tookMs: 4,
        queriedSources: ['github'],
      }).items,
    ).toHaveLength(1);
    expect(
      RepositoryHealthSchema.parse({
        score: 80,
        grade: 'B',
        components: [{ id: 'maintenance', score: 80, weight: 0.25, rationale: 'recent commits' }],
        computedAt: app.fetchedAt,
        inputs: {
          stars: 10,
          forks: 1,
          openIssues: 2,
          contributors: 3,
          lastCommitAt: app.fetchedAt,
          releasesLastYear: 4,
          medianReleaseIntervalDays: 90,
          archived: false,
          hasSecurityPolicy: true,
          hasContributingGuide: true,
          hasCi: true,
        },
      }).grade,
    ).toBe('B');
    expect(
      ProviderDescriptorSchema.parse({
        kind: 'github',
        label: 'GitHub',
        homepage: 'https://github.com',
        capabilities: {
          resolveApp: true,
          listReleases: true,
          listArtifacts: true,
          verifyArtifacts: true,
          repositoryStats: true,
          projectGovernance: true,
          authenticated: true,
        },
        examples: [],
        status: 'stable',
      }).kind,
    ).toBe('github');
    expect(
      HealthStatusSchema.parse({
        status: 'ok',
        version: '0.1.0-dev.0',
        uptimeSeconds: 1,
        providers: [{ kind: 'github', state: 'enabled', lastFailureAt: null }],
        store: 'memory',
      }).store,
    ).toBe('memory');
  });
});
