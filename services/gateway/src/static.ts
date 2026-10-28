import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { GatewayLogger } from './logger-types.js';

/**
 * Static client delivery.
 *
 * A self-hosted Orbisyn is one process: the gateway also serves the built web
 * client when `apps/web/dist` exists. That removes CORS, removes a reverse proxy
 * and makes `docker run` sufficient. During development Vite serves the client
 * instead and this is a no-op.
 *
 * Mounting deliberately does *not* install a not-found handler of its own: the
 * application owns exactly one, which decides between the API error envelope and
 * the single-page-app shell.
 */
export interface StaticOptions {
  readonly webRoot?: string | undefined;
  readonly logger: GatewayLogger;
  readonly isProduction: boolean;
}

export interface ClientDelivery {
  readonly root: string;
  /** Serve `index.html` so a client-side route survives a hard refresh. */
  sendShell(reply: FastifyReply): unknown;
}

export function mountStaticClient(
  app: FastifyInstance,
  options: StaticOptions,
): ClientDelivery | null {
  const root = options.webRoot ?? defaultWebRoot();
  if (!existsSync(root)) {
    options.logger.debug('no built web client found, serving API only', { root });
    return null;
  }

  // `wildcard: true` resolves files per request rather than registering a route
  // per file at boot. Without it, a client rebuilt while the gateway is running
  // is invisible: the new hashed bundles 404 and the browser gets the shell
  // where it expected JavaScript.
  void app.register(fastifyStatic, { root, prefix: '/', wildcard: true });

  options.logger.info('serving web client from disk', { root });
  return { root, sendShell: (reply) => reply.sendFile('index.html') };
}

function defaultWebRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Resolves both from `src/` (tsx) and `dist/` (bundled) layouts.
  return resolve(here, '../../../apps/web/dist');
}
