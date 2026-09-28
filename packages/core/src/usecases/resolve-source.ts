import { DomainError, isDomainError } from '../errors.js';
import { assessHealth } from '../health.js';
import type {
  AppRecord,
  Diagnostics,
  ProviderErrorReport,
  Release,
  RepositoryHealth,
  RepositoryTelemetry,
  ResolutionStep,
  ResolveRequest,
  ResolveResponse,
} from '../model.js';
import { EMPTY_TELEMETRY } from '../model.js';
import type {
  CachePort,
  ClockPort,
  CredentialStorePort,
  HttpPort,
  LoggerPort,
  ProviderContext,
  ProviderRegistryPort,
} from '../ports.js';
import { toSemver } from '../version.js';

/**
 * ResolveSource — the pipeline that turns any reference into a canonical record.
 *
 *   1. detect   : pick the provider that claims the reference
 *   2. cache    : serve a warm entry unless the caller demanded fresh data
 *   3. resolve  : query the upstream source
 *   4. assess   : convert raw telemetry into a health score
 *   5. degrade  : if the upstream fails, serve the stale entry instead of erroring
 *
 * Every stage is recorded in `diagnostics` so a client can explain *why* it is
 * showing what it shows — the difference between a black box and a tool people
 * trust.
 */

export interface ResolveSourceDeps {
  readonly registry: ProviderRegistryPort;
  readonly cache: CachePort;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
  readonly http: HttpPort;
  readonly credentials: CredentialStorePort;
  readonly cacheTtlSeconds: number;
  readonly httpTimeoutMs: number;
}

export class ResolveSourceUseCase {
  constructor(private readonly deps: ResolveSourceDeps) {}

  async execute(request: ResolveRequest): Promise<ResolveResponse> {
    const startedAt = this.deps.clock.now().getTime();
    const steps: ResolutionStep[] = [];
    const warnings: string[] = [];
    const providerErrors: ProviderErrorReport[] = [];
    const reference = request.reference.trim();
    const cacheKey = this.cacheKey(reference, request.releases);

    const provider = this.deps.registry.detect(reference);
    if (provider === null) {
      throw DomainError.unsupportedSource(reference);
    }
    steps.push({
      id: 'detect-provider',
      status: 'ok',
      detail: `${provider.descriptor.kind} (${provider.descriptor.status})`,
      durationMs: this.deps.clock.now().getTime() - startedAt,
    });

    const cached = await this.deps.cache.get<{ app: AppRecord; releases: readonly Release[] }>(
      cacheKey,
    );
    if (!request.refresh && cached !== null && !cached.stale) {
      const diagnostics = this.diagnostics(steps, warnings, startedAt, 'hit', providerErrors);
      return { app: cached.value.app, releases: cached.value.releases, diagnostics };
    }

    const context = this.providerContext();
    let resolution: {
      app: AppRecord;
      releases: readonly Release[];
      telemetry: RepositoryTelemetry;
    };

    const resolveStarted = this.deps.clock.now().getTime();
    try {
      const result = await provider.resolve(reference, context, {
        releases: request.releases,
        refresh: request.refresh,
      });
      resolution = { app: result.app, releases: result.releases, telemetry: result.telemetry };
      steps.push({
        id: 'provider-resolve',
        status: 'ok',
        detail: `${result.releases.length} release(s), ${result.app.platforms.length} platform(s)`,
        durationMs: this.deps.clock.now().getTime() - resolveStarted,
      });
    } catch (error) {
      const report = toProviderError(provider.descriptor.kind, error);
      providerErrors.push(report);
      steps.push({
        id: 'provider-resolve',
        status: 'failed',
        detail: `${report.code}: ${report.message}`,
        durationMs: this.deps.clock.now().getTime() - resolveStarted,
      });

      if (cached !== null) {
        warnings.push(
          `served cached data from ${cached.storedAt} because the upstream source failed: ${report.message}`,
        );
        return {
          app: cached.value.app,
          releases: cached.value.releases,
          diagnostics: this.diagnostics(steps, warnings, startedAt, 'revalidate', providerErrors),
        };
      }
      throw error;
    }

    const health = this.assessHealth(resolution.telemetry);
    steps.push({
      id: 'assess-health',
      status: 'ok',
      detail: `score ${health.score} (${health.grade})`,
      durationMs: this.deps.clock.now().getTime() - resolveStarted,
    });

    // `latestVersion` is a *semantic* version for clients to compare; upstream
    // tags (`v1.2.0`, `release-2.1`) are kept verbatim on the release itself.
    const candidateVersion = resolution.app.latestVersion ?? resolution.releases[0]?.version;
    const latestVersion = candidateVersion === undefined ? undefined : toSemver(candidateVersion);

    const app: AppRecord = {
      ...resolution.app,
      health,
      ...(latestVersion === undefined ? { latestVersion: undefined } : { latestVersion }),
    };
    const releases = resolution.releases;

    await this.deps.cache.set(cacheKey, { app, releases }, this.deps.cacheTtlSeconds);

    return {
      app,
      releases,
      diagnostics: this.diagnostics(
        steps,
        warnings,
        startedAt,
        cached === null ? 'miss' : 'revalidate',
        providerErrors,
      ),
    };
  }

  private providerContext(): ProviderContext {
    return {
      http: this.deps.http,
      clock: this.deps.clock,
      logger: this.deps.logger,
      credentials: this.deps.credentials,
      timeoutMs: this.deps.httpTimeoutMs,
    };
  }

  private assessHealth(telemetry: RepositoryTelemetry): RepositoryHealth {
    const assessment = assessHealth(
      {
        ...EMPTY_TELEMETRY,
        ...telemetry,
        lastCommitAt: telemetry.lastCommitAt === null ? null : new Date(telemetry.lastCommitAt),
      },
      { now: this.deps.clock.now() },
    );
    return {
      score: assessment.score,
      grade: assessment.grade,
      components: [...assessment.components],
      computedAt: assessment.computedAt.toISOString(),
      inputs: {
        ...assessment.inputs,
        lastCommitAt: assessment.inputs.lastCommitAt?.toISOString() ?? null,
      },
    };
  }

  private cacheKey(reference: string, releases: number): string {
    return `resolve:${normalizeReference(reference)}:${releases}`;
  }

  private diagnostics(
    steps: readonly ResolutionStep[],
    warnings: readonly string[],
    startedAt: number,
    cache: Diagnostics['cache'],
    providerErrors: readonly ProviderErrorReport[],
  ): Diagnostics {
    return {
      steps: [...steps],
      warnings: [...warnings],
      durationMs: this.deps.clock.now().getTime() - startedAt,
      cache,
      providerErrors: [...providerErrors],
    };
  }
}

export function normalizeReference(reference: string): string {
  return (
    reference
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      // Trailing slashes first: `repo.git/` and `repo/` must share a cache key.
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
  );
}

export function toProviderError(
  provider: ProviderErrorReport['provider'],
  error: unknown,
): ProviderErrorReport {
  if (isDomainError(error)) {
    const code: ProviderErrorReport['code'] =
      error.code === 'source-not-found'
        ? 'not-found'
        : error.code === 'source-rate-limited'
          ? 'rate-limited'
          : error.code === 'source-unauthorized'
            ? 'unauthorized'
            : error.code === 'source-protocol-error'
              ? 'upstream-error'
              : 'invalid-input';
    return {
      provider,
      code,
      message: error.message,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }
  return {
    provider,
    code: 'upstream-error',
    message: error instanceof Error ? error.message : 'unknown upstream failure',
  };
}
