import { BRIDGES } from './data/sources.js';
import type {
  BridgeId,
  Collection,
  CustomSource,
  ExternalApp,
  InstallJob,
  Settings,
  StoreNotification,
  StoreState,
  StoreToast,
} from './types.js';

export const STORE_STORAGE_KEY = 'orbisyn.store.v1';

const DEMO_NOW = '2026-10-27T09:00:00.000Z';

const DEFAULT_SOURCE_ENABLED: Readonly<Record<BridgeId, boolean>> = Object.fromEntries(
  BRIDGES.map((bridge) => [bridge.id, bridge.enabledByDefault]),
) as Readonly<Record<BridgeId, boolean>>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  compact: false,
  reducedMotion: false,
  autoUpdate: true,
  wifiOnly: true,
  prereleases: false,
  parallelDownloads: false,
  installMethod: 'system',
  signatureCheck: true,
  checksumCheck: true,
  sourcePinning: true,
  quarantineUnknown: true,
  telemetry: false,
  gatewayUrl: '/api',
};

const INITIAL_COLLECTIONS: readonly Collection[] = [
  {
    id: 'daily-drivers',
    name: 'Daily drivers',
    description: 'The essential apps installed on every new device.',
    appIds: ['localsend', 'bitwarden', 'firefox', 'joplin', 'organic-maps'],
    color: '#7c8cff',
  },
  {
    id: 'creative-studio',
    name: 'Creative studio',
    description: 'Open tools for image, video, 3D and streaming work.',
    appIds: ['blender', 'krita', 'obs-studio', 'gimp', 'image-toolbox'],
    color: '#f58bd8',
  },
];

const INITIAL_NOTIFICATIONS: readonly StoreNotification[] = [
  {
    id: 'welcome',
    title: 'Welcome to Orbisyn',
    message: 'Your library is local to this browser. Connect sources whenever you are ready.',
    createdAt: DEMO_NOW,
    read: false,
    tone: 'info',
  },
  {
    id: 'updates',
    title: 'Updates are waiting',
    message: 'Several installed apps have newer preview builds from their pinned sources.',
    createdAt: DEMO_NOW,
    read: false,
    tone: 'warning',
  },
  {
    id: 'privacy',
    title: 'No account required',
    message: 'Browsing works without sign-in and telemetry stays off.',
    createdAt: DEMO_NOW,
    read: false,
    tone: 'success',
  },
];

export const INITIAL_STATE: StoreState = {
  installed: {
    bitwarden: {
      appId: 'bitwarden',
      version: '2026.9.4',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
    signal: {
      appId: 'signal',
      version: '7.31.4',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
    vscode: {
      appId: 'vscode',
      version: '1.105.2',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: false,
      pinned: true,
    },
    blender: {
      appId: 'blender',
      version: '4.5.3',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
    antennapod: {
      appId: 'antennapod',
      version: '3.7.4',
      sourceId: 'droidify',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
    vlc: {
      appId: 'vlc',
      version: '3.6.3',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
    'organic-maps': {
      appId: 'organic-maps',
      version: '2026.09.28',
      sourceId: 'forge',
      installedAt: DEMO_NOW,
      autoUpdate: true,
      pinned: false,
    },
  },
  wishlist: ['ente', 'heroic', 'appflowy', 'aves'],
  tracked: ['localsend', 'newpipe', 'image-toolbox', 'gadgetbridge'],
  ignoredUpdates: [],
  collections: INITIAL_COLLECTIONS,
  customSources: [],
  externalApps: [],
  sourceEnabled: DEFAULT_SOURCE_ENABLED,
  settings: DEFAULT_SETTINGS,
  queue: [],
  toasts: [],
  notifications: INITIAL_NOTIFICATIONS,
  onboardingSeen: false,
};

export type PersistedState = Pick<
  StoreState,
  | 'installed'
  | 'wishlist'
  | 'tracked'
  | 'ignoredUpdates'
  | 'collections'
  | 'customSources'
  | 'externalApps'
  | 'sourceEnabled'
  | 'settings'
  | 'notifications'
  | 'onboardingSeen'
>;

export type StoreAction =
  | { readonly type: 'IMPORT_STATE'; readonly state: Partial<PersistedState> }
  | { readonly type: 'RESET' }
  | { readonly type: 'START_JOB'; readonly job: InstallJob }
  | { readonly type: 'TICK'; readonly now: string }
  | { readonly type: 'CLEAR_COMPLETED' }
  | { readonly type: 'ADD_TOAST'; readonly toast: StoreToast }
  | { readonly type: 'DISMISS_TOAST'; readonly id: string }
  | { readonly type: 'ADD_NOTIFICATION'; readonly notification: StoreNotification }
  | { readonly type: 'MARK_NOTIFICATIONS_READ' }
  | { readonly type: 'TOGGLE_WISHLIST'; readonly appId: string }
  | { readonly type: 'TOGGLE_TRACK'; readonly appId: string }
  | { readonly type: 'TOGGLE_IGNORE_UPDATE'; readonly appId: string }
  | { readonly type: 'TOGGLE_AUTO_UPDATE_APP'; readonly appId: string }
  | { readonly type: 'TOGGLE_PIN_APP'; readonly appId: string }
  | { readonly type: 'UNINSTALL'; readonly appId: string }
  | { readonly type: 'TOGGLE_SOURCE'; readonly sourceId: BridgeId }
  | { readonly type: 'ADD_CUSTOM_SOURCE'; readonly source: CustomSource }
  | {
      readonly type: 'UPDATE_CUSTOM_SOURCE_STATUS';
      readonly id: string;
      readonly status: CustomSource['status'];
    }
  | { readonly type: 'REMOVE_CUSTOM_SOURCE'; readonly id: string }
  | { readonly type: 'IMPORT_EXTERNAL'; readonly apps: readonly ExternalApp[] }
  | { readonly type: 'ADD_COLLECTION'; readonly collection: Collection }
  | { readonly type: 'REMOVE_COLLECTION'; readonly id: string }
  | {
      readonly type: 'TOGGLE_COLLECTION_APP';
      readonly collectionId: string;
      readonly appId: string;
    }
  | { readonly type: 'UPDATE_SETTINGS'; readonly patch: Partial<Settings> }
  | { readonly type: 'SET_ONBOARDING_SEEN'; readonly seen: boolean };

function toggleString(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'IMPORT_STATE':
      return {
        ...state,
        ...action.state,
        settings: { ...DEFAULT_SETTINGS, ...(action.state.settings ?? {}) },
        sourceEnabled: { ...DEFAULT_SOURCE_ENABLED, ...(action.state.sourceEnabled ?? {}) },
        queue: [],
        toasts: [],
      };
    case 'RESET':
      return { ...INITIAL_STATE, queue: [], toasts: [] };
    case 'START_JOB':
      return {
        ...state,
        queue: [...state.queue, action.job],
        toasts: [
          ...state.toasts.slice(-2),
          {
            id: `toast-${action.job.id}`,
            tone: 'info',
            title: action.job.kind === 'update' ? 'Update queued' : 'Install queued',
            message: `${action.job.appName} ${action.job.version} is being verified against its source.`,
          },
        ],
      };
    case 'TICK': {
      const installed = { ...state.installed };
      const toasts = [...state.toasts];
      const notifications = [...state.notifications];
      const queue = state.queue.map((job) => {
        if (job.status !== 'active') return job;
        const nextProgress = Math.min(100, job.progress + 9 + (job.progress % 5));
        if (nextProgress < 100) return { ...job, progress: nextProgress };
        installed[job.appId] = {
          appId: job.appId,
          version: job.version,
          sourceId: job.sourceId,
          installedAt: action.now,
          autoUpdate: state.settings.autoUpdate,
          pinned: state.installed[job.appId]?.pinned ?? false,
        };
        const title = job.kind === 'update' ? 'Update complete' : 'Install complete';
        toasts.push({
          id: `toast-done-${job.id}`,
          tone: 'success',
          title,
          message: `${job.appName} ${job.version} is now in your local library.`,
        });
        notifications.unshift({
          id: `notification-${job.id}`,
          title,
          message: `${job.appName} ${job.version} completed from the ${job.sourceId} source.`,
          createdAt: action.now,
          read: false,
          tone: 'success',
        });
        return { ...job, progress: 100, status: 'done' as const };
      });
      return { ...state, installed, queue, toasts, notifications: notifications.slice(0, 30) };
    }
    case 'CLEAR_COMPLETED':
      return { ...state, queue: state.queue.filter((job) => job.status === 'active') };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) };
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.notification, ...state.notifications].slice(0, 30),
      };
    case 'MARK_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map((notification) => ({
          ...notification,
          read: true,
        })),
      };
    case 'TOGGLE_WISHLIST':
      return { ...state, wishlist: toggleString(state.wishlist, action.appId) };
    case 'TOGGLE_TRACK':
      return { ...state, tracked: toggleString(state.tracked, action.appId) };
    case 'TOGGLE_IGNORE_UPDATE':
      return { ...state, ignoredUpdates: toggleString(state.ignoredUpdates, action.appId) };
    case 'TOGGLE_AUTO_UPDATE_APP': {
      const entry = state.installed[action.appId];
      if (entry === undefined) return state;
      return {
        ...state,
        installed: {
          ...state.installed,
          [action.appId]: { ...entry, autoUpdate: !entry.autoUpdate },
        },
      };
    }
    case 'TOGGLE_PIN_APP': {
      const entry = state.installed[action.appId];
      if (entry === undefined) return state;
      return {
        ...state,
        installed: { ...state.installed, [action.appId]: { ...entry, pinned: !entry.pinned } },
      };
    }
    case 'UNINSTALL': {
      const installed = { ...state.installed };
      delete installed[action.appId];
      return { ...state, installed };
    }
    case 'TOGGLE_SOURCE':
      return {
        ...state,
        sourceEnabled: {
          ...state.sourceEnabled,
          [action.sourceId]: !state.sourceEnabled[action.sourceId],
        },
      };
    case 'ADD_CUSTOM_SOURCE':
      return {
        ...state,
        customSources: [action.source, ...state.customSources].slice(0, 40),
      };
    case 'UPDATE_CUSTOM_SOURCE_STATUS':
      return {
        ...state,
        customSources: state.customSources.map((source) =>
          source.id === action.id ? { ...source, status: action.status } : source,
        ),
      };
    case 'REMOVE_CUSTOM_SOURCE':
      return {
        ...state,
        customSources: state.customSources.filter((source) => source.id !== action.id),
      };
    case 'IMPORT_EXTERNAL': {
      const known = new Set(state.externalApps.map((app) => app.id));
      const additions = action.apps.filter((app) => !known.has(app.id));
      return { ...state, externalApps: [...additions, ...state.externalApps].slice(0, 200) };
    }
    case 'ADD_COLLECTION':
      return { ...state, collections: [...state.collections, action.collection] };
    case 'REMOVE_COLLECTION':
      return {
        ...state,
        collections: state.collections.filter((collection) => collection.id !== action.id),
      };
    case 'TOGGLE_COLLECTION_APP':
      return {
        ...state,
        collections: state.collections.map((collection) =>
          collection.id === action.collectionId
            ? { ...collection, appIds: toggleString(collection.appIds, action.appId) }
            : collection,
        ),
      };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'SET_ONBOARDING_SEEN':
      return { ...state, onboardingSeen: action.seen };
    default:
      return state;
  }
}

export function persistedState(state: StoreState): PersistedState {
  return {
    installed: state.installed,
    wishlist: state.wishlist,
    tracked: state.tracked,
    ignoredUpdates: state.ignoredUpdates,
    collections: state.collections,
    customSources: state.customSources,
    externalApps: state.externalApps,
    sourceEnabled: state.sourceEnabled,
    settings: state.settings,
    notifications: state.notifications,
    onboardingSeen: state.onboardingSeen,
  };
}

export function readPersistedState(): Partial<PersistedState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<PersistedState>;
  } catch {
    return {};
  }
}

export function writePersistedState(state: StoreState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(persistedState(state)));
  } catch {
    // Private browsing or a full quota should never break the store.
  }
}
