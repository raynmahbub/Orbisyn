import { afterEach, describe, expect, it, vi } from 'vitest';
import { installProcessHandlers, type RunningGateway, startGateway } from './main.js';

/**
 * The process contract: bind, report, and shut down cleanly on a signal. The
 * server is started on an ephemeral port so the test exercises the real Fastify
 * listener rather than a mock.
 */
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);

afterEach(() => {
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
  vi.restoreAllMocks();
});

const ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  GATEWAY_HOST: '127.0.0.1',
  GATEWAY_PORT: '0',
  ORBISYN_WEB_ROOT: '/nonexistent-for-tests',
};

describe('startGateway', () => {
  it('listens on the configured address and serves the API', async () => {
    const running = await startGateway({ env: ENV });

    try {
      expect(running.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const response = await running.app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ok');
    } finally {
      await running.close('SIGTERM');
    }
  });

  it('reports a zero exit code when it shuts down cleanly', async () => {
    const running = await startGateway({ env: ENV });
    await expect(running.close('SIGINT')).resolves.toBe(0);
  });

  it('reports a non-zero exit code when shutdown fails', async () => {
    const running = await startGateway({ env: ENV });
    vi.spyOn(running.app, 'close').mockRejectedValueOnce(new Error('socket stuck'));

    await expect(running.close('SIGTERM')).resolves.toBe(1);
    // The first close attempt left the listener open; clean up for real.
    await running.app.close();
  });
});

describe('installProcessHandlers', () => {
  function fakeProcess() {
    const listeners = new Map<string, (payload?: unknown) => void>();
    return {
      exit: vi.fn(),
      once: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        listeners.set(event, handler);
        return undefined;
      }),
      on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        listeners.set(event, handler);
        return undefined;
      }),
      emit(event: string, payload?: unknown) {
        listeners.get(event)?.(payload);
      },
    };
  }

  function stubGateway(): RunningGateway {
    return {
      app: { close: vi.fn(async () => undefined) } as unknown as RunningGateway['app'],
      address: 'http://127.0.0.1:8787',
      close: vi.fn(async () => 0),
    };
  }

  it('closes the gateway and exits with its status on SIGINT and SIGTERM', async () => {
    const target = fakeProcess();
    const running = stubGateway();
    installProcessHandlers(running, { process: target as unknown as NodeJS.Process });

    target.emit('SIGTERM');
    await vi.waitFor(() => expect(running.close).toHaveBeenCalledWith('SIGTERM'));
    await vi.waitFor(() => expect(target.exit).toHaveBeenCalledWith(0));

    target.emit('SIGINT');
    await vi.waitFor(() => expect(running.close).toHaveBeenCalledWith('SIGINT'));
  });

  it('reports an unhandled rejection without exiting', () => {
    const target = fakeProcess();
    const report = vi.fn();
    installProcessHandlers(stubGateway(), {
      process: target as unknown as NodeJS.Process,
      report,
    });

    target.emit('unhandledRejection', new Error('provider exploded'));

    expect(report).toHaveBeenCalledWith('unhandled promise rejection', 'provider exploded');
    expect(target.exit).not.toHaveBeenCalled();
  });

  it('survives a rejection that is not an Error', () => {
    const target = fakeProcess();
    installProcessHandlers(stubGateway(), { process: target as unknown as NodeJS.Process });

    expect(() => target.emit('unhandledRejection', 'plain string reason')).not.toThrow();
  });
});
