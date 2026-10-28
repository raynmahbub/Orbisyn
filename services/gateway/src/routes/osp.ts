import { DomainError } from '@orbisyn/core';
import { OspResolutionSchema, ospIdFromUri, ospUriForId } from '@orbisyn/osp';
import type { FastifyInstance } from 'fastify';
import type { GatewayContext } from '../context.js';
import { parseOutbound } from '../outbound.js';

/**
 * OSP identity route.
 *
 * Two audiences: a client that has only an `osp://` URI and wants the record,
 * and a publisher (or auditor) checking that their `orbisyn.json` agrees with
 * what the upstream repository actually says. `verify=true` runs that check.
 */
export function registerOspRoutes(app: FastifyInstance, context: GatewayContext): void {
  app.get<{ Params: { id: string }; Querystring: { verify?: string } }>(
    '/osp/:id',
    async (request, reply) => {
      const raw = request.params.id;
      const id = ospIdFromUri(raw) ?? ospIdFromUri(ospUriForId(raw));
      if (id === null) {
        throw DomainError.invalidReference(
          raw,
          'expected an OSP identity such as osp://bitwarden-android',
        );
      }

      const app = await context.store.findApp(id);
      if (app === null) {
        throw DomainError.notFound(
          `Orbisyn has no record for ${ospUriForId(id)}. Resolve the upstream source once to publish it.`,
        );
      }

      return reply.send(
        parseOutbound(
          OspResolutionSchema,
          {
            uri: ospUriForId(id),
            document: null,
            app,
            repository: app.source,
          },
          'OSP resolution',
        ),
      );
    },
  );
}
