import { z } from 'zod';
import {
  ArchitectureSchema,
  ChecksumSchema,
  IsoDateTimeSchema,
  OspIdSchema,
  PlatformSchema,
  UrlSchema,
} from './primitive.js';

/**
 * Provider descriptors: who we can ingest from, and what each endpoint
 * is capable of. The capability set drives client behaviour — the UI never
 * special-cases a provider by name.
 */

export const SourceKindSchema = z.enum([
  'github',
  'gitlab',
  'codeberg',
  'forgejo',
  'fdroid',
  'direct-url',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ProviderCapabilitiesSchema = z.object({
  /** Resolves a repository/package into a canonical app record. */
  resolveApp: z.boolean(),
  /** Enumerates releases with machine readable version information. */
  listReleases: z.boolean(),
  /** Enumerates the artifacts attached to a single release. */
  listArtifacts: z.boolean(),
  /** Exposes a verifiable checksum or detached signature. */
  verifyArtifacts: z.boolean(),
  /** Reports star/fork/issue statistics. */
  repositoryStats: z.boolean(),
  /** Publishes a machine readable repository health signal (CI, policies). */
  projectGovernance: z.boolean(),
  /** Supports authenticated requests to lift anonymous rate limits. */
  authenticated: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const RepositoryRefSchema = z.object({
  kind: SourceKindSchema,
  id: z.string().min(1).max(256).describe('provider-scoped stable identifier'),
  host: z.string().min(1).max(253),
  path: z.string().min(1).max(512).describe('host-relative project path, e.g. "bitwarden/android"'),
  webUrl: UrlSchema,
  defaultBranch: z.string().max(128).optional(),
});
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;

export const ArtifactSchema = z.object({
  url: UrlSchema,
  fileName: z.string().min(1).max(256).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  contentType: z.string().max(128).optional(),
  platform: PlatformSchema,
  architecture: ArchitectureSchema.default('unknown'),
  checksum: ChecksumSchema.optional(),
  signature: z
    .object({
      scheme: z.enum(['minisign', 'gpg', 'cosign', 'apk-v2', 'notarized']),
      value: z.string().max(2048).optional(),
      keyId: z.string().max(128).optional(),
    })
    .optional(),
  /** True when the artifact is a store listing rather than a downloadable file. */
  listingOnly: z.boolean().default(false),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ReleaseChannelSchema = z.enum(['stable', 'beta', 'rc', 'nightly', 'unknown']);
export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ReleaseSchema = z.object({
  id: z.string().min(1).max(256),
  appId: OspIdSchema,
  source: SourceKindSchema,
  /** Version exactly as the upstream published it. */
  version: z.string().min(1).max(128),
  tag: z.string().max(128).optional(),
  title: z.string().max(256).optional(),
  channel: ReleaseChannelSchema,
  isPrerelease: z.boolean(),
  publishedAt: IsoDateTimeSchema,
  notes: z.string().max(20_000).optional(),
  notesUrl: UrlSchema.optional(),
  sourceUrl: UrlSchema,
  artifacts: z.array(ArtifactSchema),
  fetchedAt: IsoDateTimeSchema,
});
export type Release = z.infer<typeof ReleaseSchema>;

/** Machine readable provider catalogue entry, served at `GET /providers`. */
export const ProviderDescriptorSchema = z.object({
  kind: SourceKindSchema,
  label: z.string().min(1).max(64),
  homepage: UrlSchema,
  capabilities: ProviderCapabilitiesSchema,
  examples: z.array(z.string()).max(8),
  status: z.enum(['stable', 'beta', 'experimental']),
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

/** Structured failure raised by a provider adapter. */
export const ProviderErrorSchema = z.object({
  provider: SourceKindSchema,
  code: z.enum([
    'invalid-input',
    'not-found',
    'rate-limited',
    'unauthorized',
    'upstream-error',
    'unsupported',
    'network',
    'timeout',
    'parse-error',
  ]),
  message: z.string().max(1024),
  retryAfterSeconds: z.number().int().min(0).optional(),
  status: z.number().int().min(100).max(599).optional(),
});
export type ProviderErrorShape = z.infer<typeof ProviderErrorSchema>;
