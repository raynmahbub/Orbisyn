import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
  LoggerPort,
  ProviderContext,
  SourceProvider,
} from '@orbisyn/core';
import { createMemoryCache } from '@orbisyn/core';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { GatewayConfig } from '../config.js';
import { loadConfig } from '../config.js';

/**
 * Gateway test harness.
 *
 * Builds the *real* application — same plugins, same error handler, same routes
 * — with a scripted HTTP transport in place of `fetch`. The suite therefore
 * covers routing, validation, error mapping and caching without touching the
 * network, which is what makes it trustworthy on a laptop and in CI alike.
 */

export interface RecordedRequest {
  readonly url: string;
  readonly method?: string;
}

export interface HarnessOptions {
  readonly config?: Partial<GatewayConfig>;
  readonly routes?: ReadonlyArray<{
    readonly url: string | RegExp;
    readonly method?: HttpRequest['method'];
    readonly status?: number;
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
    readonly text?: string;
  }>;
  readonly providers?: readonly SourceProvider[];
  /** Serves a built client from `config.webRoot` when the test provides one. */
  readonly registerStatic?: boolean;
}

export interface Harness {
  readonly app: FastifyInstance;
  readonly requests: RecordedRequest[];
  readonly config: GatewayConfig;
  close(): Promise<void>;
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const requests: RecordedRequest[] = [];
  const http = createScriptedHttp(options.routes ?? [], requests);

  const config: GatewayConfig = {
    ...loadConfig({ NODE_ENV: 'test', GATEWAY_CORS_ORIGINS: '*', LOG_LEVEL: 'error' }),
    ...options.config,
  };

  const app = await buildApp({
    config,
    http,
    cache: createMemoryCache({
      clock: { now: () => new Date(), isoNow: () => new Date().toISOString() },
    }),
    ...(options.providers === undefined ? {} : { providers: options.providers }),
    logger: silentLogger(),
    registerStatic: options.registerStatic ?? false,
  });

  await app.ready();

  return {
    app,
    requests,
    config,
    close: () => app.close(),
  };
}

/** A provider whose behaviour is scripted per test, with no HTTP at all. */
export function stubProvider(
  provider: SourceProvider,
  behaviour: { resolve?: SourceProvider['resolve'] },
): SourceProvider {
  return {
    descriptor: provider.descriptor,
    supports: (reference) => provider.supports(reference),
    resolve: behaviour.resolve ?? provider.resolve.bind(provider),
  };
}

export function silentLogger(): LoggerPort {
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: noop, child: () => silentLogger() };
}

export function createScriptedHttp(
  routes: NonNullable<HarnessOptions['routes']>,
  recorded: RecordedRequest[] = [],
): HttpPort {
  return {
    async request(request: HttpRequest): Promise<HttpResponse> {
      recorded.push({ url: request.url, method: request.method ?? 'GET' });
      const route = [...routes].reverse().find((entry) => {
        if (entry.method !== undefined && entry.method !== (request.method ?? 'GET')) return false;
        return typeof entry.url === 'string'
          ? entry.url === request.url
          : entry.url.test(request.url);
      });

      if (route === undefined) {
        return buildResponse(
          404,
          { message: `no scripted route for ${request.url}` },
          request.url,
          {},
        );
      }

      const status = route.status ?? 200;
      if (route.text !== undefined) {
        return buildResponse(status, route.text, request.url, route.headers ?? {}, true);
      }
      return buildResponse(status, route.body ?? {}, request.url, route.headers ?? {});
    },
  };
}

function buildResponse(
  status: number,
  body: unknown,
  url: string,
  headers: Record<string, string>,
  raw = false,
): HttpResponse {
  const payload = raw ? String(body) : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': raw ? 'text/plain' : 'application/json', ...headers },
    url,
    text: async () => payload,
    json: async <T>() => JSON.parse(payload) as T,
    arrayBuffer: async () => new TextEncoder().encode(payload).buffer as ArrayBuffer,
  };
}

export type { ProviderContext };
