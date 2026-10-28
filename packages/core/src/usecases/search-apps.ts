import { looksLikeUrl, parseSourceUrl } from '../identity.js';
import type { AppSummary, SearchQuery, SearchResult } from '../model.js';
import type { AppStorePort, ClockPort, LoggerPort } from '../ports.js';
import { toSummary } from '../ports.js';
import type { ResolveSourceUseCase } from './resolve-source.js';

/**
 * SearchApps.
 *
 * Two honest modes, decided by the shape of the query:
 *
 * - **Reference lookup** — the query is a URL, a `host/owner/repo` pair or an
 *   `osp://` URI. We resolve it through the provider engine, persist the result
 *   and return it. No index required, no guessing.
 * - **Catalogue search** — a free-text query is answered from the local store,
 *   which only contains records a user (or the seed catalogue) actually
 *   resolved. We never fabricate results.
 *
 * This is why the response carries `queriedSources`: the client can show a
 * truthful empty state instead of pretending the ecosystem is empty.
 */

export interface SearchAppsDeps {
  readonly store: AppStorePort;
  readonly resolveSource: ResolveSourceUseCase;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
}

export interface SearchAppsRequest extends SearchQuery {
  /** Persist freshly resolved records even when the caller is only previewing. */
  readonly persist?: boolean;
}

export class SearchAppsUseCase {
  constructor(private readonly deps: SearchAppsDeps) {}

  async execute(request: SearchAppsRequest): Promise<SearchResult> {
    const startedAt = this.deps.clock.now().getTime();
    const query = request.q.trim();

    if (isReferenceQuery(query)) {
      return this.resolveSingle(query, request, startedAt);
    }

    const result = await this.deps.store.search(request);
    return { ...result, tookMs: this.deps.clock.now().getTime() - startedAt };
  }

  private async resolveSingle(
    query: string,
    request: SearchAppsRequest,
    startedAt: number,
  ): Promise<SearchResult> {
    const resolution = await this.deps.resolveSource.execute({
      reference: query,
      releases: 1,
      refresh: false,
    });

    if (request.persist !== false) {
      await this.deps.store.saveApp(resolution.app, resolution.releases);
    } else {
      this.deps.logger.debug('search resolved a reference without persisting it', {
        reference: query,
      });
    }

    const stars = resolution.app.health?.inputs.stars ?? null;
    const items: AppSummary[] = [toSummary(resolution.app, stars)];

    return {
      items,
      nextCursor: null,
      tookMs: this.deps.clock.now().getTime() - startedAt,
      queriedSources: [resolution.app.source.kind],
    };
  }
}

/**
 * A query is treated as a reference when it carries a host, a forge-style
 * `owner/repo` pair, or the OSP scheme. `flutter` stays a search term;
 * `github.com/flutter/flutter` does not.
 */
export function isReferenceQuery(query: string): boolean {
  const value = query.trim();
  if (value.startsWith('osp://')) return true;
  if (looksLikeUrl(value)) {
    try {
      parseSourceUrl(value);
      return true;
    } catch {
      return false;
    }
  }
  return /^[\w.-]+\/[\w.-]+$/.test(value);
}
