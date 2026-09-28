import { DomainError } from '@orbisyn/core';
import type { z } from 'zod';

/**
 * Outbound validation.
 *
 * Responses are validated against the same schema the SDK parses them with, so a
 * bug in an adapter surfaces here — as a 500 with the offending field — instead
 * of on a user's device as an unparseable payload. The failure is *ours*, which
 * is why it maps to `invariant-violated` (500) rather than a 400.
 */
export function parseOutbound<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issues = result.error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '_'}: ${issue.message}`);

  throw DomainError.invariant(`gateway produced an invalid ${label} payload`, { issues });
}
