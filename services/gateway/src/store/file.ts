import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppRecordSchema, CollectionSchema, ReleaseSchema } from '@orbisyn/contracts';
import type { AppStorePort } from '@orbisyn/core';
import { z } from 'zod';
import type { MemoryStoreSnapshot } from './memory.js';
import { createMemoryStore } from './memory.js';

const StoreSnapshotSchema = z
  .object({
    version: z.literal(1),
    apps: z
      .array(
        z.object({
          app: AppRecordSchema,
          releases: z.array(ReleaseSchema),
        }),
      )
      .max(10_000),
    collections: z.array(CollectionSchema).max(10_000),
    syncCursor: z.number().int().min(0),
  })
  .strict();

export interface FileStoreOptions {
  readonly filePath: string;
  readonly maxApps?: number;
}

export interface FileStoreBundle {
  readonly store: AppStorePort;
  readonly kind: 'file';
  readonly filePath: string;
}

/**
 * Durable single-process store for self-hosted deployments.
 *
 * Writes serialize through an in-process queue and replace the JSON snapshot
 * atomically, so a crash cannot leave a half-written store. This is intended for
 * one gateway instance and modest catalogs; use a database-backed adapter when
 * deploying multiple replicas or high write volumes.
 */
export async function createFileStore(options: FileStoreOptions): Promise<FileStoreBundle> {
  const filePath = resolve(options.filePath);
  const memory = createMemoryStore({ maxApps: options.maxApps });
  const saved = await readSnapshot(filePath);
  if (saved !== null) memory.restore(saved);

  let writes: Promise<void> = Promise.resolve();

  const read = <T>(operation: () => Promise<T>): Promise<T> => writes.then(operation);
  const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = writes.then(async () => {
      const before = memory.snapshot();
      try {
        const result = await operation();
        await writeSnapshot(filePath, memory.snapshot());
        return result;
      } catch (error) {
        memory.restore(before);
        throw error;
      }
    });
    writes = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  const store: AppStorePort = {
    saveApp: (app, releases) => mutate(() => memory.saveApp(app, releases)),
    findApp: (id) => read(() => memory.findApp(id)),
    findAppBySource: (fingerprint) => read(() => memory.findAppBySource(fingerprint)),
    search: (query) => read(() => memory.search(query)),
    listReleases: (appId, limit) => read(() => memory.listReleases(appId, limit)),
    saveCollection: (draft) => mutate(() => memory.saveCollection(draft)),
    listCollections: () => read(() => memory.listCollections()),
    applySync: (operations) => mutate(() => memory.applySync(operations)),
  };

  return { store, kind: 'file', filePath };
}

async function readSnapshot(filePath: string): Promise<MemoryStoreSnapshot | null> {
  let contents: string;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw new Error(`cannot read Orbisyn store at ${filePath}`, { cause: error });
  }

  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Orbisyn store at ${filePath} is not valid JSON`, { cause: error });
  }

  const parsed = StoreSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '_'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Orbisyn store at ${filePath} has an unsupported or invalid format: ${issues}`);
  }
  return parsed.data;
}

async function writeSnapshot(filePath: string, snapshot: MemoryStoreSnapshot): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(snapshot)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(`cannot persist Orbisyn store at ${filePath}`, { cause: error });
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
