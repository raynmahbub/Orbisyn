import { describe, expect, it, vi } from 'vitest';
import { fetchText } from './raw.js';

/**
 * Document discovery is best-effort by design: a missing or unreachable
 * `orbisyn.json` is a normal outcome, so every failure mode resolves to `null`
 * rather than throwing into the resolution pipeline.
 */
describe('fetchText', () => {
  it('returns the body of a successful response', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"spec":"1.0"}', { status: 200 }));
    await expect(fetchText('https://example.org/orbisyn.json', { fetchImpl })).resolves.toBe(
      '{"spec":"1.0"}',
    );
  });

  it('returns null for a missing document', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    await expect(fetchText('https://example.org/orbisyn.json', { fetchImpl })).resolves.toBeNull();
  });

  it('returns null when the transport fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });
    await expect(fetchText('https://example.org/orbisyn.json', { fetchImpl })).resolves.toBeNull();
  });

  it('returns null for a payload larger than the document limit', async () => {
    const huge = `{${'x'.repeat(70 * 1024)}}`;
    const fetchImpl = vi.fn(async () => new Response(huge, { status: 200 }));
    await expect(fetchText('https://example.org/orbisyn.json', { fetchImpl })).resolves.toBeNull();
  });

  it('does not start a request when the caller has already aborted', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"spec":"1.0"}', { status: 200 }));
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchText('https://example.org/orbisyn.json', { fetchImpl, signal: controller.signal }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when no fetch implementation exists', async () => {
    const original = globalThis.fetch;
    // Simulate a runtime without fetch rather than mutating the test process.
    Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true });
    try {
      await expect(fetchText('https://example.org/orbisyn.json')).resolves.toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: original, configurable: true });
    }
  });
});
