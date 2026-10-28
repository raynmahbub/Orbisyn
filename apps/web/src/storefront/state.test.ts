import { beforeEach, describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  persistedState,
  readPersistedState,
  STORE_STORAGE_KEY,
  storeReducer,
  writePersistedState,
} from './state.js';
import type { CustomSource, InstallJob, StoreState } from './types.js';

const NOW = '2026-10-27T12:00:00.000Z';

function job(kind: InstallJob['kind'], id: string): InstallJob {
  return {
    id,
    appId: 'localsend',
    appName: 'LocalSend',
    version: '1.17.0',
    sourceId: 'forge',
    kind,
    progress: 0,
    status: 'active',
    createdAt: NOW,
  };
}

function finishJobs(state: StoreState): StoreState {
  let current = state;
  for (let tick = 0; tick < 12; tick += 1) {
    if (!current.queue.some((entry) => entry.status === 'active')) break;
    current = storeReducer(current, { type: 'TICK', now: NOW });
  }
  return current;
}

const customSource: CustomSource = {
  id: 'source-1',
  name: 'Campus Forge',
  url: 'https://github.com/campus/apps',
  kind: 'forge',
  bridgeId: 'forge',
  addedAt: NOW,
  status: 'pending',
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('storefront reducer', () => {
  it('queues an install, completes its ticks and records the local library entry', () => {
    const queued = storeReducer(INITIAL_STATE, { type: 'START_JOB', job: job('install', 'job-1') });
    expect(queued.queue).toHaveLength(1);
    expect(queued.toasts.at(-1)?.title).toBe('Install queued');

    const completed = finishJobs(queued);
    expect(completed.queue[0]?.status).toBe('done');
    expect(completed.installed.localsend).toMatchObject({
      appId: 'localsend',
      version: '1.17.0',
      sourceId: 'forge',
      autoUpdate: true,
    });
    expect(completed.notifications[0]?.title).toBe('Install complete');
  });

  it('distinguishes update jobs from installs', () => {
    const queued = storeReducer(INITIAL_STATE, { type: 'START_JOB', job: job('update', 'job-2') });
    expect(queued.toasts.at(-1)?.title).toBe('Update queued');

    const completed = finishJobs(queued);
    expect(completed.notifications[0]?.title).toBe('Update complete');
    expect(completed.installed.localsend?.version).toBe('1.17.0');
  });

  it('toggles wishlist entries without mutating the initial state', () => {
    const removed = storeReducer(INITIAL_STATE, {
      type: 'TOGGLE_WISHLIST',
      appId: 'ente',
    });
    const added = storeReducer(removed, { type: 'TOGGLE_WISHLIST', appId: 'blender' });

    expect(removed.wishlist).not.toContain('ente');
    expect(added.wishlist).toContain('blender');
    expect(INITIAL_STATE.wishlist).toContain('ente');
    expect(INITIAL_STATE.wishlist).not.toContain('blender');
  });

  it('merges settings patches and updates custom source verification state', () => {
    const withSettings = storeReducer(INITIAL_STATE, {
      type: 'UPDATE_SETTINGS',
      patch: { theme: 'light', compact: true, signatureCheck: false },
    });
    expect(withSettings.settings).toMatchObject({
      theme: 'light',
      compact: true,
      signatureCheck: false,
      gatewayUrl: '/api',
    });

    const withSource = storeReducer(INITIAL_STATE, {
      type: 'ADD_CUSTOM_SOURCE',
      source: customSource,
    });
    const verified = storeReducer(withSource, {
      type: 'UPDATE_CUSTOM_SOURCE_STATUS',
      id: customSource.id,
      status: 'connected',
    });
    expect(verified.customSources[0]?.status).toBe('connected');
    expect(withSource.customSources[0]?.status).toBe('pending');
  });

  it('imports a partial backup while clearing transient jobs and toasts', () => {
    const transient = storeReducer(INITIAL_STATE, {
      type: 'START_JOB',
      job: job('install', 'job-3'),
    });
    const imported = storeReducer(transient, {
      type: 'IMPORT_STATE',
      state: {
        settings: { ...INITIAL_STATE.settings, theme: 'system' },
        wishlist: ['signal'],
        onboardingSeen: true,
      },
    });

    expect(imported.settings.theme).toBe('system');
    expect(imported.settings.gatewayUrl).toBe('/api');
    expect(imported.wishlist).toEqual(['signal']);
    expect(imported.onboardingSeen).toBe(true);
    expect(imported.queue).toEqual([]);
    expect(imported.toasts).toEqual([]);
  });

  it('persists only durable data and reads it back from localStorage', () => {
    const state = storeReducer(INITIAL_STATE, {
      type: 'UPDATE_SETTINGS',
      patch: { theme: 'light' },
    });
    const durable = persistedState(state);

    expect(durable).not.toHaveProperty('queue');
    expect(durable).not.toHaveProperty('toasts');
    expect(durable.settings.theme).toBe('light');

    writePersistedState(state);
    expect(window.localStorage.getItem(STORE_STORAGE_KEY)).not.toBeNull();
    expect(readPersistedState().settings?.theme).toBe('light');

    window.localStorage.setItem(STORE_STORAGE_KEY, 'not json');
    expect(readPersistedState()).toEqual({});
  });
});
