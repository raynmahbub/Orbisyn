import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const VaultRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9-]{36}$/i),
  credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
  iv: z.string().min(16).max(64),
  ciphertext: z.string().min(24).max(1_500_000),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

const VaultFileSchema = z.object({
  version: z.literal(1),
  vaults: z.array(VaultRecordSchema).max(100_000),
});

export type SyncVaultRecord = z.infer<typeof VaultRecordSchema>;

export interface SyncVaultStore {
  get(id: string, credential: string): Promise<SyncVaultRecord | null>;
  put(input: {
    readonly id: string;
    readonly credential: string;
    readonly expectedRevision: number;
    readonly iv: string;
    readonly ciphertext: string;
  }): Promise<{ readonly record: SyncVaultRecord | null; readonly conflict: boolean }>;
}

/** In-memory implementation for tests and embedded development. */
export function createMemorySyncVaultStore(): SyncVaultStore {
  const vaults = new Map<string, SyncVaultRecord>();
  return {
    async get(id, credential) {
      const record = vaults.get(id);
      return record !== undefined && credentialsMatch(record.credentialHash, credential)
        ? record
        : null;
    },
    async put(input) {
      const existing = vaults.get(input.id);
      if (existing !== undefined && !credentialsMatch(existing.credentialHash, input.credential)) {
        return { record: null, conflict: false };
      }
      const revision = existing?.revision ?? 0;
      if (revision !== input.expectedRevision) return { record: null, conflict: true };
      const record: SyncVaultRecord = {
        id: input.id,
        credentialHash: existing?.credentialHash ?? hashCredential(input.credential),
        iv: input.iv,
        ciphertext: input.ciphertext,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      };
      vaults.set(record.id, record);
      return { record, conflict: false };
    },
  };
}

/**
 * Durable single-instance store for opaque end-to-end encrypted snapshots.
 * The gateway only retains a hash of the access credential and never receives
 * the client-side AES key. Updates use compare-and-swap revisions.
 */
export async function createFileSyncVaultStore(filePath: string): Promise<SyncVaultStore> {
  const absolutePath = resolve(filePath);
  const vaults = new Map<string, SyncVaultRecord>();
  let queue: Promise<void> = Promise.resolve();
  let contents: string;
  try {
    contents = await readFile(absolutePath, 'utf8');
  } catch (error) {
    if (!isMissingFile(error)) {
      throw new Error(`cannot read Orbisyn sync vaults at ${absolutePath}`, { cause: error });
    }
    contents = '';
  }
  if (contents.length > 0) {
    let input: unknown;
    try {
      input = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Orbisyn sync vault file at ${absolutePath} is not valid JSON`, {
        cause: error,
      });
    }
    const parsed = VaultFileSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Orbisyn sync vault file at ${absolutePath} is invalid`);
    }
    for (const record of parsed.data.vaults) vaults.set(record.id, record);
  }

  const read = async (id: string, credential: string): Promise<SyncVaultRecord | null> => {
    await queue;
    const record = vaults.get(id);
    return record !== undefined && credentialsMatch(record.credentialHash, credential)
      ? record
      : null;
  };
  const put = async (input: {
    readonly id: string;
    readonly credential: string;
    readonly expectedRevision: number;
    readonly iv: string;
    readonly ciphertext: string;
  }): Promise<{ readonly record: SyncVaultRecord | null; readonly conflict: boolean }> => {
    const task = queue.then(async () => {
      const existing = vaults.get(input.id);
      if (existing !== undefined && !credentialsMatch(existing.credentialHash, input.credential)) {
        return { record: null, conflict: false };
      }
      const revision = existing?.revision ?? 0;
      if (revision !== input.expectedRevision) return { record: null, conflict: true };
      const record: SyncVaultRecord = {
        id: input.id,
        credentialHash: existing?.credentialHash ?? hashCredential(input.credential),
        iv: input.iv,
        ciphertext: input.ciphertext,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      };
      vaults.set(record.id, record);
      try {
        await writeVaultFile(absolutePath, [...vaults.values()]);
        return { record, conflict: false };
      } catch (error) {
        if (existing === undefined) vaults.delete(input.id);
        else vaults.set(input.id, existing);
        throw error;
      }
    });
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  return { get: read, put };
}

function hashCredential(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

function credentialsMatch(expectedHash: string, credential: string): boolean {
  const supplied = Buffer.from(hashCredential(credential), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function writeVaultFile(
  filePath: string,
  records: readonly SyncVaultRecord[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ version: 1, vaults: records })}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(`cannot persist Orbisyn sync vaults at ${filePath}`, { cause: error });
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
