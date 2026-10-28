import type { LoggerPort } from '@orbisyn/core';
import { type Logger as PinoLogger, pino } from 'pino';
import type { GatewayConfig } from './config.js';

/**
 * Logging.
 *
 * One structured logger for the whole process, with two rules that matter for a
 * metadata service: **credentials never reach a log line** (redaction is
 * configured here, not left to call sites), and request logs carry the request
 * id so a user's screenshot maps to exactly one trace.
 */

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'token',
  'accessToken',
  '*.token',
  '*.accessToken',
];

export interface ProcessLogger {
  readonly logger: LoggerPort;
  /** The concrete pino instance, handed to Fastify for request logging. */
  readonly instance: PinoLogger;
  /** Flushes buffered logs; called during graceful shutdown. */
  flush(): void;
}

export function createLogger(config: GatewayConfig): ProcessLogger {
  const instance: PinoLogger = pino({
    level: config.logLevel,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: 'orbisyn-gateway', version: config.buildVersion },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.nodeEnv === 'production'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,service,version',
            },
          },
        }),
  });

  return {
    logger: wrap(instance),
    instance,
    flush: () => {
      instance.flush();
    },
  };
}

/**
 * Adapts pino to the domain's `LoggerPort`. The domain never learns which
 * logging library the process chose.
 */
function wrap(instance: PinoLogger): LoggerPort {
  return {
    debug: (message, context) => {
      instance.debug(context ?? {}, message);
    },
    info: (message, context) => {
      instance.info(context ?? {}, message);
    },
    warn: (message, context) => {
      instance.warn(context ?? {}, message);
    },
    error: (message, context) => {
      instance.error(context ?? {}, message);
    },
    child: (bindings) => wrap(instance.child(bindings)),
  };
}
