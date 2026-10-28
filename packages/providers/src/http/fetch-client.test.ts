import { DomainError } from '@orbisyn/core';
import { describe, expect, it, vi } from 'vitest';
import { createFetchHttpClient } from './fetch-client.js';

/**
 * The transport sits between Orbisyn and every upstream forge, so its failure
 * behaviour is part of the product: bounded retries, hard timeouts, no tokens in
 * logs, and one error type for everything that can go wrong.
 */
function clientWith(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  overrides: Partial<Parameters<typeof createFetchHttpClient>[0]> = {},
) {
  return createFetchHttpClient({
    userAgent: 'Orbisyn/test',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    maxRetries: 1,
    maxRetryDelayMs: 1,
    ...overrides,
  });
}

describe('createFetchHttpClient', () => {
  it('returns a normalised response and preserves the final url', async () => {
    const http = clientWith(async () => {
      const response = new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: 'https://api.github.com/repos/example/app' });
      return response;
    });

    const response = await http.request({ url: 'https://api.github.com/repos/example/app' });
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.url).toContain('/repos/example/app');
    await expect(response.json<{ ok: boolean }>()).resolves.toEqual({ ok: true });
  });

  it('sends a user agent and the caller headers', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
    );
    const http = clientWith(fetchImpl);

    await http.request({ url: 'https://example.org/a', headers: { authorization: 'Bearer t' } });
    const [call] = fetchImpl.mock.calls;
    const headers = (call?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['user-agent']).toBe('Orbisyn/test');
    expect(headers.authorization).toBe('Bearer t');
    expect(call?.[1]?.redirect).toBe('follow');
  });

  it('retries a retryable status and returns the eventual response', async () => {
    let calls = 0;
    const http = clientWith(async () => {
      calls += 1;
      return calls === 1
        ? new Response('busy', { status: 503 })
        : new Response('{"ok":1}', { status: 200 });
    });

    const response = await http.request({ url: 'https://example.org/a' });
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('honours Retry-After instead of the exponential backoff', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: () => logger,
    };
    let calls = 0;
    const http = clientWith(
      async () => {
        calls += 1;
        return calls === 1
          ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } })
          : new Response('{}', { status: 200 });
      },
      { logger },
    );

    const response = await http.request({ url: 'https://example.org/a?token=secret' });
    expect(response.status).toBe(200);
    // The delay came from the header, and the token never reached the log.
    expect(logger.debug).toHaveBeenCalledWith(
      'retrying upstream request',
      expect.objectContaining({ status: 429, url: 'https://example.org/a?token=redacted' }),
    );
  });

  it('does not retry a status the upstream will keep returning', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }));
    const http = clientWith(fetchImpl, { maxRetries: 3 });

    const response = await http.request({ url: 'https://example.org/missing' });
    expect(response.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('turns a timeout into a domain error naming the host', async () => {
    const http = clientWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
      { defaultTimeoutMs: 20, maxRetries: 0 },
    );

    const error = await http
      .request({ url: 'https://api.github.com/repos/x/y' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('source-protocol-error');
    expect((error as DomainError).message).toContain('api.github.com timed out after 20ms');
  });

  it('maps a transport failure to a retryable protocol error', async () => {
    const http = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    const error = (await http
      .request({ url: 'https://codeberg.org/api/v1/x' })
      .catch((e: unknown) => e)) as DomainError;
    expect(error.code).toBe('source-protocol-error');
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('network failure contacting codeberg.org');
  });

  it('reports cancellation by the caller distinctly from a timeout', async () => {
    const controller = new AbortController();
    const http = clientWith(
      (_url, init) => {
        // The caller's own signal is already aborted, so the transport must
        // surface a cancellation rather than retry or report a timeout.
        controller.abort();
        return new Promise<Response>((_resolve, reject) => {
          const abort = (): void => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          };
          if (init?.signal?.aborted === true) abort();
          else init?.signal?.addEventListener('abort', abort);
        });
      },
      { maxRetries: 0 },
    );

    const error = (await http
      .request({ url: 'https://example.org/a', signal: controller.signal })
      .catch((e: unknown) => e)) as DomainError;
    expect(error.message).toContain('request cancelled by the caller');
  });

  it('reports a body that is not JSON as a protocol error naming the host', async () => {
    const http = clientWith(async () => new Response('<html>nope</html>', { status: 200 }));
    const response = await http.request({ url: 'https://example.org/a' });

    await expect(response.json()).rejects.toThrow(/Unexpected response from "example.org"/);
  });

  it('reads the body once, as the port documents', async () => {
    const http = clientWith(async () => new Response('plain text', { status: 200 }));
    const response = await http.request({ url: 'https://example.org/a' });
    await expect(response.text()).resolves.toBe('plain text');
  });
});
