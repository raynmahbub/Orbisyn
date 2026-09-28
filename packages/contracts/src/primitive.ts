import { z } from 'zod';

/**
 * Primitives shared by every Orbisyn wire schema.
 *
 * Anything that crosses a process boundary — HTTP, plugin RPC, persisted cache —
 * is described here and validated at the boundary. Domain types inside
 * `@orbisyn/core` are plain TypeScript; they only become schemas at the edge.
 */

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/i, 'ids are url-safe identifiers');

/**
 * Canonical ecosystem identity. Also the anchor of an `osp://` URI.
 *
 * @example "github.com/bitwarden/android" -> "bitwarden-android"
 */
export const OspIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'osp ids are lowercase, hyphen separated');

export const UrlSchema = z.url({ protocol: /^https?$/ });

export const Http1xxRangeSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

export const SemverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    'expected a semantic version',
  );

export const LicenseSchema = z
  .string()
  .min(1)
  .max(64)
  .describe('SPDX identifier when detectable, otherwise the upstream label verbatim');

export const ChecksumSchema = z.object({
  algorithm: z.enum(['sha256', 'sha512', 'sha1', 'md5']),
  value: z.string().min(8),
});

/**
 * Platform targets Orbisyn can reason about. `web` covers progressive web apps
 * and static bundles that are not distributed through an app store.
 */
export const PlatformSchema = z.enum(['android', 'ios', 'macos', 'windows', 'linux', 'web']);
export type Platform = z.infer<typeof PlatformSchema>;

export const ArchitectureSchema = z.enum([
  'universal',
  'arm64',
  'armv7',
  'x86_64',
  'x86',
  'wasm',
  'unknown',
]);
export type Architecture = z.infer<typeof ArchitectureSchema>;

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(256).optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().min(0).optional(),
  });
}
