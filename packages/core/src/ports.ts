/**
 * Ports (hexagonal architecture).
 *
 * The domain declares what it needs; adapters decide how it is provided. This is
 * what lets the same resolution pipeline run in a Node gateway, in a Web Worker
 * inside the browser, and in tests with deterministic fakes.
 */

import type {
  AppRecord,
  AppSummary,
  Collection,
  CollectionDraft,
  ProviderDescriptor,
  Release,
  RepositoryRef,
  RepositoryTelemetry,
  SearchQuery,
  SearchResult,
  SourceKind,
  SyncOperation,
} from './model.js';

/* -------------------------------------------------------------------------- */
/* Cross-cutting concerns                                                     */
/* -------------------------------------------------------------------------- */

export interface ClockPort {
  now(): Date;
  isoNow(): string;
}

export interface LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): LoggerPort;
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

export interface HttpRequest {
  readonly url: string;
  readonly method?: 'GET' | 'HEAD' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Optional body for POST requests; ignored for GET/HEAD. */
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HttpPort {
  request(request: HttpRequest): Promise<HttpResponse>;
}

/** Credentials a provider may attach to outbound requests. */
export interface CredentialStorePort {
  get(provider: SourceKind): { token: string } | null;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export interface CacheEntry<T> {
  readonly value: T;
  readonly storedAt: string;
  readonly expiresAt: string;
  /** Set when the entry outlived its TTL but is still serviceable offline. */
  readonly stale: boolean;
}

export interface CachePort {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Returns the previous entry, if any. */
  swrRevalidate?<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<CacheEntry<T>>;
}

export interface AppStorePort {
  saveApp(app: AppRecord, releases: readonly Release[]): Promise<void>;
  findApp(id: string): Promise<AppRecord | null>;
  findAppBySource(fingerprint: string): Promise<AppRecord | null>;
  search(query: SearchQuery): Promise<SearchResult>;
  listReleases(appId: string, limit: number): Promise<readonly Release[]>;
  saveCollection(draft: CollectionDraft & { id?: string }): Promise<Collection>;
  listCollections(): Promise<readonly Collection[]>;
  applySync(operations: readonly SyncOperation[]): Promise<{
    applied: readonly string[];
    rejected: readonly { id: string; reason: string }[];
    collections: readonly Collection[];
    cursor: string;
  }>;
}

/* -------------------------------------------------------------------------- */
/* Provider engine                                                            */
/* -------------------------------------------------------------------------- */

export interface ProviderContext {
  readonly http: HttpPort;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
  readonly credentials: CredentialStorePort;
  /** Milliseconds before an outbound request is abandoned. */
  readonly timeoutMs: number;
}

export interface ProviderResolution {
  readonly app: AppRecord;
  readonly releases: readonly Release[];
  /** Raw facts about the repository; the domain turns these into a health score. */
  readonly telemetry: RepositoryTelemetry;
}

/**
 * Every source of open-source software implements this interface. Adding a new
 * ecosystem (SourceHut, JSR, Snapshot, …) means adding an adapter — no changes
 * to the domain or the clients.
 */
export interface SourceProvider {
  readonly descriptor: ProviderDescriptor;
  /** Cheap, synchronous check: can this provider handle the reference? */
  supports(reference: string): boolean;
  /** Resolves the reference into a canonical record plus its release history. */
  resolve(
    reference: string,
    context: ProviderContext,
    options: ResolveOptions,
  ): Promise<ProviderResolution>;
}

export interface ResolveOptions {
  /** Maximum number of releases to include. */
  readonly releases: number;
  readonly refresh: boolean;
}

export interface ProviderRegistryPort {
  all(): readonly SourceProvider[];
  descriptors(): readonly ProviderDescriptor[];
  get(kind: SourceKind): SourceProvider | null;
  /** Ordered detection: first provider whose `supports` returns true wins. */
  detect(reference: string): SourceProvider | null;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

export function toSummary(app: AppRecord, stars: number | null): AppSummary {
  const latest = app.latestRelease;
  return {
    id: app.id,
    ospUri: app.ospUri,
    name: app.name,
    ...(app.summary === undefined ? {} : { summary: app.summary }),
    ...(app.iconUrl === undefined ? {} : { iconUrl: app.iconUrl }),
    license: app.license,
    platforms: app.platforms,
    categories: app.categories,
    archived: app.archived,
    fetchedAt: app.fetchedAt,
    latestVersion: app.latestVersion ?? latest?.version ?? null,
    latestPublishedAt: latest?.publishedAt ?? null,
    healthGrade: app.health?.grade ?? null,
    sourceKind: app.source.kind,
    stars,
  };
}

export function sourceOf(app: AppRecord): RepositoryRef {
  return app.source;
}
