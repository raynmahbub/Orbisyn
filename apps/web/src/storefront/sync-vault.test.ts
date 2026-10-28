import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGatewayOverride } from '../lib/runtime.js';
import { DEFAULT_SETTINGS, INITIAL_STATE, persistedState } from './state.js';
import {
  createSyncVaultCredentials,
  decodeSyncPairing,
  encodeSyncPairing,
  mergePersistedState,
  syncVaultState,
} from './sync-vault.js';

const empty = persistedState(INITIAL_STATE);

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('encrypted sync vault', () => {
  it('creates portable pairing codes without exporting a device revision or library snapshot', () => {
    const credentials = createSyncVaultCredentials();
    const pairing = encodeSyncPairing(credentials);
    const imported = decodeSyncPairing(pairing);

    expect(imported).toMatchObject({
      id: credentials.id,
      credential: credentials.credential,
      key: credentials.key,
      revision: 0,
      baseState: null,
    });
    expect(pairing).toMatch(/^orbisyn-sync-v1:/);
    expect(() => decodeSyncPairing(`${pairing.slice(0, -3)}xxx`)).toThrow(/pairing code/i);
  });

  it('merges independent device changes and preserves deletions relative to the common base', () => {
    const base = {
      ...empty,
      wishlist: ['keep', 'remove-on-device-a'],
      tracked: ['existing'],
      settings: { ...DEFAULT_SETTINGS, compact: false },
    };
    const local = {
      ...base,
      wishlist: ['keep', 'local-only'],
      settings: { ...base.settings, compact: true },
    };
    const remote = {
      ...base,
      wishlist: ['keep', 'remote-only', 'remove-on-device-a'],
      tracked: ['existing', 'remote-track'],
    };

    expect(mergePersistedState(base, local, remote)).toMatchObject({
      wishlist: ['keep', 'local-only', 'remote-only'],
      tracked: ['existing', 'remote-track'],
      settings: { compact: true },
    });
  });

  it('merges independent library records and uses local values for simultaneous edits', () => {
    const base = {
      ...empty,
      sourceEnabled: { ...empty.sourceEnabled, forge: true },
      installed: {},
    };
    const local = {
      ...base,
      sourceEnabled: { ...base.sourceEnabled, forge: false },
      installed: {
        localsend: {
          appId: 'localsend',
          version: '1.0.0',
          sourceId: 'forge' as const,
          installedAt: '2026-10-01T00:00:00.000Z',
          autoUpdate: true,
          pinned: false,
        },
      },
    };
    const remote = {
      ...base,
      sourceEnabled: { ...base.sourceEnabled, forge: false },
      tracked: ['remote-app'],
    };

    expect(mergePersistedState(base, local, remote)).toMatchObject({
      sourceEnabled: { forge: false },
      tracked: ['remote-app'],
      installed: { localsend: { version: '1.0.0' } },
    });
  });

  it('uses the configured gateway for encrypted vault reads and writes', async () => {
    vi.stubGlobal('crypto', webcrypto);
    setGatewayOverride('https://sync.example.org');
    const requests: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' });
      if (init?.method === undefined) {
        return { status: 401, ok: false, json: async () => ({ error: 'unauthorized' }) };
      }
      return { status: 200, ok: true, json: async () => ({ revision: 1 }) };
    });

    const credentials = createSyncVaultCredentials();
    const result = await syncVaultState(empty, credentials);

    expect(result.credentials.revision).toBe(1);
    expect(requests).toEqual([
      {
        url: `https://sync.example.org/api/sync-vaults/${credentials.id}`,
        method: 'GET',
      },
      {
        url: `https://sync.example.org/api/sync-vaults/${credentials.id}`,
        method: 'PUT',
      },
    ]);
  });
});
