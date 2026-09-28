import { z } from 'zod';
import { AppRecordSchema } from './app.js';
import {
  IsoDateTimeSchema,
  LicenseSchema,
  OspIdSchema,
  PlatformSchema,
  UrlSchema,
} from './primitive.js';
import { ArtifactSchema, RepositoryRefSchema, SourceKindSchema } from './provider.js';

/**
 * Open Source Presence (OSP) — the portable identity layer.
 *
 * An OSP document is what a *publisher* commits to a repository so that any
 * client can resolve, verify and display the project without crawling it first.
 * It is deliberately small, human-auditable and independent of Orbisyn's own
 * API: `GET <repo>/orbisyn.json`.
 */

export const OSP_DOCUMENT_FILENAME = 'orbisyn.json';
export const OSP_URI_SCHEME = 'osp';
export const OSP_SPEC_VERSION = '1.0';

export const OspSourceSchema = z.object({
  kind: SourceKindSchema,
  url: UrlSchema,
  /** Optional publisher-owned verification token, checked against the repo. */
  proof: z
    .object({
      method: z.enum(['well-known', 'file', 'dns-txt']),
      value: z.string().min(1).max(512),
      verifiedAt: IsoDateTimeSchema.nullable().default(null),
    })
    .optional(),
});

export type OspSource = z.infer<typeof OspSourceSchema>;

export const OspDocumentSchema = z.object({
  spec: z.literal(OSP_SPEC_VERSION).or(z.string().regex(/^\d+\.\d+$/)),
  id: OspIdSchema,
  name: z.string().min(1).max(160),
  summary: z.string().max(512).optional(),
  license: LicenseSchema,
  platforms: z.array(PlatformSchema).min(1),
  categories: z.array(z.string().min(1).max(48)).max(16).default([]),
  sources: z.array(OspSourceSchema).min(1).max(16),
  /** Stable artifact mirrors, useful when an upstream host rate-limits. */
  mirrors: z.array(UrlSchema).max(16).default([]),
  artifacts: z.array(ArtifactSchema).max(64).default([]),
  /** OSP ids this project supersedes or replaces. */
  replaces: z.array(OspIdSchema).max(16).default([]),
  maintainers: z
    .array(z.object({ name: z.string().max(120), url: UrlSchema.optional() }))
    .max(32)
    .default([]),
  updatedAt: IsoDateTimeSchema,
});
export type OspDocument = z.infer<typeof OspDocumentSchema>;

/** Bidirectional view: an OSP document next to its resolved Orbisyn record. */
export const OspResolutionSchema = z.object({
  uri: z.string().min(1).max(256),
  document: OspDocumentSchema.nullable(),
  app: AppRecordSchema.nullable(),
  repository: RepositoryRefSchema.nullable(),
});
export type OspResolution = z.infer<typeof OspResolutionSchema>;

/**
 * Identity rules live in `@orbisyn/core` (they reuse the same slug and
 * derivation logic as the rest of the domain). This package owns only the wire
 * format and the trivial URI builder below, so validation never depends on the
 * domain layer.
 */
export function ospUriForId(id: string): string {
  return `${OSP_URI_SCHEME}://${id}`;
}
