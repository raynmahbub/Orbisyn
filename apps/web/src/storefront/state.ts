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

export const INITIAL_STATE: StoreState = {
  installed: {},
  wishlist: [],
  tracked: [],
  ignoredUpdates: [],
  collections: [],
  customSources: [],
  externalApps: [],
  sourceEnabled: DEFAULT_SOURCE_ENABLED,
  settings: DEFAULT_SETTINGS,
  queue: [],
  toasts: [],
  notifications: [],
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
            title:
              action.job.kind === 'update' ? 'Update preview queued' : 'Install preview queued',
            message: 'This web preview does not download or install packages.',
          },
        ],
      };
    case 'TICK': {
      const toasts = [...state.toasts];
      const notifications = [...state.notifications];
      const queue = state.queue.map((job) => {
        if (job.status !== 'active') return job;
        const nextProgress = Math.min(100, job.progress + 9 + (job.progress % 5));
        if (nextProgress < 100) return { ...job, progress: nextProgress };
        const title =
          job.kind === 'update' ? 'Update preview finished' : 'Install preview finished';
        const message = `${job.appName} was not downloaded or installed; use the source links to continue on your platform.`;
        toasts.push({
          id: `toast-done-${job.id}`,
          tone: 'info',
          title,
          message,
        });
        notifications.unshift({
          id: `notification-${job.id}`,
          title,
          message,
          createdAt: action.now,
          read: false,
          tone: 'info',
        });
        return { ...job, progress: 100, status: 'done' as const };
      });
      return { ...state, queue, toasts, notifications: notifications.slice(0, 30) };
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
