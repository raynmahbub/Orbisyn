import type { HealthStatus } from '@orbisyn/contracts';
import { CATALOG_COLLECTIONS, SEED_CATALOG } from '@orbisyn/providers';
import type { FastifyInstance } from 'fastify';
import type { GatewayContext } from '../context.js';

/**
 * System routes: what am I, what can I do, and how do I know it is healthy?
 * These are the first three calls any client makes and the ones a monitoring
 * system depends on, so they never touch an upstream provider.
 */
export function registerSystemRoutes(app: FastifyInstance, context: GatewayContext): void {
  app.get('/health', async (): Promise<HealthStatus> => {
    const providers = context.providerHealth.snapshot();
    return {
      status: context.providerHealth.isDegraded() ? 'degraded' : 'ok',
      version: context.config.buildVersion,
      uptimeSeconds: Math.round((Date.now() - context.startedAt) / 1000),
      providers: providers.map((entry) => ({
        kind: entry.kind,
        state: entry.state,
        lastFailureAt: entry.lastFailureAt,
      })),
      store: context.storeKind,
    };
  });

  app.get('/providers', async () => ({
    providers: context.registry.descriptors(),
  }));

  /**
   * The curated seed catalogue. Editorial metadata only — there are no invented
   * statistics here; each entry is resolved live when a client asks for it.
   */
  app.get('/catalog', async () => ({
    collections: CATALOG_COLLECTIONS,
    entries: SEED_CATALOG,
  }));
}
