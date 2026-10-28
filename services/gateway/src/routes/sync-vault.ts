import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayContext } from '../context.js';

const VaultIdSchema = z.string().uuid();
const CredentialSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
const SnapshotSchema = z.object({
  expectedRevision: z.number().int().min(0),
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  ciphertext: z.string().min(24).max(750_000),
});

/**
 * End-to-end encrypted cross-device snapshots. The gateway stores ciphertext
 * only; the AES key is carried in the user's pairing code fragment and never
 * sent to the server.
 */
export function registerSyncVaultRoutes(app: FastifyInstance, context: GatewayContext): void {
  app.get<{ Params: { id: string } }>('/sync-vaults/:id', async (request, reply) => {
    const id = VaultIdSchema.parse(request.params.id);
    const credential = bearerCredential(request.headers.authorization);
    if (credential === null) return reply.status(401).send({ error: 'unauthorized' });
    const record = await context.syncVaults.get(id, credential);
    if (record === null) return reply.status(401).send({ error: 'unauthorized' });
    return {
      id: record.id,
      iv: record.iv,
      ciphertext: record.ciphertext,
      revision: record.revision,
      updatedAt: record.updatedAt,
    };
  });

  app.put<{ Params: { id: string } }>('/sync-vaults/:id', async (request, reply) => {
    const id = VaultIdSchema.parse(request.params.id);
    const credential = bearerCredential(request.headers.authorization);
    if (credential === null) return reply.status(401).send({ error: 'unauthorized' });
    const snapshot = SnapshotSchema.parse(request.body ?? {});
    const result = await context.syncVaults.put({ id, credential, ...snapshot });
    if (result.conflict) {
      return reply.status(409).send({ error: 'revision-conflict' });
    }
    if (result.record === null) return reply.status(401).send({ error: 'unauthorized' });
    return reply.status(200).send({
      id: result.record.id,
      revision: result.record.revision,
      updatedAt: result.record.updatedAt,
    });
  });
}

function bearerCredential(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(value);
  if (match === null) return null;
  const credential = match[1];
  return credential !== undefined && CredentialSchema.safeParse(credential).success
    ? credential
    : null;
}
