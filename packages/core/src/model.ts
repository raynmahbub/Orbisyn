/**
 * Domain model.
 *
 * These types are the vocabulary of Orbisyn: providers resolve *into* them and
 * clients render *from* them. They are deliberately plain TypeScript — no
 * decorators, no classes, no validation library — so the domain can be reasoned
 * about (and tested) in isolation.
 *
 * The wire representation lives in `@orbisyn/contracts`; a conformance test
 * there fails the build if the two ever drift apart.
 */

export type Platform = 'android' | 'ios' | 'macos' | 'windows' | 'linux' | 'web';

export type Architecture = 'universal' | 'arm64' | 'armv7' | 'x86_64' | 'x86' | 'wasm' | 'unknown';

export type SourceKind = 'github' | 'gitlab' | 'codeberg' | 'forgejo' | 'fdroid' | 'direct-url';

export type ReleaseChannel = 'stable' | 'beta' | 'rc' | 'nightly' | 'unknown';

export type ProviderStatus = 'stable' | 'beta' | 'experimental';

export interface ProviderCapabilities {
  readonly resolveApp: boolean;
  readonly listReleases: boolean;
  readonly listArtifacts: boolean;
  readonly verifyArtifacts: boolean;
  readonly repositoryStats: boolean;
  readonly projectGovernance: boolean;
  readonly authenticated: boolean;
}

export interface ProviderDescriptor {
  readonly kind: SourceKind;
  readonly label: string;
  readonly homepage: string;
  readonly capabilities: ProviderCapabilities;
  readonly examples: readonly string[];
  readonly status: ProviderStatus;
}

export interface RepositoryRef {
  readonly kind: SourceKind;
  readonly id: string;
  readonly host: string;
  readonly path: string;
  readonly webUrl: string;
  readonly defaultBranch?: string;
}

export interface Checksum {
  readonly algorithm: 'sha256' | 'sha512' | 'sha1' | 'md5';
  readonly value: string;
}

export interface ArtifactSignature {
  readonly scheme: 'minisign' | 'gpg' | 'cosign' | 'apk-v2' | 'notarized';
  readonly value?: string;
  readonly keyId?: string;
}

export interface Artifact {
  readonly url: string;
  readonly fileName?: string;
  readonly sizeBytes?: number;
  readonly contentType?: string;
  readonly platform: Platform;
  readonly architecture: Architecture;
  readonly checksum?: Checksum;
  readonly signature?: ArtifactSignature;
  readonly listingOnly: boolean;
}

export interface Release {
  readonly id: string;
  readonly appId: string;
  readonly source: SourceKind;
  readonly version: string;
  readonly tag?: string;
  readonly title?: string;
  readonly channel: ReleaseChannel;
  readonly isPrerelease: boolean;
  readonly publishedAt: string;
  readonly notes?: string;
  readonly notesUrl?: string;
  readonly sourceUrl: string;
  readonly artifacts: readonly Artifact[];
  readonly fetchedAt: string;
}

export interface HealthComponent {
  readonly id:
    | 'release-cadence'
    | 'maintenance'
    | 'community'
    | 'documentation'
    | 'governance'
    | 'licensing';
  readonly score: number;
  readonly weight: number;
  readonly rationale: string;
}

export interface RepositoryHealth {
  readonly score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'E';
  readonly components: readonly HealthComponent[];
  readonly computedAt: string;
  readonly inputs: {
    readonly stars: number | null;
    readonly forks: number | null;
    readonly openIssues: number | null;
    readonly contributors: number | null;
    readonly lastCommitAt: string | null;
    readonly releasesLastYear: number | null;
    readonly medianReleaseIntervalDays: number | null;
    readonly archived: boolean;
    readonly hasSecurityPolicy: boolean | null;
    readonly hasContributingGuide: boolean | null;
    readonly hasCi: boolean | null;
  };
}

export interface AppRecord {
  readonly id: string;
  readonly ospUri: string;
  readonly name: string;
  readonly summary?: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly iconUrl?: string;
  readonly screenshots: readonly string[];
  readonly license: string;
  readonly licenseFile?: string;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly platforms: readonly Platform[];
  readonly author?: string;
  readonly source: RepositoryRef;
  readonly alternateSources: readonly RepositoryRef[];
  readonly latestRelease?: Release;
  readonly latestVersion?: string;
  readonly health?: RepositoryHealth;
  readonly archived: boolean;
  readonly fetchedAt: string;
}

export interface AppSummary {
  readonly id: string;
  readonly ospUri: string;
  readonly name: string;
  readonly summary?: string;
  readonly iconUrl?: string;
  readonly license: string;
  readonly platforms: readonly Platform[];
  readonly categories: readonly string[];
  readonly archived: boolean;
  readonly fetchedAt: string;
  readonly latestVersion: string | null;
  readonly latestPublishedAt: string | null;
  readonly healthGrade: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  readonly sourceKind: SourceKind;
  readonly stars: number | null;
}

/**
 * Raw repository facts collected by a provider adapter. The adapter observes,
 * the domain scores — that is why telemetry and {@link RepositoryHealth} are
 * separate types.
 */
export interface RepositoryTelemetry {
  readonly stars: number | null;
  readonly forks: number | null;
  readonly openIssues: number | null;
  readonly contributors: number | null;
  readonly lastCommitAt: string | null;
  readonly releasesLastYear: number | null;
  readonly medianReleaseIntervalDays: number | null;
  readonly archived: boolean;
  readonly hasSecurityPolicy: boolean | null;
  readonly hasContributingGuide: boolean | null;
  readonly hasCi: boolean | null;
  readonly licenseSpdx: string | null;
}

export const EMPTY_TELEMETRY: RepositoryTelemetry = {
  stars: null,
  forks: null,
  openIssues: null,
  contributors: null,
  lastCommitAt: null,
  releasesLastYear: null,
  medianReleaseIntervalDays: null,
  archived: false,
  hasSecurityPolicy: null,
  hasContributingGuide: null,
  hasCi: null,
  licenseSpdx: null,
};

export interface ResolutionStep {
  readonly id: string;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail?: string;
  readonly durationMs: number;
}

export interface ProviderErrorReport {
  readonly provider: SourceKind;
  readonly code:
    | 'invalid-input'
    | 'not-found'
    | 'rate-limited'
    | 'unauthorized'
    | 'upstream-error'
    | 'unsupported'
    | 'network'
    | 'timeout'
    | 'parse-error';
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly status?: number;
}

export interface Diagnostics {
  readonly steps: readonly ResolutionStep[];
  readonly warnings: readonly string[];
  readonly durationMs: number;
  readonly cache: 'hit' | 'miss' | 'revalidate' | 'bypass';
  readonly providerErrors: readonly ProviderErrorReport[];
}

export interface ResolveRequest {
  readonly reference: string;
  readonly releases: number;
  readonly refresh: boolean;
}

export interface ResolveResponse {
  readonly app: AppRecord;
  readonly releases: readonly Release[];
  readonly diagnostics: Diagnostics;
}

export interface SearchQuery {
  readonly q: string;
  readonly platform?: readonly Platform[];
  readonly license?: readonly string[];
  readonly source?: readonly SourceKind[];
  readonly minHealthScore?: number;
  readonly limit: number;
  readonly cursor?: string;
}

export interface SearchResult {
  readonly items: readonly AppSummary[];
  readonly nextCursor: string | null;
  readonly tookMs: number;
  readonly queriedSources: readonly SourceKind[];
}

export interface Collection {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly appIds: readonly string[];
  readonly visibility: 'private' | 'unlisted' | 'public';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CollectionDraft {
  readonly name: string;
  readonly description?: string;
  readonly appIds?: readonly string[];
  readonly visibility?: Collection['visibility'];
}

export interface SyncOperation {
  readonly id: string;
  readonly entity: 'collection' | 'favorite' | 'setting' | 'history' | 'update-queue';
  readonly op: 'upsert' | 'delete';
  readonly entityId: string;
  readonly payload?: unknown;
  readonly updatedAt: string;
  readonly deviceId: string;
  readonly acknowledgedAt?: string;
}

export interface SyncConflict {
  readonly entityId: string;
  readonly localUpdatedAt: string;
  readonly remoteUpdatedAt: string;
  readonly resolution: 'local-wins' | 'remote-wins' | 'manual';
}

export interface SyncResult {
  readonly cursor: string;
  readonly applied: readonly string[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  readonly conflicts: readonly SyncConflict[];
  readonly collections: readonly Collection[];
}

export interface UpdateCandidate {
  readonly appId: string;
  readonly installedVersion: string | null;
  readonly latestVersion: string;
  readonly release: Release;
}
