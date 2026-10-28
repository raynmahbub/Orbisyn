import type { DomainError } from '@orbisyn/core';
import { isDomainError } from '@orbisyn/core';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * Error translation.
 *
 * The API speaks one error shape. Two families map onto it:
 *
 * - `ZodError` — a request did not match its schema; every issue is returned so
 *   a client can point at the offending field.
 * - `DomainError` — the domain refused for a reason it already classified
 *   (`source-not-found`, `source-rate-limited`, …). Upstream retry hints are
 *   preserved as `retryAfterSeconds`.
 */

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, string[]>;
    readonly retryAfterSeconds?: number;
  };
  readonly requestId: string;
  readonly timestamp: string;
}

const STATUS_BY_DOMAIN_CODE: Readonly<Record<DomainError['code'], number>> = {
  'invalid-reference': 400,
  'unsupported-source': 400,
  'source-not-found': 404,
  'source-rate-limited': 429,
  'source-unauthorized': 401,
  'source-protocol-error': 502,
  'invalid-release': 422,
  'identity-collision': 409,
  'invariant-violated': 500,
};

const API_CODE_BY_DOMAIN_CODE: Readonly<Record<DomainError['code'], string>> = {
  'invalid-reference': 'bad-request',
  'unsupported-source': 'unsupported-source',
  'source-not-found': 'not-found',
  'source-rate-limited': 'rate-limited',
  'source-unauthorized': 'unauthorized',
  'source-protocol-error': 'upstream-unavailable',
  'invalid-release': 'validation-failed',
  'identity-collision': 'conflict',
  'invariant-violated': 'internal',
};

export function statusForError(error: unknown): number {
  // A schema failure is the client's mistake, and saying so with a 400 is part
  // of the API contract, not an implementation detail.
  if (error instanceof ZodError) return 400;
  if (isDomainError(error)) return STATUS_BY_DOMAIN_CODE[error.code];
  return 500;
}

export function codeForError(error: unknown): string {
  if (isDomainError(error)) return API_CODE_BY_DOMAIN_CODE[error.code];
  return 'internal';
}

export function envelopeFor(error: unknown, requestId: string): ErrorEnvelope {
  const timestamp = new Date().toISOString();

  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length === 0 ? '_' : issue.path.join('.');
      details[key] = [...(details[key] ?? []), issue.message];
    }
    return {
      error: { code: 'validation-failed', message: 'request validation failed', details },
      requestId,
      timestamp,
    };
  }

  if (isDomainError(error)) {
    return {
      error: {
        code: API_CODE_BY_DOMAIN_CODE[error.code],
        message: error.message,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      },
      requestId,
      timestamp,
    };
  }

  const message = error instanceof Error ? error.message : 'unexpected gateway failure';
  return { error: { code: 'internal', message }, requestId, timestamp };
}

export interface NotFoundOptions {
  /**
   * When the web client is mounted, anything outside the API namespace is a
   * client-side route: a hard refresh on `/apps/:id` must return the shell, not
   * a JSON 404. API paths always answer with the error envelope.
   */
  readonly client?: ClientDelivery | null;
}

export interface ClientDelivery {
  /** Sends the built `index.html`, letting the client router take over. */
  sendShell(reply: FastifyReplyLike): unknown;
}

export interface FastifyReplyLike {
  sendFile(path: string): unknown;
}

export function registerErrorHandler(app: FastifyInstance, options: NotFoundOptions = {}): void {
  app.setNotFoundHandler((request, reply) => {
    const client = options.client;
    if (
      client !== null &&
      client !== undefined &&
      request.method === 'GET' &&
      !request.url.startsWith('/api')
    ) {
      return client.sendShell(reply);
    }
    return reply.status(404).send({
      error: {
        code: 'not-found',
        message: `no route matches ${request.method} ${request.url}`,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = statusForError(error);
    const envelope = envelopeFor(error, request.id);

    if (status >= 500) {
      // Log with the request id so a user's screenshot leads straight to a log line.
      request.log.error({ err: error, requestId: request.id }, 'request failed');
    } else {
      request.log.info(
        { err: error.message, code: envelope.error.code, requestId: request.id },
        'request rejected',
      );
    }

    if (envelope.error.retryAfterSeconds !== undefined && status === 429) {
      void reply.header('retry-after', String(envelope.error.retryAfterSeconds));
    }

    return reply.status(status).send(envelope);
  });
}
