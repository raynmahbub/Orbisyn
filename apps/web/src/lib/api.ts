import type {
  AppRecord,
  AppSummary,
  Collection,
  Platform,
  Release,
  ResolveResponse,
  SearchResult,
  SourceKind,
} from '@orbisyn/core';
import { OrbisynApiError, OrbisynClient } from '@orbisyn/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localStore } from './local-store.js';
import { resolveRuntimeConfig } from './runtime.js';

/**
 * Data access.
 *
 * Every read goes through TanStack Query, and every resolution is *also* written
 * to IndexedDB. That pairing is what makes the client offline first: a cached
 * response renders instantly, and when the gateway cannot be reached the client
 * falls back to the last resolution the device stored itself.
 */

const runtime = resolveRuntimeConfig();

/**
 * The transport is resolved per request rather than captured once. That keeps
 * the client honest in environments where `fetch` is polyfilled late, and it
 * lets the test suite substitute a transport without module gymnastics.
 */
export const client = new OrbisynClient({
  baseUrl: runtime.apiBase,
  fetchImpl: (input, init) => globalThis.fetch(input, init),
});

export const queryKeys = {
  health: ['health'] as const,
  providers: ['providers'] as const,
  catalog: ['catalog'] as const,
  search: (query: string) => ['search', query] as const,
  app: (id: string) => ['app', id] as const,
  releases: (id: string) => ['releases', id] as const,
  updates: (signature: string) => ['updates', signature] as const,
};

export interface CatalogEntry {
  readonly reference: string;
  readonly collections: readonly string[];
  readonly rationale: string;
}

export interface CatalogPayload {
  readonly collections: readonly { id: string; title: string; description: string }[];
  readonly entries: readonly CatalogEntry[];
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => client.health(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => client.providers(),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useCatalog() {
  return useQuery<CatalogPayload>({
    queryKey: queryKeys.catalog,
    queryFn: async () => {
      const response = await fetch(`${runtime.apiBase}/catalog`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`catalogue unavailable (${response.status})`);
      return (await response.json()) as CatalogPayload;
    },
    staleTime: 30 * 60_000,
    retry: 1,
  });
}

export interface SearchFilters {
  readonly platform?: Platform;
  readonly source?: SourceKind;
}

export function useSearch(query: string, filters: SearchFilters = {}, enabled = true) {
  const trimmed = query.trim();
  return useQuery<SearchResult>({
    queryKey: [...queryKeys.search(trimmed), filters.platform ?? '', filters.source ?? ''],
    enabled: enabled && trimmed.length > 1,
    staleTime: 60_000,
    retry: 0,
    queryFn: () =>
      client.search({
        q: trimmed,
        limit: 24,
        ...(filters.platform === undefined ? {} : { platform: [filters.platform] }),
        ...(filters.source === undefined ? {} : { source: [filters.source] }),
      }),
  });
}

/**
 * Resolving a reference is a mutation, not a query: it changes state on the
 * gateway (the record is persisted) and must never be retried automatically on
 * failure, because that would spend the operator's upstream quota twice.
 */
export function useResolve() {
  const queryClient = useQueryClient();

  return useMutation<
    ResolveResponse,
    Error,
    { reference: string; releases?: number; refresh?: boolean }
  >({
    mutationFn: async ({ reference, releases = 10, refresh = false }) =>
      client.resolve({ reference, releases, refresh }),
    retry: false,
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.app(result.app.id), result.app);
      queryClient.setQueryData(queryKeys.releases(result.app.id), result.releases);
      const settings = await localStore.settings();
      await localStore.cacheResolution(
        `resolve:${result.app.id}`,
        { app: result.app, releases: result.releases },
        settings.cacheTtlMinutes,
      );
    },
  });
}

export function useApp(appId: string | undefined) {
  return useQuery<AppRecord | null>({
    queryKey: queryKeys.app(appId ?? ''),
    enabled: appId !== undefined && appId.length > 0,
    retry: 0,
    queryFn: async () => {
      try {
        return await client.app(appId as string);
      } catch (error) {
        if (error instanceof OrbisynApiError && error.status === 404) {
          // The gateway has no record: fall back to what this device stored.
          const cached = await localStore.readResolution(`resolve:${appId as string}`);
          return cached?.app ?? null;
        }
        throw error;
      }
    },
  });
}

export function useReleases(appId: string | undefined) {
  return useQuery<readonly Release[]>({
    queryKey: queryKeys.releases(appId ?? ''),
    enabled: appId !== undefined && appId.length > 0,
    retry: 0,
    queryFn: async () => {
      try {
        return await client.releases(appId as string, 20);
      } catch {
        const cached = await localStore.readResolution(`resolve:${appId as string}`);
        return cached?.releases ?? [];
      }
    },
  });
}

export function useUpdatesCheck(installed: readonly { appId: string; version: string | null }[]) {
  const signature = installed
    .map((entry) => `${entry.appId}@${entry.version ?? 'unknown'}`)
    .sort()
    .join('|');

  return useQuery({
    queryKey: queryKeys.updates(signature),
    enabled: installed.length > 0,
    retry: 0,
    queryFn: () => client.checkUpdates(installed),
  });
}

export function useCollections() {
  return useQuery<readonly Collection[]>({
    queryKey: ['collections'],
    queryFn: async () => {
      try {
        return await client.collections();
      } catch {
        return localStore.collections();
      }
    },
    staleTime: 30_000,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: { name: string; appIds?: string[] }) => client.createCollection(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

/** Human-readable message for any failure the UI can encounter. */
export function describeError(error: unknown): {
  title: string;
  detail: string;
  retryable: boolean;
} {
  if (error instanceof OrbisynApiError) {
    const titles: Record<string, string> = {
      'unsupported-source': 'Not a source we can read',
      'not-found': 'Not found upstream',
      'rate-limited': 'Upstream is rate limiting this gateway',
      'upstream-unavailable': 'Upstream is unreachable',
      unauthorized: 'Credentials rejected',
      'validation-failed': 'That request was not valid',
      internal: 'The gateway hit an internal error',
    };
    return {
      title: titles[error.code] ?? 'Request failed',
      detail: error.message,
      retryable: error.retryable,
    };
  }
  return {
    title: 'Request failed',
    detail: error instanceof Error ? error.message : 'unknown error',
    retryable: false,
  };
}

export function summaryStars(summary: AppSummary): number | null {
  return summary.stars;
}

/** Narrow an arbitrary chip value to a platform name. */
export function asPlatform(value: string | null): Platform | undefined {
  const known: readonly string[] = ['android', 'ios', 'macos', 'windows', 'linux', 'web'];
  return value !== null && known.includes(value) ? (value as Platform) : undefined;
}

/** Narrow an arbitrary chip value to a provider kind. */
export function asSourceKind(value: string | null): SourceKind | undefined {
  const known: readonly string[] = [
    'github',
    'gitlab',
    'codeberg',
    'forgejo',
    'fdroid',
    'direct-url',
  ];
  return value !== null && known.includes(value) ? (value as SourceKind) : undefined;
}
