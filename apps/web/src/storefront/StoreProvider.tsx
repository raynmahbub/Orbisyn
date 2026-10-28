import type { Dispatch, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { BRIDGE_BY_ID } from './data/sources.js';
import {
  INITIAL_STATE,
  persistedState,
  readPersistedState,
  type StoreAction,
  storeReducer,
  writePersistedState,
} from './state.js';
import type {
  BridgeId,
  Collection,
  CustomSource,
  ExternalApp,
  Settings,
  StoreApp,
  StoreState,
  StoreToast,
} from './types.js';

export interface StoreContextValue {
  readonly state: StoreState;
  readonly dispatch: Dispatch<StoreAction>;
  readonly showToast: (toast: Omit<StoreToast, 'id'>) => void;
  readonly notify: (title: string, message: string, tone?: 'success' | 'info' | 'warning') => void;
  readonly install: (app: StoreApp, kind?: 'install' | 'update') => void;
  readonly updateAll: (apps: readonly StoreApp[]) => void;
  readonly clearCompletedJobs: () => void;
  readonly toggleWishlist: (appId: string) => void;
  readonly toggleTrack: (appId: string) => void;
  readonly toggleIgnoreUpdate: (appId: string) => void;
  readonly toggleAutoUpdateApp: (appId: string) => void;
  readonly togglePinApp: (appId: string) => void;
  readonly uninstall: (appId: string) => void;
  readonly toggleSource: (sourceId: BridgeId) => void;
  readonly addCustomSource: (source: CustomSource) => void;
  readonly updateCustomSourceStatus: (id: string, status: CustomSource['status']) => void;
  readonly removeCustomSource: (id: string) => void;
  readonly importExternalApps: (apps: readonly ExternalApp[]) => void;
  readonly addCollection: (collection: Collection) => void;
  readonly removeCollection: (id: string) => void;
  readonly toggleCollectionApp: (collectionId: string, appId: string) => void;
  readonly updateSettings: (patch: Partial<Settings>) => void;
  readonly setOnboardingSeen: (seen: boolean) => void;
  readonly exportState: () => string;
  readonly importState: (value: unknown) => boolean;
  readonly resetDemo: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function createId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function preferredSource(app: StoreApp, state: StoreState): BridgeId {
  return (
    app.sourceIds.find((id) => state.sourceEnabled[id] === true) ?? app.sourceIds[0] ?? 'forge'
  );
}

type ImportCandidate = Partial<StoreState> | { readonly data: Partial<StoreState> };

function isImportedState(value: unknown): value is ImportCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if ('data' in candidate) {
    return (
      typeof candidate.data === 'object' && candidate.data !== null && 'settings' in candidate.data
    );
  }
  return 'settings' in candidate;
}

export function StoreProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, INITIAL_STATE, (base) =>
    storeReducer(base, { type: 'IMPORT_STATE', state: readPersistedState() }),
  );

  useEffect(() => {
    writePersistedState(state);
  }, [state]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const applyTheme = (): void => {
      const theme =
        state.settings.theme === 'system'
          ? media.matches
            ? 'light'
            : 'dark'
          : state.settings.theme;
      document.documentElement.dataset.theme = theme;
      document.body.dataset.density = state.settings.compact ? 'compact' : 'comfortable';
      document.documentElement.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'full';
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [state.settings.theme, state.settings.compact, state.settings.reducedMotion]);

  const hasActiveJobs = state.queue.some((job) => job.status === 'active');
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      dispatch({ type: 'TICK', now: new Date().toISOString() });
    }, 260);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  const firstToastId = state.toasts[0]?.id;
  useEffect(() => {
    if (firstToastId === undefined) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'DISMISS_TOAST', id: firstToastId });
    }, 4400);
    return () => window.clearTimeout(timer);
  }, [firstToastId]);

  const value = useMemo<StoreContextValue>(() => {
    const showToast = (toast: Omit<StoreToast, 'id'>): void => {
      dispatch({ type: 'ADD_TOAST', toast: { ...toast, id: createId('toast') } });
    };

    const notify = (
      title: string,
      message: string,
      tone: 'success' | 'info' | 'warning' = 'info',
    ): void => {
      dispatch({
        type: 'ADD_NOTIFICATION',
        notification: {
          id: createId('notification'),
          title,
          message,
          tone,
          read: false,
          createdAt: new Date().toISOString(),
        },
      });
    };

    const install = (app: StoreApp, kind: 'install' | 'update' = 'install'): void => {
      const active = state.queue.some((job) => job.appId === app.id && job.status === 'active');
      if (active) {
        showToast({
          tone: 'info',
          title: 'Already in the queue',
          message: `${app.name} is being processed. Open the queue to follow progress.`,
        });
        return;
      }
      dispatch({
        type: 'START_JOB',
        job: {
          id: createId('job'),
          appId: app.id,
          appName: app.name,
          version: app.demoVersion,
          sourceId: preferredSource(app, state),
          kind,
          progress: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      });
    };

    return {
      state,
      dispatch,
      showToast,
      notify,
      install,
      updateAll: (apps) => {
        let queued = 0;
        for (const app of apps) {
          const active = state.queue.some((job) => job.appId === app.id && job.status === 'active');
          if (active) continue;
          install(app, 'update');
          queued += 1;
        }
        if (queued === 0) {
          showToast({
            tone: 'info',
            title: 'Nothing to queue',
            message: 'All selected updates are already being processed.',
          });
        }
      },
      clearCompletedJobs: () => dispatch({ type: 'CLEAR_COMPLETED' }),
      toggleWishlist: (appId) => dispatch({ type: 'TOGGLE_WISHLIST', appId }),
      toggleTrack: (appId) => dispatch({ type: 'TOGGLE_TRACK', appId }),
      toggleIgnoreUpdate: (appId) => dispatch({ type: 'TOGGLE_IGNORE_UPDATE', appId }),
      toggleAutoUpdateApp: (appId) => dispatch({ type: 'TOGGLE_AUTO_UPDATE_APP', appId }),
      togglePinApp: (appId) => dispatch({ type: 'TOGGLE_PIN_APP', appId }),
      uninstall: (appId) => dispatch({ type: 'UNINSTALL', appId }),
      toggleSource: (sourceId) => dispatch({ type: 'TOGGLE_SOURCE', sourceId }),
      addCustomSource: (source) => dispatch({ type: 'ADD_CUSTOM_SOURCE', source }),
      updateCustomSourceStatus: (id, status) =>
        dispatch({ type: 'UPDATE_CUSTOM_SOURCE_STATUS', id, status }),
      removeCustomSource: (id) => dispatch({ type: 'REMOVE_CUSTOM_SOURCE', id }),
      importExternalApps: (apps) => dispatch({ type: 'IMPORT_EXTERNAL', apps }),
      addCollection: (collection) => dispatch({ type: 'ADD_COLLECTION', collection }),
      removeCollection: (id) => dispatch({ type: 'REMOVE_COLLECTION', id }),
      toggleCollectionApp: (collectionId, appId) =>
        dispatch({ type: 'TOGGLE_COLLECTION_APP', collectionId, appId }),
      updateSettings: (patch) => dispatch({ type: 'UPDATE_SETTINGS', patch }),
      setOnboardingSeen: (seen) => dispatch({ type: 'SET_ONBOARDING_SEEN', seen }),
      exportState: () =>
        JSON.stringify(
          {
            format: 'orbisyn-store-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: persistedState(state),
          },
          null,
          2,
        ),
      importState: (raw) => {
        if (!isImportedState(raw)) return false;
        const payload = 'data' in raw ? raw.data : raw;
        if (!('settings' in payload)) return false;
        dispatch({ type: 'IMPORT_STATE', state: payload });
        return true;
      },
      resetDemo: () => dispatch({ type: 'RESET' }),
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (context === null) throw new Error('useStore must be used inside StoreProvider');
  return context;
}

export function sourceLabel(sourceId: BridgeId): string {
  return BRIDGE_BY_ID[sourceId]?.name ?? sourceId;
}
