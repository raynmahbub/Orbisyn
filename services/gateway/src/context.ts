import type {
  AppStorePort,
  CachePort,
  CheckForUpdatesUseCase,
  ClockPort,
  HttpPort,
  LoggerPort,
  ProviderRegistryPort,
  ResolveSourceUseCase,
  SearchAppsUseCase,
  SyncLibraryUseCase,
} from '@orbisyn/core';
import type { GatewayConfig } from './config.js';
import type { ProviderHealthTracker } from './provider-health.js';
import type { StoreKind } from './store/index.js';

/**
 * Composition root.
 *
 * Everything the routes need, assembled once and passed explicitly: no service
 * locator, no module-level singletons. `buildTestApp` in the gateway's own test
 * helpers constructs one of these with fakes, which is why the HTTP tests run
 * without a network.
 */
export interface GatewayContext {
  readonly config: GatewayConfig;
  readonly logger: LoggerPort;
  readonly clock: ClockPort;
  readonly http: HttpPort;
  readonly cache: CachePort;
  readonly store: AppStorePort;
  readonly storeKind: StoreKind;
  readonly registry: ProviderRegistryPort;
  readonly providerHealth: ProviderHealthTracker;
  readonly startedAt: number;
  readonly resolveSource: ResolveSourceUseCase;
  readonly searchApps: SearchAppsUseCase;
  readonly checkForUpdates: CheckForUpdatesUseCase;
  readonly syncLibrary: SyncLibraryUseCase;
}
