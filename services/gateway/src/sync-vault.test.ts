import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSyncVaultStore, createMemorySyncVaultStore } from './sync-vault.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = 'a'.repeat(43);
const OTHER_CREDENTIAL = 'b'.repeat(43);
const ENCRYPTED = {
  iv: 'c'.repeat(16),
  ciphertext: 'd'.repeat(32),
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function nextRevision(expectedRevision = 0, ciphertext = ENCRYPTED.ciphertext) {
  return {
    id: ID,
    credential: CREDENTIAL,
    expectedRevision,
    iv: ENCRYPTED.iv,
    ciphertext,
  };
}

describe('memory sync vault store', () => {
  it('authorizes with the pairing credential and uses compare-and-swap revisions', async () => {
    const store = createMemorySyncVaultStore();
    const saved = await store.put(nextRevision());
    expect(saved.record).toMatchObject({ id: ID, revision: 1, ciphertext: ENCRYPTED.ciphertext });
    expect(await store.get(ID, CREDENTIAL)).toMatchObject({ revision: 1 });
    expect(await store.get(ID, OTHER_CREDENTIAL)).toBeNull();

    const stale = await store.put(nextRevision(0, 'e'.repeat(32)));
    expect(stale).toEqual({ record: null, conflict: true });
    const rejected = await store.put({ ...nextRevision(1), credential: OTHER_CREDENTIAL });
    expect(rejected).toEqual({ record: null, conflict: false });

    const updated = await store.put(nextRevision(1, 'f'.repeat(32)));
    expect(updated.record).toMatchObject({ revision: 2, ciphertext: 'f'.repeat(32) });
  });
});

describe('file sync vault store', () => {
  it('persists opaque ciphertext and refuses to expose it without the credential', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orbisyn-sync-vault-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'vaults.json');
    const first = await createFileSyncVaultStore(filePath);
    await first.put(nextRevision());

    const savedContents = await readFile(filePath, 'utf8');
    expect(savedContents).toContain(ENCRYPTED.ciphertext);
    expect(savedContents).not.toContain(CREDENTIAL);

    const restarted = await createFileSyncVaultStore(filePath);
    expect(await restarted.get(ID, OTHER_CREDENTIAL)).toBeNull();
    expect(await restarted.get(ID, CREDENTIAL)).toMatchObject({ revision: 1 });
  });

  it('serializes concurrent revisions so stale writes cannot replace newer data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orbisyn-sync-cas-'));
    temporaryDirectories.push(directory);
    const store = await createFileSyncVaultStore(join(directory, 'vaults.json'));
    const firstWrite = store.put(nextRevision());
    const conflictingWrite = store.put(nextRevision(0, 'e'.repeat(32)));
    const results = await Promise.all([firstWrite, conflictingWrite]);

    expect(results.map((result) => result.conflict)).toEqual([false, true]);
    expect(await store.get(ID, CREDENTIAL)).toMatchObject({
      revision: 1,
      ciphertext: ENCRYPTED.ciphertext,
    });
  });
});
