import { z } from 'zod';
import {
  IsoDateTimeSchema,
  LicenseSchema,
  OspIdSchema,
  PlatformSchema,
  SemverSchema,
  UrlSchema,
} from './primitive.js';
import { ReleaseSchema, RepositoryRefSchema, SourceKindSchema } from './provider.js';

/**
 * The canonical app record. Every provider resolves *into* this shape, which is
 * why the clients never need to know where a record came from.
 */

export const HealthComponentSchema = z.object({
  id: z.enum([
    'release-cadence',
    'maintenance',
    'community',
    'documentation',
    'governance',
    'licensing',
  ]),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  rationale: z.string().max(512),
});
export type HealthComponent = z.infer<typeof HealthComponentSchema>;

export const RepositoryHealthSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'E']),
  components: z.array(HealthComponentSchema).min(1),
  computedAt: IsoDateTimeSchema,
  /** Raw counters the score was derived from, kept for auditability. */
  inputs: z.object({
    stars: z.number().int().min(0).nullable(),
    forks: z.number().int().min(0).nullable(),
    openIssues: z.number().int().min(0).nullable(),
    contributors: z.number().int().min(0).nullable(),
    lastCommitAt: IsoDateTimeSchema.nullable(),
    releasesLastYear: z.number().int().min(0).nullable(),
    medianReleaseIntervalDays: z.number().min(0).nullable(),
    archived: z.boolean(),
    hasSecurityPolicy: z.boolean().nullable(),
    hasContributingGuide: z.boolean().nullable(),
    hasCi: z.boolean().nullable(),
  }),
});
export type RepositoryHealth = z.infer<typeof RepositoryHealthSchema>;

export const AppRecordSchema = z.object({
  id: OspIdSchema,
  /** Canonical identity URI, e.g. `osp://bitwarden-android`. */
  ospUri: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  summary: z.string().max(512).optional(),
  description: z.string().max(20_000).optional(),
  homepage: UrlSchema.optional(),
  iconUrl: UrlSchema.optional(),
  screenshots: z.array(UrlSchema).max(24).default([]),
  license: LicenseSchema,
  licenseFile: UrlSchema.optional(),
  categories: z.array(z.string().min(1).max(48)).max(16).default([]),
  tags: z.array(z.string().min(1).max(48)).max(32).default([]),
  platforms: z.array(PlatformSchema).min(1),
  author: z.string().max(160).optional(),
  source: RepositoryRefSchema,
  /** Other repositories that ship the same app, ordered by confidence. */
  alternateSources: z.array(RepositoryRefSchema).max(16).default([]),
  latestRelease: ReleaseSchema.optional(),
  latestVersion: SemverSchema.optional(),
  health: RepositoryHealthSchema.optional(),
  archived: z.boolean().default(false),
  fetchedAt: IsoDateTimeSchema,
});
export type AppRecord = z.infer<typeof AppRecordSchema>;

/**
 * Compact projection used by list endpoints. Keeps search payloads small enough
 * for a phone on a slow link.
 */
export const AppSummarySchema = AppRecordSchema.pick({
  id: true,
  ospUri: true,
  name: true,
  summary: true,
  iconUrl: true,
  license: true,
  platforms: true,
  categories: true,
  archived: true,
  fetchedAt: true,
}).extend({
  latestVersion: z.string().max(128).nullable(),
  latestPublishedAt: IsoDateTimeSchema.nullable(),
  healthGrade: RepositoryHealthSchema.shape.grade.nullable(),
  sourceKind: SourceKindSchema,
  stars: z.number().int().min(0).nullable(),
});
export type AppSummary = z.infer<typeof AppSummarySchema>;
