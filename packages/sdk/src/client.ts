import type {
  AppRecord,
  Collection,
  CollectionDraft,
  HealthStatus,
  OspResolution,
  ProviderDescriptor,
  Release,
  ResolveRequest,
  ResolveResponse,
  SearchQuery,
  SearchResponse,
  SyncRequest,
  SyncResponse,
  UpdateCheckResponse,
} from '@orbisyn/contracts';
import {
  ApiErrorSchema,
  AppRecordSchema,
  CollectionSchema,
  HealthStatusSchema,
  OspResolutionSchema,
  ProviderDescriptorSchema,
  ReleaseSchema,
  ResolveResponseSchema,
  SearchResponseSchema,
  SyncResponseSchema,
  UpdateCheckResponseSchema,
} from '@orbisyn/contracts';
import { z } from 'zod';
import { OrbisynApiError } from './errors.js';

/**
 * Orbisyn SDK.
 *
 * The client plugin authors build against. Two deliberate properties:
 *
 * - **Every response is validated** against the wire schema from
 *   `@orbisyn/contracts`, so a self-hosted gateway running a newer (or older)
 *   build fails loudly at the boundary instead of corrupting a plugin's state.
 * - **Every error is typed**: `OrbisynApiError` carries the gateway's error code
 *   plus the request id, which is what makes support conversations tractable.
 */

export interface OrbisynClientOptions {
  /** Gateway origin, e.g. `http://localhost:8787`. No trailing slash required. */
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Extra headers, e.g. an API token for a private deployment. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Injectable for tests and for correlating logs across a request chain. */
  readonly requestIdFactory?: () => string;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class OrbisynClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly headers: Readonly<Record<string, string>>;
  private readonly requestIdFactory: () => string;

  constructor(options: OrbisynClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('OrbisynClient requires a fetch implementation');
    }
    this.fetchImpl = fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.headers = options.headers ?? {};
    this.requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  }

  async health(options: RequestOptions = {}): Promise<HealthStatus> {
    return this.get('/health', HealthStatusSchema, options);
  }

  async providers(options: RequestOptions = {}): Promise<readonly ProviderDescriptor[]> {
    const parsed = await this.get(
      '/providers',
      z.object({ providers: z.array(ProviderDescriptorSchema) }),
      options,
    );
    return parsed.providers;
  }

  async resolve(request: ResolveRequest, options: RequestOptions = {}): Promise<ResolveResponse> {
    return this.post('/resolve', ResolveResponseSchema, request, options);
  }

  async search(query: SearchQuery, options: RequestOptions = {}): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
    for (const platform of query.platform ?? []) params.append('platform', platform);
    for (const license of query.license ?? []) params.append('license', license);
    for (const source of query.source ?? []) params.append('source', source);
    if (query.minHealthScore !== undefined)
      params.set('minHealthScore', String(query.minHealthScore));
    if (query.cursor !== undefined) params.set('cursor', query.cursor);

    return this.get(`/search?${params.toString()}`, SearchResponseSchema, options);
  }

  async app(id: string, options: RequestOptions = {}): Promise<AppRecord> {
    return this.get(`/apps/${encodeURIComponent(id)}`, AppRecordSchema, options);
  }

  async releases(
    id: string,
    limit = 10,
    options: RequestOptions = {},
  ): Promise<readonly Release[]> {
    const parsed = await this.get(
      `/apps/${encodeURIComponent(id)}/releases?limit=${limit}`,
      z.object({ releases: z.array(ReleaseSchema) }),
      options,
    );
    return parsed.releases;
  }

  async osp(id: string, options: RequestOptions = {}): Promise<OspResolution> {
    return this.get(`/osp/${encodeURIComponent(id)}`, OspResolutionSchema, options);
  }

  async checkUpdates(
    installed: readonly { appId: string; version: string | null }[],
    options: RequestOptions = {},
  ): Promise<UpdateCheckResponse> {
    return this.post('/updates/check', UpdateCheckResponseSchema, { installed }, options);
  }

  async collections(options: RequestOptions = {}): Promise<readonly Collection[]> {
    const parsed = await this.get(
      '/collections',
      z.object({ collections: z.array(CollectionSchema) }),
      options,
    );
    return parsed.collections;
  }

  async createCollection(
    draft: CollectionDraft,
    options: RequestOptions = {},
  ): Promise<Collection> {
    return this.post('/collections', CollectionSchema, draft, options);
  }

  async sync(request: SyncRequest, options: RequestOptions = {}): Promise<SyncResponse> {
    return this.post('/sync', SyncResponseSchema, request, options);
  }

  private async get<T>(path: string, schema: z.ZodType<T>, options: RequestOptions): Promise<T> {
    return this.request('GET', path, schema, undefined, options);
  }

  private async post<T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    return this.request('POST', path, schema, body, options);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    // An already-aborted signal never fires again, so it has to be checked
    // explicitly — otherwise a cancelled request would still be sent.
    if (options.signal?.aborted === true) {
      controller.abort();
    } else {
      options.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const requestId = this.requestIdFactory();

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'x-orbisyn-request-id': requestId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...this.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = text.length === 0 ? null : safeJsonParse(text);

      if (!response.ok) {
        const parsedError = ApiErrorSchema.safeParse(payload);
        if (parsedError.success) {
          throw new OrbisynApiError({
            status: response.status,
            code: parsedError.data.error.code,
            message: parsedError.data.error.message,
            requestId: parsedError.data.requestId,
            ...(parsedError.data.error.details === undefined
              ? {}
              : { details: parsedError.data.error.details }),
            ...(parsedError.data.error.retryAfterSeconds === undefined
              ? {}
              : { retryAfterSeconds: parsedError.data.error.retryAfterSeconds }),
          });
        }
        throw new OrbisynApiError({
          status: response.status,
          code: 'internal',
          message: `gateway returned ${response.status} without a structured error body`,
          requestId,
        });
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new OrbisynApiError({
          status: response.status,
          code: 'internal',
          message: `response from ${path} does not match the expected schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
          requestId,
          details: {
            response: parsed.error.issues.map(
              (issue) => `${issue.path.join('.')}: ${issue.message}`,
            ),
          },
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof OrbisynApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OrbisynApiError({
          status: 0,
          code: 'upstream-unavailable',
          message: `request to ${path} timed out after ${options.timeoutMs ?? this.timeoutMs}ms`,
          requestId,
        });
      }
      throw new OrbisynApiError({
        status: 0,
        code: 'upstream-unavailable',
        message: `cannot reach the gateway at ${this.baseUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
        requestId,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
