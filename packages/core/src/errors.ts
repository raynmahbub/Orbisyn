/**
 * Domain errors.
 *
 * The domain never throws bare `Error`: every failure carries a machine
 * readable code so the presentation layer can decide between a retry, a
 * degraded state or a hard failure without string matching.
 */

export type DomainErrorCode =
  | 'invalid-reference'
  | 'unsupported-source'
  | 'source-not-found'
  | 'source-rate-limited'
  | 'source-unauthorized'
  | 'source-protocol-error'
  | 'invalid-release'
  | 'identity-collision'
  | 'invariant-violated';

export interface DomainErrorOptions {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly retryable?: boolean;
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(options: DomainErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'DomainError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.context = options.context ?? {};
  }

  static invalidReference(reference: string, reason: string): DomainError {
    return new DomainError({
      code: 'invalid-reference',
      message: `Cannot interpret "${truncate(reference, 120)}": ${reason}`,
      context: { reference },
    });
  }

  static unsupportedSource(source: string): DomainError {
    return new DomainError({
      code: 'unsupported-source',
      message: `No source provider is registered for "${truncate(source, 80)}"`,
      context: { source },
    });
  }

  static notFound(message: string, context?: Record<string, unknown>): DomainError {
    return new DomainError({ code: 'source-not-found', message, ...(context ? { context } : {}) });
  }

  static rateLimited(provider: string, retryAfterSeconds?: number): DomainError {
    return new DomainError({
      code: 'source-rate-limited',
      message: `Upstream provider "${provider}" is rate limiting this client`,
      retryable: true,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      context: { provider },
    });
  }

  static unauthorized(provider: string, hint?: string): DomainError {
    return new DomainError({
      code: 'source-unauthorized',
      message: hint ?? `Authentication for "${provider}" is missing, invalid or expired`,
      context: { provider },
    });
  }

  static protocol(provider: string, detail: string, cause?: unknown): DomainError {
    return new DomainError({
      code: 'source-protocol-error',
      message: `Unexpected response from "${provider}": ${detail}`,
      retryable: true,
      ...(cause === undefined ? {} : { cause }),
      context: { provider },
    });
  }

  static invalidRelease(version: string, reason: string): DomainError {
    return new DomainError({
      code: 'invalid-release',
      message: `Release "${truncate(version, 64)}" is not usable: ${reason}`,
      context: { version },
    });
  }

  static invariant(message: string, context?: Record<string, unknown>): DomainError {
    return new DomainError({
      code: 'invariant-violated',
      message,
      ...(context ? { context } : {}),
    });
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
