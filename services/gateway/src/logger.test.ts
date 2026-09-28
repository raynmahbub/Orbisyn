import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

/**
 * Logging is operational surface: a self-hosted operator debugs from these
 * lines, so the adapter must carry context through, honour the configured level
 * and never leak a credential.
 */
const originalWrite = process.stdout.write.bind(process.stdout);

afterEach(() => {
  process.stdout.write = originalWrite;
  vi.restoreAllMocks();
});

function captureStdout(): string[] {
  const lines: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  return lines;
}

const config = loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'debug', ORBISYN_VERSION: '9.9.9' });

describe('createLogger', () => {
  it('exposes a domain logger, the concrete instance and a flush function', () => {
    const created = createLogger(config);

    expect(typeof created.logger.info).toBe('function');
    expect(typeof created.logger.child).toBe('function');
    expect(typeof created.flush).toBe('function');
    expect(() => created.flush()).not.toThrow();
  });

  it('writes structured lines with the service and version attached', () => {
    const lines = captureStdout();
    const { logger } = createLogger(config);

    logger.info('gateway listening', { port: 8787, host: '0.0.0.0' });

    const record = JSON.parse(lines.join('')) as Record<string, unknown>;
    expect(record.msg).toBe('gateway listening');
    expect(record.level).toBe(30);
    expect(record.service).toBe('orbisyn-gateway');
    expect(record.version).toBe('9.9.9');
    expect(record.port).toBe(8787);
  });

  it('keeps child bindings on every subsequent line', () => {
    const lines = captureStdout();
    const { logger } = createLogger(config);

    logger.child({ requestId: 'req-7', route: '/resolve' }).warn('upstream slow');

    const record = JSON.parse(lines.join('')) as Record<string, unknown>;
    expect(record.msg).toBe('upstream slow');
    expect(record.requestId).toBe('req-7');
    expect(record.route).toBe('/resolve');
    expect(record.level).toBe(40);
  });

  it('drops lines below the configured level', () => {
    const lines = captureStdout();
    const { logger } = createLogger(loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'error' }));

    logger.debug('not interesting');
    logger.info('also not interesting');
    logger.error('this one matters');

    const output = lines.join('');
    expect(output).not.toContain('not interesting');
    expect(output).toContain('this one matters');
  });

  it('redacts credentials instead of writing them out', () => {
    const lines = captureStdout();
    const { logger } = createLogger(config);

    logger.info('outbound request', {
      headers: { authorization: 'Bearer super-secret-token' },
      token: 'ghp_should-not-appear',
    });

    const output = lines.join('');
    expect(output).not.toContain('super-secret-token');
    expect(output).not.toContain('ghp_should-not-appear');
    expect(output).toContain('[redacted]');
  });

  it('accepts the silent level used by tooling', () => {
    const lines = captureStdout();
    const { logger } = createLogger(loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'silent' }));

    logger.error('nothing should be written');
    expect(lines.join('')).toBe('');
  });
});
