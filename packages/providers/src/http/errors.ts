import type { HttpResponse } from '@orbisyn/core';
import { DomainError } from '@orbisyn/core';

/**
 * Status-code translation. Forges are inconsistent about how they express
 * "slow down": GitHub answers 403 with `x-ratelimit-remaining: 0`, GitLab uses
 * 429, Gitea uses 429 with `Retry-After`. This helper produces one vocabulary.
 */
export function ensureSuccess(response: HttpResponse, provider: string): void {
  if (response.ok) return;

  const remaining = response.headers['x-ratelimit-remaining'];
  const retryAfter = parseRetryAfter(response.headers['retry-after']);

  if (response.status === 404) {
    throw DomainError.notFound(`${provider} returned 404 for ${shortUrl(response.url)}`, {
      url: response.url,
    });
  }

  if (response.status === 401) {
    throw DomainError.unauthorized(
      provider,
      `${provider} rejected our credentials (401). Check the provider token in the gateway configuration.`,
    );
  }

  if (response.status === 403 && remaining === '0') {
    const reset = parseRetryAfter(response.headers['x-ratelimit-reset'], true);
    throw DomainError.rateLimited(provider, reset ?? retryAfter);
  }

  if (response.status === 429) {
    throw DomainError.rateLimited(provider, retryAfter);
  }

  if (response.status === 403) {
    throw DomainError.unauthorized(
      provider,
      `${provider} refused the request (403). A personal access token is usually required for this endpoint.`,
    );
  }

  if (response.status === 451) {
    throw new DomainError({
      code: 'source-not-found',
      message: `${provider} reports this resource as unavailable for legal reasons (451)`,
    });
  }

  if (response.status >= 500) {
    throw DomainError.protocol(provider, `upstream error ${response.status}`, undefined);
  }

  throw DomainError.protocol(provider, `unexpected status ${response.status}`, undefined);
}

/** Returns `null` instead of throwing — used for optional telemetry calls. */
export async function ensureSuccessOrNull(
  response: HttpResponse,
  provider: string,
): Promise<HttpResponse | null> {
  if (response.status === 200) return response;
  if (response.status === 404 || response.status === 403 || response.status === 429) return null;
  if (response.status >= 500) return null;
  ensureSuccess(response, provider);
  return null;
}

export function parseRetryAfter(
  value: string | undefined,
  absoluteEpochSeconds = false,
): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    if (absoluteEpochSeconds) {
      const seconds = Math.max(0, Math.round(numeric - Date.now() / 1000));
      return seconds;
    }
    return Math.max(0, numeric);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

/**
 * `Link: <...?page=42>; rel="last"` — GitHub and Gitea use it to expose totals
 * for paginated collections, which is how we read the contributor count without
 * downloading every page.
 */
export function lastPageFromLinkHeader(header: string | undefined): number | null {
  if (header === undefined) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="last"/.exec(part);
    if (match?.[1] === undefined) continue;
    try {
      const page = new URL(match[1]).searchParams.get('page');
      if (page === null) continue;
      const parsed = Number.parseInt(page, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {}
  }
  return null;
}

export function readTotalCountHeader(headers: Readonly<Record<string, string>>): number | null {
  for (const key of ['x-total', 'x-total-count', 'x-total-pages']) {
    const raw = headers[key];
    if (raw === undefined) continue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}
