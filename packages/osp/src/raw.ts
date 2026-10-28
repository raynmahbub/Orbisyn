/**
 * Raw text fetch used for OSP discovery.
 *
 * Deliberately separate from the provider HTTP client: document discovery must
 * never throw, never retry aggressively and never block resolution. A missing
 * document is the common case, not an error.
 */

export interface RawFetchOptions {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_DOCUMENT_BYTES = 64 * 1024;

export async function fetchText(
  url: string,
  options: RawFetchOptions = {},
): Promise<string | null> {
  if (options.signal?.aborted === true) return null;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return null;

    const text = await response.text();
    // Guard against a misconfigured URL returning a huge payload.
    return text.length > MAX_DOCUMENT_BYTES ? null : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
