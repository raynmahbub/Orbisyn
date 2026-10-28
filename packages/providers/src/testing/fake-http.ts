import type { HttpPort, HttpRequest, HttpResponse } from '@orbisyn/core';

/**
 * Deterministic HTTP double.
 *
 * Provider tests must never touch the network: they assert on *mapping* logic
 * (upstream payload → domain record), and a live forge would make them slow,
 * flaky and rate-limited. Routes are registered as plain data and the fake
 * records every request so tests can assert on request shape too.
 */

export interface FakeRoute {
  readonly url: string | RegExp;
  readonly method?: HttpRequest['method'];
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly text?: string;
  /** Number of times this route may match before it starts failing with 500. */
  readonly times?: number;
}

export interface FakeHttp extends HttpPort {
  readonly requests: HttpRequest[];
  readonly calls: string[];
  /** Register (or replace) routes after construction. */
  route(entry: FakeRoute): void;
}

export function createFakeHttp(routes: readonly FakeRoute[] = []): FakeHttp {
  const registry: FakeRoute[] = [...routes];
  const requests: HttpRequest[] = [];
  const calls: string[] = [];
  const hits = new Map<FakeRoute, number>();

  return {
    requests,
    calls,

    route(entry: FakeRoute): void {
      registry.push(entry);
    },

    async request(request: HttpRequest): Promise<HttpResponse> {
      requests.push(request);
      calls.push(`${request.method ?? 'GET'} ${request.url}`);

      const method = request.method ?? 'GET';
      const match = registry.find((entry) => {
        if (entry.method !== undefined && entry.method !== method) return false;
        const used = hits.get(entry) ?? 0;
        if (entry.times !== undefined && used >= entry.times) return false;
        return typeof entry.url === 'string'
          ? entry.url === request.url
          : entry.url.test(request.url);
      });

      if (match === undefined) {
        return response(
          404,
          { message: `no fake route for ${method} ${request.url}` },
          request.url,
        );
      }

      hits.set(match, (hits.get(match) ?? 0) + 1);
      const status = match.status ?? 200;
      if (match.text !== undefined) {
        return textResponse(status, match.text, request.url, match.headers ?? {});
      }
      return response(status, match.body ?? {}, request.url, match.headers ?? {});
    },
  };
}

/** Convenience builders that keep test files readable. */
export function jsonRoute(
  url: string | RegExp,
  body: unknown,
  init: Partial<FakeRoute> = {},
): FakeRoute {
  return { url, body, ...init };
}

export function headerRoute(
  url: string | RegExp,
  headers: Record<string, string>,
  body: unknown = {},
): FakeRoute {
  return { url, headers, body };
}

function response(
  status: number,
  body: unknown,
  url: string,
  headers: Record<string, string> = {},
): HttpResponse {
  const payload = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json', ...headers },
    url,
    text: async () => payload,
    async json<T>(): Promise<T> {
      return JSON.parse(payload) as T;
    },
    arrayBuffer: async () => new TextEncoder().encode(payload).buffer as ArrayBuffer,
  };
}

function textResponse(
  status: number,
  body: string,
  url: string,
  headers: Record<string, string>,
): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    url,
    text: async () => body,
    async json<T>(): Promise<T> {
      throw new Error('response is not JSON');
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
  };
}
