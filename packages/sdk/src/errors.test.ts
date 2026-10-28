import { describe, expect, it } from 'vitest';
import { OrbisynApiError } from './errors.js';

/**
 * The error type is the SDK's public contract for failure handling: a caller
 * decides whether to retry, to surface a message, or to give up, entirely from
 * these accessors.
 */
function errorWith(status: number, code: OrbisynApiError['code'] = 'internal') {
  return new OrbisynApiError({
    status,
    code,
    message: 'boom',
    requestId: 'req-1',
  });
}

describe('OrbisynApiError', () => {
  it('carries the machine readable fields through', () => {
    const error = new OrbisynApiError({
      status: 429,
      code: 'rate-limited',
      message: 'slow down',
      requestId: 'req-9',
      details: { q: ['too short'] },
      retryAfterSeconds: 12,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OrbisynApiError');
    expect(error.message).toBe('slow down');
    expect(error.requestId).toBe('req-9');
    expect(error.details).toEqual({ q: ['too short'] });
    expect(error.retryAfterSeconds).toBe(12);
  });

  it('defaults the details to an empty object', () => {
    expect(errorWith(400).details).toEqual({});
    expect(errorWith(400).retryAfterSeconds).toBeUndefined();
  });

  it('treats transport failure, timeouts, throttling and server faults as retryable', () => {
    // Status 0 means the request never reached the gateway.
    expect(errorWith(0, 'upstream-unavailable').retryable).toBe(true);
    expect(errorWith(408, 'bad-request').retryable).toBe(true);
    expect(errorWith(429, 'rate-limited').retryable).toBe(true);
    expect(errorWith(503, 'upstream-unavailable').retryable).toBe(true);
    expect(errorWith(400, 'upstream-unavailable').retryable).toBe(true);
    expect(errorWith(422, 'rate-limited').retryable).toBe(true);
  });

  it('treats a rejected request as final', () => {
    expect(errorWith(400, 'validation-failed').retryable).toBe(false);
    expect(errorWith(404, 'not-found').retryable).toBe(false);
    expect(errorWith(409, 'conflict').retryable).toBe(false);
  });

  it('separates client mistakes from server faults', () => {
    expect(errorWith(400, 'validation-failed').isClientError).toBe(true);
    expect(errorWith(429, 'rate-limited').isClientError).toBe(true);
    expect(errorWith(500, 'internal').isClientError).toBe(false);
    expect(errorWith(0, 'upstream-unavailable').isClientError).toBe(false);
  });
});
