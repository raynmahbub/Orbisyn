import { z } from 'zod';
import { IsoDateTimeSchema, OspIdSchema } from './primitive.js';

/**
 * Curated lists and the sync envelope that keeps them consistent across
 * devices without a server round trip for every keystroke.
 */

export const CollectionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(512).optional(),
  appIds: z.array(OspIdSchema).max(512),
  visibility: z.enum(['private', 'unlisted', 'public']),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionDraftSchema = CollectionSchema.pick({
  name: true,
  description: true,
  appIds: true,
  visibility: true,
}).partial({ description: true, appIds: true, visibility: true });
export type CollectionDraft = z.infer<typeof CollectionDraftSchema>;

/**
 * A single mutation in a sync stream. Conflicts are resolved by comparing
 * `updatedAt` per entity; ties are surfaced to the user instead of being
 * silently overwritten.
 */
export const SyncOperationSchema = z.object({
  id: z.string().min(1).max(64),
  entity: z.enum(['collection', 'favorite', 'setting', 'history', 'update-queue']),
  op: z.enum(['upsert', 'delete']),
  entityId: z.string().min(1).max(128),
  payload: z.unknown().optional(),
  updatedAt: IsoDateTimeSchema,
  deviceId: z.string().min(1).max(64),
  /** Set once the gateway has accepted the operation. */
  acknowledgedAt: IsoDateTimeSchema.optional(),
});
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncRequestSchema = z.object({
  deviceId: z.string().min(1).max(64),
  cursor: z.string().max(256).nullable(),
  operations: z.array(SyncOperationSchema).max(500),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncConflictSchema = z.object({
  entityId: z.string().max(128),
  localUpdatedAt: IsoDateTimeSchema,
  remoteUpdatedAt: IsoDateTimeSchema,
  resolution: z.enum(['local-wins', 'remote-wins', 'manual']),
});

export const SyncResponseSchema = z.object({
  cursor: z.string().max(256),
  applied: z.array(z.string().max(64)),
  rejected: z.array(z.object({ id: z.string().max(64), reason: z.string().max(512) })),
  conflicts: z.array(SyncConflictSchema),
  /** Authoritative state the client should merge in. */
  collections: z.array(CollectionSchema),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
