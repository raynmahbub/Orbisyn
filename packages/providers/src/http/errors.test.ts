import type { HttpResponse } from '@orbisyn/core';
import { describe, expect, it } from 'vitest';
import {
  ensureSuccess,
  ensureSuccessOrNull,
  lastPageFromLinkHeader,
  parseRetryAfter,
  readTotalCountHeader,
} from './errors.js';

function response(
  status: number,
  headers: Record<string, string> = {},
  url = 'https://api.example.test/x',
): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    url,
    text: async () => '',
    json: async <T>() => ({}) as T,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('ensureSuccess', () => {
  it('passes successful responses through', () => {
    expect(() => ensureSuccess(response(200), 'github')).not.toThrow();
  });

  it('maps 404 to a not-found domain error', () => {
    expect(() => ensureSuccess(response(404), 'github')).toThrowError(/404/);
  });

  it('maps 401 to an actionable authentication error', () => {
    expect(() => ensureSuccess(response(401), 'gitlab')).toThrowError(/credentials/);
  });

  it('recognises GitHub rate limiting hidden behind a 403', () => {
    try {
      ensureSuccess(
        response(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }),
        'github',
      );
      throw new Error('expected a rate limit error');
    } catch (error) {
      expect((error as { code: string }).code).toBe('source-rate-limited');
      expect((error as { retryable: boolean }).retryable).toBe(true);
    }
  });

  it('honours Retry-After on 429', () => {
    try {
      ensureSuccess(response(429, { 'retry-after': '120' }), 'gitea');
      throw new Error('expected a rate limit error');
    } catch (error) {
      expect((error as { retryAfterSeconds: number }).retryAfterSeconds).toBe(120);
    }
  });

  it('treats 5xx as a retryable upstream failure', () => {
    expect(() => ensureSuccess(response(503), 'codeberg')).toThrowError(/upstream error 503/);
  });
});

describe('ensureSuccessOrNull', () => {
  it('returns null for optional endpoints that are missing', async () => {
    expect(await ensureSuccessOrNull(response(404), 'github')).toBeNull();
    expect(await ensureSuccessOrNull(response(200), 'github')).not.toBeNull();
  });
});

describe('lastPageFromLinkHeader', () => {
  it('extracts the total page count GitHub encodes in Link headers', () => {
    const header =
      '<https://api.github.com/repositories/1/contributors?per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/1/contributors?per_page=1&page=57>; rel="last"';
    expect(lastPageFromLinkHeader(header)).toBe(57);
  });

  it('returns null when there is no last page', () => {
    expect(lastPageFromLinkHeader(undefined)).toBeNull();
    expect(lastPageFromLinkHeader('<https://api.github.com/x>; rel="next"')).toBeNull();
  });
});

describe('readTotalCountHeader', () => {
  it('reads the various spellings of a total count', () => {
    expect(readTotalCountHeader({ 'x-total': '12' })).toBe(12);
    expect(readTotalCountHeader({ 'x-total-count': '7' })).toBe(7);
    expect(readTotalCountHeader({})).toBeNull();
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds and HTTP dates', () => {
    expect(parseRetryAfter('30')).toBe(30);
    const future = new Date(Date.now() + 10_000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThanOrEqual(8);
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});
