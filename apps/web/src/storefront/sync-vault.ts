import { resolveRuntimeConfig } from '../lib/runtime.js';
import type { PersistedState } from './state.js';

export const SYNC_VAULT_STORAGE_KEY = 'orbisyn.sync-v1';
const PAIRING_PREFIX = 'orbisyn-sync-v1:';
const MAX_SYNC_ATTEMPTS = 4;

export interface SyncVaultCredentials {
  readonly id: string;
  readonly credential: string;
  readonly key: string;
  readonly revision: number;
  readonly baseState: PersistedState | null;
}

interface PairingPayload {
  readonly version: 1;
  readonly id: string;
  readonly credential: string;
  readonly key: string;
}

interface RemoteSnapshot {
  readonly id: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export function createSyncVaultCredentials(): SyncVaultCredentials {
  const credential = randomBase64Url(32);
  const key = randomBase64Url(32);
  return {
    id: crypto.randomUUID(),
    credential,
    key,
    revision: 0,
    baseState: null,
  };
}

export function encodeSyncPairing(credentials: SyncVaultCredentials): string {
  const payload: PairingPayload = {
    version: 1,
    id: credentials.id,
    credential: credentials.credential,
    key: credentials.key,
  };
  return `${PAIRING_PREFIX}${encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

export function decodeSyncPairing(input: string): SyncVaultCredentials {
  const raw = input.trim();
  if (!raw.startsWith(PAIRING_PREFIX)) throw new Error('This is not an Orbisyn sync pairing code.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(raw.slice(PAIRING_PREFIX.length))),
    );
  } catch {
    throw new Error('The pairing code is malformed or truncated.');
  }
  if (typeof parsed !== 'object' || parsed === null)
    throw new Error('The pairing code is invalid.');
  const value = parsed as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !isUuid(value.id) ||
    typeof value.credential !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.credential) ||
    typeof value.key !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.key)
  ) {
    throw new Error('The pairing code has an unsupported format.');
  }
  return {
    id: value.id,
    credential: value.credential,
    key: value.key,
    revision: 0,
    baseState: null,
  };
}

export function readSyncVaultCredentials(): SyncVaultCredentials | null {
  try {
    const raw = localStorage.getItem(SYNC_VAULT_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<SyncVaultCredentials>;
    if (
      typeof value.id !== 'string' ||
      !isUuid(value.id) ||
      typeof value.credential !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.credential) ||
      typeof value.key !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.key) ||
      typeof value.revision !== 'number'
    ) {
      return null;
    }
    return {
      id: value.id,
      credential: value.credential,
      key: value.key,
      revision: value.revision,
      baseState: isPersistedState(value.baseState) ? value.baseState : null,
    };
  } catch {
    return null;
  }
}

export function saveSyncVaultCredentials(credentials: SyncVaultCredentials): void {
  localStorage.setItem(SYNC_VAULT_STORAGE_KEY, JSON.stringify(credentials));
}

export async function syncVaultState(
  localState: PersistedState,
  initial: SyncVaultCredentials,
): Promise<{ readonly state: PersistedState; readonly credentials: SyncVaultCredentials }> {
  let credentials = initial;
  let remote = await fetchRemote(credentials);

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
    const remoteState = remote === null ? null : await decryptSnapshot(credentials.key, remote);
    const merged =
      remoteState === null
        ? localState
        : mergePersistedState(credentials.baseState, localState, remoteState);
    const encrypted = await encryptSnapshot(credentials.key, merged);
    const response = await fetch(syncVaultUrl(credentials.id), {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${credentials.credential}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: remote?.revision ?? 0,
        ...encrypted,
      }),
    });

    if (response.status === 409) {
      remote = await fetchRemote(credentials);
      continue;
    }
    if (response.status === 401) {
      throw new Error(
        'The sync pairing was rejected. Re-import the pairing code from your trusted device.',
      );
    }
    if (!response.ok) throw new Error(`Sync failed with HTTP ${response.status}.`);

    const saved = (await response.json()) as { revision?: unknown };
    if (typeof saved.revision !== 'number')
      throw new Error('The sync gateway returned an invalid revision.');
    credentials = { ...credentials, revision: saved.revision, baseState: merged };
    return { state: merged, credentials };
  }

  throw new Error('Another device kept changing this vault. Try syncing again.');
}

function syncVaultUrl(id: string): string {
  const apiBase = resolveRuntimeConfig().apiBase;
  return `${apiBase}/sync-vaults/${encodeURIComponent(id)}`;
}

async function fetchRemote(credentials: SyncVaultCredentials): Promise<RemoteSnapshot | null> {
  const response = await fetch(syncVaultUrl(credentials.id), {
    headers: { authorization: `Bearer ${credentials.credential}`, accept: 'application/json' },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Could not read the sync vault (HTTP ${response.status}).`);
  const value = (await response.json()) as Partial<RemoteSnapshot>;
  if (
    value.id !== credentials.id ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string' ||
    typeof value.revision !== 'number' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('The sync gateway returned an invalid snapshot.');
  }
  return value as RemoteSnapshot;
}

async function encryptSnapshot(
  keyText: string,
  state: PersistedState,
): Promise<{ readonly iv: string; readonly ciphertext: string }> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeBase64Url(keyText)),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, state }));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(bytes),
  );
  return { iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(new Uint8Array(cipher)) };
}

async function decryptSnapshot(keyText: string, snapshot: RemoteSnapshot): Promise<PersistedState> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(decodeBase64Url(keyText)),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(decodeBase64Url(snapshot.iv)) },
      key,
      toArrayBuffer(decodeBase64Url(snapshot.ciphertext)),
    );
    const value = JSON.parse(new TextDecoder().decode(plain)) as unknown;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 1 ||
      !('state' in value) ||
      !isPersistedState(value.state)
    ) {
      throw new Error('unsupported snapshot format');
    }
    return value.state;
  } catch (error) {
    throw new Error(
      'This vault cannot be decrypted. Check that you imported the complete pairing code.',
      { cause: error },
    );
  }
}

/** Three-way, field-level merge. Local wins only when both devices changed the same value. */
export function mergePersistedState(
  base: PersistedState | null,
  local: PersistedState,
  remote: PersistedState,
): PersistedState {
  if (base === null) return mergeValue({}, local, remote) as PersistedState;
  return mergeValue(base, local, remote) as PersistedState;
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(local, remote)) return local;
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;

  if (Array.isArray(base) || Array.isArray(local) || Array.isArray(remote)) {
    return mergeArray(
      Array.isArray(base) ? base : [],
      Array.isArray(local) ? local : [],
      Array.isArray(remote) ? remote : [],
    );
  }
  if (isPlainObject(base) || isPlainObject(local) || isPlainObject(remote)) {
    const baseObject = isPlainObject(base) ? base : {};
    const localObject = isPlainObject(local) ? local : {};
    const remoteObject = isPlainObject(remote) ? remote : {};
    const result: Record<string, unknown> = {};
    for (const key of new Set([
      ...Object.keys(baseObject),
      ...Object.keys(localObject),
      ...Object.keys(remoteObject),
    ])) {
      const value = mergeValue(baseObject[key], localObject[key], remoteObject[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  return local;
}

function mergeArray(
  base: readonly unknown[],
  local: readonly unknown[],
  remote: readonly unknown[],
): unknown[] {
  if ([...base, ...local, ...remote].every((item) => isPlainObject(item) && 'id' in item)) {
    const baseMap = new Map(base.map((item) => [(item as { id: string }).id, item]));
    const localMap = new Map(local.map((item) => [(item as { id: string }).id, item]));
    const remoteMap = new Map(remote.map((item) => [(item as { id: string }).id, item]));
    const merged: unknown[] = [];
    for (const id of new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()])) {
      const value = mergeValue(baseMap.get(id), localMap.get(id), remoteMap.get(id));
      if (value !== undefined) merged.push(value);
    }
    return merged;
  }

  const baseSet = new Set(base.map(stableStringify));
  const localMap = new Map(local.map((value) => [stableStringify(value), value]));
  const remoteMap = new Map(remote.map((value) => [stableStringify(value), value]));
  const merged = new Map<string, unknown>();
  for (const key of new Set([...baseSet, ...localMap.keys(), ...remoteMap.keys()])) {
    const inBase = baseSet.has(key);
    const inLocal = localMap.has(key);
    const inRemote = remoteMap.has(key);
    const include = inLocal === inRemote ? inLocal : inLocal === inBase ? inRemote : inLocal;
    if (include) merged.set(key, localMap.get(key) ?? remoteMap.get(key));
  }
  return [...merged.values()];
}

function equal(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!isPlainObject(entry)) return entry;
    return Object.fromEntries(
      Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedState(value: unknown): value is PersistedState {
  if (!isPlainObject(value)) return false;
  return (
    isPlainObject(value.installed) &&
    Array.isArray(value.wishlist) &&
    Array.isArray(value.tracked) &&
    Array.isArray(value.ignoredUpdates) &&
    Array.isArray(value.collections) &&
    Array.isArray(value.customSources) &&
    Array.isArray(value.externalApps) &&
    isPlainObject(value.sourceEnabled) &&
    isPlainObject(value.settings) &&
    Array.isArray(value.notifications) &&
    typeof value.onboardingSeen === 'boolean'
  );
}

function randomBase64Url(length: number): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
