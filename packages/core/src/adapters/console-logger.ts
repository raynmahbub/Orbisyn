import type { LoggerPort } from '../ports.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal structured logger. The gateway swaps in pino; the browser uses this
 * one so that provider diagnostics are visible in devtools.
 */
export function createConsoleLogger(
  bindings: Record<string, unknown> = {},
  level: LogLevel = 'info',
): LoggerPort {
  const threshold = LEVEL_ORDER[level];

  const emit = (severity: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[severity] < threshold) return;
    const payload = { ...bindings, ...context };
    const line = `[${severity}] ${message}`;
    if (severity === 'error') console.error(line, payload);
    else if (severity === 'warn') console.warn(line, payload);
    else console.log(line, payload);
  };

  return {
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    child: (extra) => createConsoleLogger({ ...bindings, ...extra }, level),
  };
}
