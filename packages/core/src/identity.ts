/**
 * Identity: how a source reference becomes a canonical, collision-free id, and
 * how duplicates across providers are detected.
 *
 * Rules are deterministic and documented because the id is the contract users
 * share (`osp://<id>`) and any change is a breaking change.
 */

export interface ParsedSourceUrl {
  readonly url: string;
  readonly protocol: 'https' | 'http';
  readonly host: string;
  readonly path: string;
  readonly segments: readonly string[];
}

const KNOWN_MULTI_SEGMENT_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'codeberg.org',
]);

/**
 * Hosts where `owner/project` is the addressing scheme. Self-hosted instances
 * (`gitlab.gnome.org`, `forgejo.example.org`) match by pattern.
 */
function isForgeHost(host: string): boolean {
  return KNOWN_MULTI_SEGMENT_HOSTS.has(host) || forgeKindForHost(host) !== null;
}

/** Hosts that are self-hosted instances of a forge; kept for the detector. */
const FORGE_HOST_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^gitlab\./i, 'gitlab'],
  [/^codeberg\./i, 'codeberg'],
  [/^forgejo\./i, 'forgejo'],
  [/^gitea\./i, 'forgejo'],
];

export function looksLikeUrl(input: string): boolean {
  return (
    /^(https?:\/\/|git@|ssh:\/\/)/i.test(input.trim()) ||
    /^[\w.-]+\.[a-z]{2,}\//i.test(input.trim())
  );
}

export function parseSourceUrl(input: string): ParsedSourceUrl {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^git@([^:]+):/i, '$1/')}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  return {
    url: `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, ''),
    protocol: url.protocol === 'http:' ? 'http' : 'https',
    host: url.host.toLowerCase(),
    path,
    segments: path.length === 0 ? [] : path.split('/').filter((segment) => segment.length > 0),
  };
}

export function forgeKindForHost(host: string): string | null {
  const normalized = host.toLowerCase().split(':')[0] ?? host;
  for (const [pattern, kind] of FORGE_HOST_PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }
  if (normalized === 'gitlab.com') return 'gitlab';
  if (normalized === 'codeberg.org') return 'codeberg';
  if (normalized === 'github.com') return 'github';
  return null;
}

/**
 * Derives the canonical Orbisyn id from a repository location.
 *
 * | Source                              | Id                        |
 * | ----------------------------------- | ------------------------- |
 * | github.com/bitwarden/android        | bitwarden-android         |
 * | gitlab.com/KDE/kdenlive             | kde-kdenlive              |
 * | forgejo.example.org/forgejo/forgejo | forgejo-forgejo           |
 * | f-droid.org/packages/org.fdroid.fdroid | fdroid-org-fdroid-fdroid |
 */
export function deriveAppId(host: string, path: string, fallback: string): string {
  const normalizedHost = host.toLowerCase().split(':')[0] ?? host;
  const segments = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((segment) => segment.length > 0);

  let candidate: string;
  if (
    normalizedHost.endsWith('f-droid.org') &&
    segments[0] === 'packages' &&
    segments[1] !== undefined
  ) {
    candidate = `fdroid-${segments.slice(1).join('-')}`;
  } else if (isForgeHost(normalizedHost) && segments.length >= 2) {
    // Forges namespace projects by owner, so the owner belongs in the id.
    candidate = segments.slice(-2).join('-');
  } else {
    // Anywhere else the last path segment is the artifact name; the leading
    // segments are download folders (`files`, `releases`, `download`).
    candidate = segments.at(-1) ?? fallback;
  }

  return slugify(candidate);
}

/**
 * Canonicalises an `osp://` URI.
 *
 *   osp://bitwarden-android                -> osp://bitwarden-android
 *   osp://github.com/bitwarden/android     -> osp://bitwarden-android
 *   osp://codeberg.org/forgejo/forgejo     -> osp://forgejo-forgejo
 *   osp://org.fdroid.fdroid                -> osp://fdroid-org-fdroid-fdroid
 *
 * Returns `null` for anything that is not an OSP URI we can express as an id.
 */
export function canonicalOspUri(input: string): string | null {
  const raw = input.trim();
  if (!/^osp:/i.test(raw)) return null;

  const body = raw
    .slice(raw.indexOf(':') + 1)
    .replace(/^\/\//, '')
    .split(/[?#]/)[0]
    ?.trim();
  if (body === undefined || body.length === 0) return null;

  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(body)) {
    // A bare reverse-DNS package name: F-Droid namespacing applies.
    return `osp://${deriveAppId('f-droid.org', `packages/${body}`, body)}`;
  }

  if (looksLikeUrl(body) || body.includes('/')) {
    try {
      const parsed = parseSourceUrl(body);
      return `osp://${deriveAppId(parsed.host, parsed.path, slugify(body))}`;
    } catch {
      return `osp://${slugify(body)}`;
    }
  }

  const id = slugify(body);
  return id === 'unknown' ? null : `osp://${id}`;
}

export function ospIdFromUri(input: string): string | null {
  return canonicalOspUri(input)?.replace('osp://', '') ?? null;
}

export function ospUriForId(id: string): string {
  return `osp://${id}`;
}

export function isOspUri(input: string): boolean {
  return canonicalOspUri(input) !== null;
}

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
    .slice(0, 96);
  return slug.length === 0 ? 'unknown' : slug;
}

/**
 * Collision-safe ids: when two distinct repositories would produce the same id
 * (forks, renamed remotes), the second one receives a deterministic suffix
 * derived from its host and path so that ids stay stable across runs.
 */
export function disambiguateAppId(candidate: string, host: string, path: string): string {
  const suffix = shortDigest(`${host.toLowerCase()}/${path.toLowerCase()}`);
  const base = candidate.slice(0, 96 - suffix.length - 1);
  return `${base}-${suffix}`;
}

/**
 * Duplicate detection key. Two provider records describing the same upstream
 * project must produce the same fingerprint, regardless of URL spelling.
 */
export function sourceFingerprint(host: string, path: string): string {
  const normalizedPath = path
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  return `${host.toLowerCase().split(':')[0]}/${normalizedPath}`;
}

/** Stable, dependency-free 32-bit FNV-1a hash rendered as base36. */
export function shortDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(6, '0').slice(0, 6);
}

export function formatMaintainerName(input: string): string {
  return input.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
