import { z } from 'zod';

/**
 * Error envelope. Every non-2xx response from the gateway uses this shape so a
 * client can render a useful message without parsing prose or stack traces.
 */

export const ApiErrorCodeSchema = z.enum([
  'bad-request',
  'validation-failed',
  'not-found',
  'conflict',
  'unsupported-source',
  'upstream-unavailable',
  'rate-limited',
  'unauthorized',
  'payload-too-large',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().max(1024),
    /** Field-level validation issues, keyed by JSON pointer when available. */
    details: z.record(z.string(), z.array(z.string().max(512))).optional(),
    retryAfterSeconds: z.number().int().min(0).optional(),
  }),
  requestId: z.string().max(64),
  timestamp: z.iso.datetime({ offset: true }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string().max(32),
  uptimeSeconds: z.number().min(0),
  providers: z.array(
    z.object({
      kind: z.string().max(32),
      state: z.enum(['enabled', 'disabled']),
      lastFailureAt: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
  store: z.enum(['memory', 'file', 'postgres']),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
