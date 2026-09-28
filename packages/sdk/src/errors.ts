import type { ApiErrorCode } from '@orbisyn/contracts';

export interface OrbisynApiErrorOptions {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly details?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;
}

/**
 * Every failure from the gateway arrives as this error, carrying the machine
 * readable code and the request id the server logged. `retryable` encodes the
 * only question a caller usually has.
 */
export class OrbisynApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string;
  readonly details: Record<string, string[]>;
  readonly retryAfterSeconds: number | undefined;

  constructor(options: OrbisynApiErrorOptions) {
    super(options.message);
    this.name = 'OrbisynApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get retryable(): boolean {
    return (
      this.status === 0 ||
      this.status === 408 ||
      this.status === 429 ||
      this.status >= 500 ||
      this.code === 'upstream-unavailable' ||
      this.code === 'rate-limited'
    );
  }

  /** Whether retrying with corrected input could succeed. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}
