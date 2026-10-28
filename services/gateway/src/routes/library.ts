import { CollectionDraftSchema, SyncRequestSchema } from '@orbisyn/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayContext } from '../context.js';

const UpdateCheckSchema = z.object({
  installed: z
    .array(
      z.object({
        appId: z.string().min(1).max(96),
        version: z.string().max(128).nullable().default(null),
      }),
    )
    .max(500),
});

/**
 * Library routes: the user's own data.
 *
 * Everything here is deliberately idempotent and cursor-based so the client can
 * keep a queue in IndexedDB, drain it when a connection returns, and end up in
 * the same state as a client that was online the whole time.
 */
export function registerLibraryRoutes(app: FastifyInstance, context: GatewayContext): void {
  app.get('/collections', async () => ({ collections: await context.store.listCollections() }));

  app.post('/collections', async (request, reply) => {
    const draft = CollectionDraftSchema.parse(request.body ?? {});
    const collection = await context.store.saveCollection(draft);
    return reply.status(201).send(collection);
  });

  app.post('/sync', async (request) => {
    const envelope = SyncRequestSchema.parse(request.body ?? {});
    return context.syncLibrary.execute(envelope);
  });

  app.post('/updates/check', async (request) => {
    const body = UpdateCheckSchema.parse(request.body ?? {});
    const result = await context.checkForUpdates.execute(body.installed);
    return { checkedAt: result.checkedAt, updates: result.updates };
  });
}
