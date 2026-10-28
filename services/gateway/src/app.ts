import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import type {
  CredentialStorePort,
  HttpPort,
  LoggerPort,
  SourceKind,
  SourceProvider,
} from '@orbisyn/core';
import {
  CheckForUpdatesUseCase,
  createMemoryCache,
  createSystemClock,
  ResolveSourceUseCase,
  SearchAppsUseCase,
  SyncLibraryUseCase,
} from '@orbisyn/core';
import type { RegistryOptions } from '@orbisyn/providers';
import { createFetchHttpClient, createProviderRegistry } from '@orbisyn/providers';
import type { FastifyBaseLogger } from 'fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import type { GatewayConfig } from './config.js';
import { loadConfig } from './config.js';
import type { GatewayContext } from './context.js';
import { registerErrorHandler } from './errors.js';
import { createLogger } from './logger.js';
import { createProviderHealthTracker } from './provider-health.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerOspRoutes } from './routes/osp.js';
import { registerResolveRoutes } from './routes/resolve.js';
import { registerSystemRoutes } from './routes/system.js';
import { mountStaticClient } from './static.js';
import type { StoreBundle } from './store/index.js';
import { createStore } from './store/index.js';

/**
 * Application factory.
 *
 * `buildApp` takes its dependencies as optional overrides, which is how the
 * gateway is tested end to end without a network, a database or a port binding.
 * `main.ts` is then a thin wrapper: load config, build, listen, shut down.
 */

/**
 * The API lives under a single prefix. That is what lets the root of the origin
 * belong to the web client: `/apps/:id` is a page, `/api/apps/:id` is a resource,
 * and neither can shadow the other.
 */
export const API_PREFIX = '/api';

export interface BuildAppOptions {
  readonly config?: GatewayConfig;
  readonly logger?: LoggerPort;
  /** pino instance used by Fastify itself; `false` silences request logging in tests. */
  readonly logInstance?: FastifyBaseLogger | false;
  readonly http?: HttpPort;
  readonly cache?: ReturnType<typeof createMemoryCache>;
  /** Overrides the store backend; tests inject an empty one per case. */
  readonly store?: StoreBundle;
  readonly providers?: readonly SourceProvider[];
  readonly registerStatic?: boolean;
  /** Injected by tests; production uses `loadConfig()`. */
  readonly env?: NodeJS.ProcessEnv;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig(options.env ?? process.env);
  const ownLogger = options.logger === undefined ? createLogger(config) : null;
  const logger = options.logger ?? (ownLogger?.logger as LoggerPort);
  const logInstance = options.logInstance ?? ownLogger?.instance ?? false;
  const clock = createSystemClock();

  const http =
    options.http ??
    createFetchHttpClient({
      userAgent: `Orbisyn/${config.buildVersion} (+https://github.com/raynmahbub/Orbisyn)`,
      defaultTimeoutMs: config.httpTimeoutMs,
      maxRetries: 2,
      logger,
    });

  const cache = options.cache ?? createMemoryCache({ clock, maxEntries: config.cacheMaxEntries });
  const composed = options.store ?? createStore({ maxApps: 10_000 });
  const store = composed.store;
  const registry = createProviderRegistry({
    ...providerOverrides(options.providers),
    extraForgeHosts: config.forgeHosts,
  });

  const credentials = createCredentialStore(config);
  const providerHealth = createProviderHealthTracker(
    registry.descriptors().map((descriptor) => descriptor.kind),
    clock,
  );

  const resolveSource = new ResolveSourceUseCase({
    registry,
    cache,
    clock,
    logger,
    http,
    credentials,
    cacheTtlSeconds: config.cacheTtlSeconds,
    httpTimeoutMs: config.httpTimeoutMs,
  });

  const context: GatewayContext = {
    config,
    logger,
    clock,
    http,
    cache,
    store,
    storeKind: composed.kind,
    registry,
    providerHealth,
    startedAt: Date.now(),
    resolveSource,
    searchApps: new SearchAppsUseCase({ store, resolveSource, clock, logger }),
    checkForUpdates: new CheckForUpdatesUseCase({ store, clock, logger, releaseWindow: 20 }),
    syncLibrary: new SyncLibraryUseCase({ store, clock, logger, maxOperations: 500 }),
  };

  const app = Fastify({
    // `false` disables Fastify's own logging entirely (used by the test suite).
    ...(logInstance === false ? { logger: false } : { loggerInstance: logInstance }),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, {
    // The client is served from this origin and loads remote icons/avatars.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // A deployed instance must not be framed by another site. During
    // development the client is routinely embedded in editor preview panes, so
    // the guard is applied in production only.
    frameguard: config.nodeEnv === 'production' ? { action: 'sameorigin' } : false,
  });
  await app.register(cors, {
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86_400,
  });
  await app.register(sensible);
  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowMs,
      allowList: [],
      keyGenerator: (request) => request.ip,
    });
  }

  // The client is mounted before the not-found handler so a refresh on a
  // client-side route (`/apps/:id`) returns the shell instead of a 404.
  const client =
    options.registerStatic === false
      ? null
      : mountStaticClient(app, {
          webRoot: config.webRoot,
          logger,
          isProduction: config.nodeEnv === 'production',
        });

  registerErrorHandler(app, { client });

  await app.register(
    async (api) => {
      registerSystemRoutes(api, context);
      registerResolveRoutes(api, context);
      registerOspRoutes(api, context);
      registerLibraryRoutes(api, context);
    },
    { prefix: API_PREFIX },
  );

  app.addHook('onClose', async () => {
    logger.info('gateway shutting down');
  });

  return app;
}

/**
 * Credentials are read from configuration, never from a request — a client can
 * never cause the gateway to spend the operator's API quota on its behalf.
 */
function createCredentialStore(config: GatewayConfig): CredentialStorePort {
  const tokens = new Map<SourceKind, string>();
  if (config.githubToken !== undefined) tokens.set('github', config.githubToken);
  if (config.gitlabToken !== undefined) tokens.set('gitlab', config.gitlabToken);
  for (const [host, token] of Object.entries(config.forgeTokens)) {
    if (host.startsWith('codeberg')) tokens.set('codeberg', token);
    else tokens.set('forgejo', token);
  }

  return {
    get: (provider) => {
      const token = tokens.get(provider);
      return token === undefined ? null : { token };
    },
  };
}

/** Maps injected providers onto the registry's per-kind slots. */
function providerOverrides(providers: readonly SourceProvider[] | undefined): RegistryOptions {
  const overrides: {
    github?: SourceProvider;
    gitlab?: SourceProvider;
    codeberg?: SourceProvider;
    forgejo?: SourceProvider;
    fdroid?: SourceProvider;
    directUrl?: SourceProvider;
  } = {};

  for (const provider of providers ?? []) {
    const kind: SourceKind = provider.descriptor.kind;
    if (kind === 'github') overrides.github = provider;
    else if (kind === 'gitlab') overrides.gitlab = provider;
    else if (kind === 'codeberg') overrides.codeberg = provider;
    else if (kind === 'forgejo') overrides.forgejo = provider;
    else if (kind === 'fdroid') overrides.fdroid = provider;
    else overrides.directUrl = provider;
  }

  return overrides as RegistryOptions;
}
