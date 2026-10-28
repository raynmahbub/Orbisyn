import { z } from 'zod';
import { AppRecordSchema, AppSummarySchema } from './app.js';
import { IsoDateTimeSchema, OspIdSchema, PlatformSchema, UrlSchema } from './primitive.js';
import { ProviderErrorSchema, ReleaseSchema, SourceKindSchema } from './provider.js';

/**
 * Resolution is the heart of Orbisyn: an arbitrary source reference goes in,
 * a canonical app record plus its release history comes out — always with a
 * trace of how it was produced.
 */

export const ResolutionStepSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['ok', 'skipped', 'failed']),
  detail: z.string().max(512).optional(),
  durationMs: z.number().min(0),
});
export type ResolutionStep = z.infer<typeof ResolutionStepSchema>;

export const DiagnosticsSchema = z.object({
  steps: z.array(ResolutionStepSchema),
  warnings: z.array(z.string().max(512)).max(32),
  durationMs: z.number().min(0),
  cache: z.enum(['hit', 'miss', 'revalidate', 'bypass']),
  providerErrors: z.array(ProviderErrorSchema).max(16).default([]),
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export const ResolveRequestSchema = z.object({
  /** Either a full source URL or an `osp://` URI. */
  reference: z.string().min(3).max(1024),
  /** Number of releases to include. `0` resolves metadata only. */
  releases: z.coerce.number().int().min(0).max(100).default(10),
  refresh: z.boolean().default(false),
});
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>;

export const ResolveResponseSchema = z.object({
  app: AppRecordSchema,
  releases: z.array(ReleaseSchema),
  diagnostics: DiagnosticsSchema,
});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

/**
 * Query-string arrays: `?platform=android&platform=ios` and `?platform=android`
 * are both valid, and clients routinely send the single-value form.
 */
function queryArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.preprocess(
    (value) =>
      value === undefined || value === null ? undefined : Array.isArray(value) ? value : [value],
    z.array(item).max(max),
  );
}

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(256),
  platform: queryArray(PlatformSchema, 6).optional(),
  license: queryArray(z.string().min(1).max(64), 8).optional(),
  source: queryArray(SourceKindSchema, 8).optional(),
  minHealthScore: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(256).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResponseSchema = z.object({
  items: z.array(AppSummarySchema),
  nextCursor: z.string().nullable(),
  tookMs: z.number().min(0),
  /** Providers actually queried for this request. */
  queriedSources: z.array(SourceKindSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Offline-first caching contract: the client stores this envelope in IndexedDB
 * and serves it without network. `freshness` lets the UI show staleness instead
 * of blocking on a fetch.
 */
export const CacheEnvelopeSchema = z.object({
  key: z.string().min(1).max(256),
  storedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  etag: z.string().max(128).optional(),
  payload: z.unknown(),
});
export type CacheEnvelope = z.infer<typeof CacheEnvelopeSchema>;

export const WatchTargetSchema = z.object({
  appId: OspIdSchema,
  sourceUrl: UrlSchema,
  addedAt: IsoDateTimeSchema,
});

export const UpdateCheckResponseSchema = z.object({
  checkedAt: IsoDateTimeSchema,
  updates: z.array(
    z.object({
      appId: OspIdSchema,
      installedVersion: z.string().max(128).nullable(),
      latestVersion: z.string().max(128),
      release: ReleaseSchema,
    }),
  ),
});
export type UpdateCheckResponse = z.infer<typeof UpdateCheckResponseSchema>;
