import type { HttpPort, HttpRequest, HttpResponse, LoggerPort } from '@orbisyn/core';
import { DomainError } from '@orbisyn/core';

/**
 * Isomorphic HTTP client.
 *
 * Built on the global `fetch` (Node 22, every browser, workers) so the exact
 * same provider code runs in the gateway, in the PWA and in tests. It adds the
 * four behaviours the upstream APIs require us to get right:
 *
 * 1. a descriptive `User-Agent` (GitHub rejects requests without one),
 * 2. hard timeouts via `AbortController`,
 * 3. bounded retries with exponential backoff and jitter, honouring
 *    `Retry-After` when a forge asks us to slow down,
 * 4. normalisation of transport and status failures into `DomainError`.
 */

export interface FetchClientOptions {
  readonly userAgent: string;
  readonly defaultTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly maxRetryDelayMs?: number;
  readonly logger?: LoggerPort;
  /** Injectable for tests; defaults to the global implementation. */
  readonly fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createFetchHttpClient(options: FetchClientOptions): HttpPort {
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
  const maxRetries = options.maxRetries ?? 2;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 4_000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw DomainError.invariant('no fetch implementation available in this runtime');
  }

  return {
    async request(request: HttpRequest): Promise<HttpResponse> {
      const method = request.method ?? 'GET';
      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
      let attempt = 0;
      let lastError: unknown;

      while (attempt <= maxRetries) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const onExternalAbort = (): void => controller.abort();
        request.signal?.addEventListener('abort', onExternalAbort, { once: true });

        try {
          const response = await fetchImpl(request.url, {
            method,
            headers: {
              'user-agent': options.userAgent,
              accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
              ...request.headers,
            },
            ...(request.body === undefined ? {} : { body: request.body }),
            signal: controller.signal,
            redirect: 'follow',
          });

          if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
            const delay = retryDelay(response, attempt, maxRetryDelayMs);
            options.logger?.debug('retrying upstream request', {
              url: redact(request.url),
              status: response.status,
              delayMs: delay,
              attempt: attempt + 1,
            });
            await sleep(delay);
            attempt += 1;
            continue;
          }

          const headers = headersToObject(response.headers);
          const finalUrl = response.url.length > 0 ? response.url : request.url;
          return buildResponse(response, headers, finalUrl);
        } catch (error) {
          lastError = error;
          const aborted = error instanceof Error && error.name === 'AbortError';
          if (aborted && request.signal?.aborted === true) {
            throw new DomainError({
              code: 'source-protocol-error',
              message: 'request cancelled by the caller',
              cause: error,
            });
          }
          if (aborted) {
            throw new DomainError({
              code: 'source-protocol-error',
              message: `upstream request to ${hostOf(request.url)} timed out after ${timeoutMs}ms`,
              retryable: true,
              cause: error,
            });
          }
          if (attempt < maxRetries) {
            await sleep(backoff(attempt, maxRetryDelayMs));
            attempt += 1;
            continue;
          }
          throw new DomainError({
            code: 'source-protocol-error',
            message: `network failure contacting ${hostOf(request.url)}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
            retryable: true,
            cause: error,
          });
        } finally {
          clearTimeout(timeout);
          request.signal?.removeEventListener('abort', onExternalAbort);
        }
      }

      throw new DomainError({
        code: 'source-protocol-error',
        message: `exhausted retries contacting ${hostOf(request.url)}`,
        retryable: true,
        ...(lastError === undefined ? {} : { cause: lastError }),
      });
    },
  };
}

function buildResponse(
  response: Response,
  headers: Record<string, string>,
  url: string,
): HttpResponse {
  const body = response.body;

  return {
    status: response.status,
    ok: response.ok,
    headers,
    url,
    async text(): Promise<string> {
      return readBody(body, (stream) => new Response(stream).text());
    },
    async json<T = unknown>(): Promise<T> {
      const raw = await readBody(body, (stream) => new Response(stream).text());
      try {
        return JSON.parse(raw) as T;
      } catch (error) {
        throw DomainError.protocol(hostOf(url), 'response was not valid JSON', error);
      }
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return readBody(body, (stream) => new Response(stream).arrayBuffer());
    },
  } as HttpResponse;

  // `Response.body` is single-use; reading it through a fresh Response keeps the
  // port ergonomic without buffering the payload up-front.
  function readBody<T>(
    stream: ReadableStream<Uint8Array> | null,
    reader: (stream: ReadableStream<Uint8Array>) => Promise<T>,
  ): Promise<T> {
    if (stream === null) return reader(new Response(null).body as ReadableStream<Uint8Array>);
    return reader(stream as ReadableStream<Uint8Array>);
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function retryDelay(response: Response, attempt: number, maxDelayMs: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, maxDelayMs);
    }
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(0, date - Date.now()), maxDelayMs);
    }
  }
  return backoff(attempt, maxDelayMs);
}

function backoff(attempt: number, maxDelayMs: number): number {
  const base = Math.min(2 ** attempt * 250, maxDelayMs);
  // Full jitter prevents a fleet of clients from synchronising their retries.
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function redact(url: string): string {
  // Tokens belong in headers, never in URLs — but scrub anyway before logging.
  return url.replace(/([?&](?:token|access_token|private_token|key)=)[^&]+/gi, '$1redacted');
}
