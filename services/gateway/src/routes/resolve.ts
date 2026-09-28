import { ResolveRequestSchema, ResolveResponseSchema, SearchQuerySchema } from '@orbisyn/contracts';
import { DomainError } from '@orbisyn/core';
import type { FastifyInstance } from 'fastify';
import type { GatewayContext } from '../context.js';
import { parseOutbound } from '../outbound.js';

/**
 * Resolution and discovery routes.
 *
 * Note the order of operations in `POST /resolve`: the provider is asked first,
 * results are persisted, and only then are they returned. A client that loses
 * connectivity mid-response still has the record stored server-side, and a
 * second client asking for the same source gets a cache hit.
 */
export function registerResolveRoutes(app: FastifyInstance, context: GatewayContext): void {
  app.post('/resolve', async (request, reply) => {
    const body = ResolveRequestSchema.parse(request.body ?? {});
    const result = await trackProviderCalls(context, body.reference, () =>
      context.resolveSource.execute({
        reference: body.reference,
        releases: body.releases,
        refresh: body.refresh,
      }),
    );

    if (body.releases > 0) {
      await context.store.saveApp(result.app, result.releases);
    }

    return reply.send(parseOutbound(ResolveResponseSchema, result, 'resolve response'));
  });

  app.get('/search', async (request) => {
    const query = SearchQuerySchema.parse(request.query ?? {});
    return context.searchApps.execute({ ...query });
  });

  app.get<{ Params: { id: string } }>('/apps/:id', async (request, reply) => {
    const app = await context.store.findApp(request.params.id);
    if (app === null) {
      throw DomainError.notFound(`no stored record for "${request.params.id}"`);
    }
    return reply.send(app);
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/apps/:id/releases',
    async (request) => {
      const limit = Math.min(
        Math.max(Number.parseInt(request.query.limit ?? '10', 10) || 10, 1),
        100,
      );
      const app = await context.store.findApp(request.params.id);
      if (app === null) {
        throw DomainError.notFound(`no stored record for "${request.params.id}"`);
      }
      return { releases: await context.store.listReleases(request.params.id, limit) };
    },
  );
}

/**
 * Records provider outcomes for `/health`. The reference is matched against the
 * registry so a failure is attributed to the provider that actually served it.
 */
async function trackProviderCalls<T>(
  context: GatewayContext,
  reference: string,
  work: () => Promise<T>,
): Promise<T> {
  const provider = context.registry.detect(reference);
  const kind = provider?.descriptor.kind;
  try {
    const result = await work();
    if (kind !== undefined) context.providerHealth.recordSuccess(kind);
    return result;
  } catch (error) {
    if (kind !== undefined) context.providerHealth.recordFailure(kind, error);
    throw error;
  }
}
