import type { AppRecord, Collection, Release } from '@orbisyn/core';
import { del, get, set } from 'idb-keyval';

/**
 * Device-local state.
 *
 * Orbisyn is offline first: the library, the update queue and the resolution
 * cache live on the device in IndexedDB, and the gateway is an accelerator
 * rather than a dependency. Nothing here is a source of truth about upstream
 * projects — only about *this* user.
 */

const KEYS = {
  favourites: 'orbisyn.favourites',
  installed: 'orbisyn.installed',
  collections: 'orbisyn.collections',
  cache: 'orbisyn.resolveCache',
  settings: 'orbisyn.settings',
  onboarding: 'orbisyn.onboardingSeen',
  history: 'orbisyn.history',
} as const;

export interface InstalledApp {
  readonly appId: string;
  readonly name: string;
  readonly version: string;
  readonly channel: 'stable' | 'beta' | 'rc' | 'nightly';
  readonly installedAt: string;
}

export interface CachedResolution {
  readonly app: AppRecord;
  readonly releases: readonly Release[];
  readonly storedAt: string;
  readonly expiresAt: string;
}

export interface UserSettings {
  readonly theme: 'dark' | 'light' | 'system';
  readonly defaultChannel: InstalledApp['channel'];
  readonly cacheTtlMinutes: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  defaultChannel: 'stable',
  cacheTtlMinutes: 60,
};

async function readArray<T>(key: string): Promise<T[]> {
  try {
    return (await get<T[]>(key)) ?? [];
  } catch {
    return [];
  }
}

async function writeArray<T>(key: string, value: readonly T[]): Promise<void> {
  try {
    await set(key, [...value]);
  } catch {
    // Storage can be unavailable (private mode, quota). The UI stays usable.
  }
}

export const localStore = {
  favourites: () => readArray<string>(KEYS.favourites),
  async toggleFavourite(appId: string): Promise<boolean> {
    const current = await readArray<string>(KEYS.favourites);
    const isFavourite = current.includes(appId);
    const next = isFavourite ? current.filter((id) => id !== appId) : [...current, appId];
    await writeArray(KEYS.favourites, next);
    return !isFavourite;
  },

  installed: () => readArray<InstalledApp>(KEYS.installed),
  async recordInstall(entry: InstalledApp): Promise<void> {
    const current = await readArray<InstalledApp>(KEYS.installed);
    await writeArray(KEYS.installed, [
      ...current.filter((item) => item.appId !== entry.appId),
      entry,
    ]);
  },
  async removeInstall(appId: string): Promise<void> {
    const current = await readArray<InstalledApp>(KEYS.installed);
    await writeArray(
      KEYS.installed,
      current.filter((item) => item.appId !== appId),
    );
  },

  collections: () => readArray<Collection>(KEYS.collections),
  async saveCollections(collections: readonly Collection[]): Promise<void> {
    await writeArray(KEYS.collections, collections);
  },

  history: () => readArray<string>(KEYS.history),
  async pushHistory(appId: string): Promise<void> {
    const current = await readArray<string>(KEYS.history);
    await writeArray(KEYS.history, [appId, ...current.filter((id) => id !== appId)].slice(0, 50));
  },

  async cacheResolution(
    key: string,
    entry: Omit<CachedResolution, 'storedAt' | 'expiresAt'>,
    ttlMinutes: number,
  ): Promise<void> {
    const existing = await readArray<{ key: string; entry: CachedResolution }>(KEYS.cache);
    const now = Date.now();
    const record = {
      key,
      entry: {
        ...entry,
        storedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
      },
    };
    await writeArray(
      KEYS.cache,
      [record, ...existing.filter((item) => item.key !== key)].slice(0, 200),
    );
  },

  async readResolution(key: string): Promise<CachedResolution | null> {
    const existing = await readArray<{ key: string; entry: CachedResolution }>(KEYS.cache);
    return existing.find((item) => item.key === key)?.entry ?? null;
  },

  async clearCache(): Promise<void> {
    try {
      await del(KEYS.cache);
    } catch {
      // ignore
    }
  },

  async settings(): Promise<UserSettings> {
    try {
      const stored = await get<Partial<UserSettings>>(KEYS.settings);
      return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      await set(KEYS.settings, settings);
    } catch {
      // ignore
    }
  },

  async onboardingSeen(): Promise<boolean> {
    try {
      return (await get<boolean>(KEYS.onboarding)) === true;
    } catch {
      return true;
    }
  },

  async markOnboardingSeen(): Promise<void> {
    try {
      await set(KEYS.onboarding, true);
    } catch {
      // ignore
    }
  },

  /** Everything the user owns, as a single portable document. */
  async exportData(): Promise<string> {
    const [favourites, installed, collections, settings] = await Promise.all([
      this.favourites(),
      this.installed(),
      this.collections(),
      this.settings(),
    ]);
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        schema: 'orbisyn.user-data/1',
        favourites,
        installed,
        collections,
        settings,
      },
      null,
      2,
    );
  },
};
