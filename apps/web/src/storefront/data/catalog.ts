import type { BridgeId, Category, Platform, StoreApp } from '../types.js';
import { STORE_APP_BY_ID, STORE_APPS } from './apps.js';
import { BRIDGES } from './sources.js';

export interface CategoryMeta {
  readonly id: Category;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  {
    id: 'Privacy',
    description: 'Encryption, passwords and private communication',
    icon: 'shield',
    color: '#7c8cff',
  },
  {
    id: 'Communication',
    description: 'Chat, mail and collaboration without lock-in',
    icon: 'message',
    color: '#55d6a5',
  },
  {
    id: 'Productivity',
    description: 'Notes, planning and knowledge tools',
    icon: 'note',
    color: '#ffb86b',
  },
  {
    id: 'Creativity',
    description: 'Image, video, audio and 3D studios',
    icon: 'wand',
    color: '#f58bd8',
  },
  {
    id: 'Media',
    description: 'Players, galleries and self-hosted libraries',
    icon: 'play',
    color: '#84d2ff',
  },
  {
    id: 'Developer',
    description: 'Editors, terminals, forges and build tools',
    icon: 'code',
    color: '#c191ff',
  },
  {
    id: 'Games',
    description: 'Launchers, stores and playtime tools',
    icon: 'gamepad',
    color: '#ff8f8f',
  },
  {
    id: 'Navigation',
    description: 'Maps and location tools that work offline',
    icon: 'map',
    color: '#7ee0a6',
  },
  {
    id: 'Utilities',
    description: 'Small tools that make devices feel better',
    icon: 'sparkles',
    color: '#7dd3fc',
  },
];

export type PlatformFilter = Platform | 'all' | 'desktop' | 'mobile';
export type SortMode = 'relevance' | 'fresh' | 'name' | 'sources';

export interface AppFilters {
  readonly query?: string;
  readonly category?: Category | 'all';
  readonly platform?: PlatformFilter;
  readonly source?: BridgeId | 'all';
  readonly openSourceOnly?: boolean;
  readonly verifiedOnly?: boolean;
  readonly sort?: SortMode;
  readonly enabledSources?: Readonly<Record<BridgeId, boolean>>;
}

export function getApp(id: string | undefined): StoreApp | undefined {
  return id === undefined ? undefined : STORE_APP_BY_ID[id];
}

export function matchesPlatform(app: StoreApp, platform: PlatformFilter): boolean {
  if (platform === 'all') return true;
  if (platform === 'mobile') {
    return app.platforms.includes('android') || app.platforms.includes('ios');
  }
  if (platform === 'desktop') {
    return (
      app.platforms.includes('windows') ||
      app.platforms.includes('macos') ||
      app.platforms.includes('linux')
    );
  }
  return app.platforms.includes(platform);
}

function searchableText(app: StoreApp): string {
  return [
    app.name,
    app.developer,
    app.tagline,
    app.description,
    app.category,
    app.license,
    ...app.platforms,
    ...app.sourceIds,
    ...app.highlights,
  ]
    .join(' ')
    .toLowerCase();
}

export function filterApps(filters: AppFilters = {}): readonly StoreApp[] {
  const query = (filters.query ?? '').trim().toLowerCase();
  const category = filters.category ?? 'all';
  const platform = filters.platform ?? 'all';
  const source = filters.source ?? 'all';
  const sort = filters.sort ?? 'relevance';

  const results = STORE_APPS.filter((app) => {
    if (query.length > 0 && !searchableText(app).includes(query)) return false;
    if (category !== 'all' && app.category !== category) return false;
    if (!matchesPlatform(app, platform)) return false;
    if (source !== 'all' && !app.sourceIds.includes(source)) return false;
    if (filters.openSourceOnly === true && !app.openSource) return false;
    if (filters.verifiedOnly === true && app.verification !== 'verified') return false;
    if (filters.enabledSources !== undefined) {
      const visibleBridge = app.sourceIds.find((id) => filters.enabledSources?.[id] === true);
      if (visibleBridge === undefined) return false;
    }
    return true;
  });

  return [...results].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'sources') return b.sourceIds.length - a.sourceIds.length;
    if (sort === 'fresh') {
      return Number(b.fresh ?? false) - Number(a.fresh ?? false) || a.name.localeCompare(b.name);
    }
    const score = (app: StoreApp): number =>
      Number(app.featured ?? false) * 6 +
      Number(app.trending ?? false) * 4 +
      Number(app.editorsChoice ?? false) * 3 +
      Number(app.fresh ?? false) * 2 +
      app.sourceIds.length;
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
}

export function featuredApps(): readonly StoreApp[] {
  return STORE_APPS.filter((app) => app.featured === true);
}

export function trendingApps(): readonly StoreApp[] {
  return STORE_APPS.filter((app) => app.trending === true);
}

export function freshApps(): readonly StoreApp[] {
  return STORE_APPS.filter((app) => app.fresh === true || app.updateReady === true);
}

export function appsWithUpdates(): readonly StoreApp[] {
  return STORE_APPS.filter((app) => app.updateReady === true);
}

export function similarApps(app: StoreApp, limit = 6): readonly StoreApp[] {
  return STORE_APPS.filter(
    (candidate) =>
      candidate.id !== app.id &&
      (candidate.category === app.category ||
        candidate.sourceIds.some((source) => app.sourceIds.includes(source))),
  )
    .sort(
      (a, b) =>
        Number(b.category === app.category) - Number(a.category === app.category) ||
        b.sourceIds.filter((source) => app.sourceIds.includes(source)).length -
          a.sourceIds.filter((source) => app.sourceIds.includes(source)).length,
    )
    .slice(0, limit);
}

export function catalogStats(): {
  readonly apps: number;
  readonly liveSources: number;
  readonly bridges: number;
  readonly platforms: number;
  readonly openSource: number;
} {
  return {
    apps: STORE_APPS.length,
    liveSources: BRIDGES.filter((bridge) => bridge.mode === 'live').length,
    bridges: BRIDGES.length,
    platforms: new Set(STORE_APPS.flatMap((app) => app.platforms)).size,
    openSource: STORE_APPS.filter((app) => app.openSource).length,
  };
}

export function sourceNames(ids: readonly BridgeId[]): readonly string[] {
  return ids.map((id) => BRIDGES.find((bridge) => bridge.id === id)?.name ?? id);
}
