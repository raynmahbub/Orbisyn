import type { LoggerPort } from '@orbisyn/core';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createFileStore, createStore } from './store/index.js';
import { createFileSyncVaultStore, createMemorySyncVaultStore } from './sync-vault.js';

/**
 * Entry point.
 *
 * Everything that can be tested lives in `buildApp`; what remains here is the
 * process contract — read configuration, listen, translate signals and crashes
 * into a logged, graceful exit. `startGateway` keeps that contract testable
 * without spawning a process.
 */

export interface RunningGateway {
  readonly app: FastifyInstance;
  /** Resolves once the socket is open. */
  readonly address: string;
  close(signal: string): Promise<number>;
}

export interface StartOptions {
  /** Injected by tests; production reads `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  readonly exit?: (code: number) => void;
}

export async function startGateway(options: StartOptions = {}): Promise<RunningGateway> {
  const config = loadConfig(options.env ?? process.env);
  const { logger, instance, flush } = createLogger(config);
  const store =
    config.nodeEnv === 'test'
      ? createStore({ maxApps: 10_000 })
      : await createFileStore({ filePath: config.storeFile, maxApps: 10_000 });
  const syncVaults =
    config.nodeEnv === 'test'
      ? createMemorySyncVaultStore()
      : await createFileSyncVaultStore(config.syncVaultFile);
  const app = await buildApp({ config, logInstance: instance, store, syncVaults });

  const address = await app.listen({ host: config.host, port: config.port });
  logger.info('gateway listening', {
    host: config.host,
    port: config.port,
    store: store.kind,
    forgeHosts: config.forgeHosts.length,
  });

  return {
    app,
    address,
    async close(signal: string): Promise<number> {
      logger.info('received shutdown signal', { signal });
      try {
        await app.close();
        flush();
        return 0;
      } catch (error) {
        reportShutdownFailure(logger, error);
        return 1;
      }
    },
  };
}

/** Installs the process-level handlers. Kept separate so `startGateway` stays pure. */
export function installProcessHandlers(
  running: RunningGateway,
  dependencies: {
    readonly process?: Pick<NodeJS.Process, 'once' | 'on' | 'exit'>;
    /** Where an unhandled rejection is reported; the process logger by default. */
    readonly report?: (message: string, detail: string) => void;
  } = {},
): void {
  const target = dependencies.process ?? process;
  const report =
    dependencies.report ??
    ((message: string, detail: string) => {
      // A rejected promise must never take the process down silently, and this
      // can happen before a logger exists.
      console.error(message, detail);
    });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    target.once(signal, () => {
      void running.close(signal).then((code) => target.exit(code));
    });
  }

  target.on('unhandledRejection', (reason: unknown) => {
    report(
      'unhandled promise rejection',
      reason instanceof Error ? reason.message : String(reason),
    );
  });
}

function reportShutdownFailure(logger: LoggerPort, error: unknown): void {
  logger.error('shutdown failed', {
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Bootstraps the process. Failures during start-up are logged and turned into a
 * non-zero exit code so a supervisor such as systemd or Docker restarts us.
 */
export async function main(): Promise<void> {
  try {
    const running = await startGateway();
    installProcessHandlers(running);
  } catch (error) {
    // The logger may not exist yet, so this is the one deliberate console write.
    console.error(
      'failed to start gateway',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run only when executed directly, never when imported by a test.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
