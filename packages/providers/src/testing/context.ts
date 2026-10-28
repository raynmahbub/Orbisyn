import type { CredentialStorePort, HttpPort, HttpRequest, ProviderContext } from '@orbisyn/core';
import { createConsoleLogger, createFixedClock, EMPTY_TELEMETRY } from '@orbisyn/core';

/**
 * Provider context factory for tests.
 *
 * Fixes the clock, silences logging and — by default — provides *no* credentials
 * so the anonymous rate-limit path is the one under test. Pass a token to
 * exercise authenticated behaviour.
 */
export interface TestContextOptions {
  readonly token?: string | null;
  readonly timeoutMs?: number;
  readonly now?: string;
}

export function createTestContext(
  http: HttpPort,
  options: TestContextOptions = {},
): ProviderContext {
  const token = options.token ?? null;
  const credentials: CredentialStorePort = {
    get: () => (token === null ? null : { token }),
  };

  return {
    http,
    clock: createFixedClock(options.now ?? '2024-06-01T00:00:00.000Z'),
    logger: createConsoleLogger({ scope: 'test' }, 'error'),
    credentials,
    timeoutMs: options.timeoutMs ?? 1_000,
  };
}

/** Assertion helper: which upstream endpoints did a resolution touch? */
export function requestedPaths(requests: readonly HttpRequest[]): readonly string[] {
  return requests.map((request) => new URL(request.url).pathname);
}

export { EMPTY_TELEMETRY };
