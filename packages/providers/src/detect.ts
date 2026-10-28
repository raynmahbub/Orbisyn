import { parseSourceUrl } from '@orbisyn/core';

/**
 * Reference classification.
 *
 * Users paste whatever they have: a browser URL, a clone URL, a package name, or
 * an `osp://` identity. `parseRef` normalises the input into one of five shapes
 * and records how confident we are — the registry uses the kind, the UI uses the
 * `hint` to explain what it is about to do.
 */

export type RefKind = 'url' | 'host-path' | 'shorthand' | 'package' | 'osp-uri' | 'unknown';

export interface ParsedRef {
  readonly raw: string;
  readonly kind: RefKind;
  readonly host: string;
  readonly path: string;
  readonly segments: readonly string[];
  readonly hint: string;
}

const OWNER_REPO = /^[\w.-]+\/[\w.-]+$/;
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,}$/i;

/**
 * Reverse-DNS package names look exactly like host names (`org.fdroid.fdroid`
 * vs `f-droid.org`). Three rules resolve the ambiguity without a suffix list:
 * three or more segments is always a package; two segments is a host when the
 * tail is a familiar TLD; otherwise a known vendor prefix wins.
 */
const COMMON_TLDS: ReadonlySet<string> = new Set([
  'com',
  'org',
  'net',
  'io',
  'dev',
  'app',
  'edu',
  'gov',
  'co',
  'me',
  'xyz',
  'info',
  'biz',
  'cloud',
  'tech',
  'uk',
  'us',
  'de',
  'fr',
  'jp',
  'cn',
  'ru',
  'br',
  'in',
  'bd',
  'au',
  'ca',
  'nl',
  'se',
  'ch',
  'it',
  'es',
  'pl',
  'cz',
]);

const VENDOR_PREFIXES: ReadonlySet<string> = new Set([
  'com',
  'org',
  'io',
  'net',
  'app',
  'dev',
  'me',
  'one',
  'co',
  'de',
  'fr',
  'ch',
  'at',
  'nl',
  'se',
  'gg',
  'tv',
  'xyz',
  'to',
  'si',
  'pl',
  'cz',
  'it',
  'es',
  'eu',
  'uk',
  'us',
  'in',
  'bd',
]);

function looksLikePackageName(value: string): boolean {
  if (!PACKAGE_NAME.test(value)) return false;
  const segments = value.toLowerCase().split('.');
  if (segments.length >= 3) return true;
  const [head = '', tail = ''] = segments;
  if (COMMON_TLDS.has(tail)) return false;
  return VENDOR_PREFIXES.has(head);
}

export function parseRef(reference: string): ParsedRef {
  const raw = reference.trim();

  if (/^osp:\/\//i.test(raw)) {
    return {
      raw,
      kind: 'osp-uri',
      host: '',
      path: raw.replace(/^osp:\/\//i, ''),
      segments: [],
      hint: 'Orbisyn identity',
    };
  }

  if (/^fdroid:/i.test(raw)) {
    return {
      raw,
      kind: 'package',
      host: 'f-droid.org',
      path: raw.replace(/^fdroid:/i, ''),
      segments: [raw.replace(/^fdroid:/i, '')],
      hint: 'F-Droid package',
    };
  }

  if (looksLikePackageName(raw)) {
    return {
      raw,
      kind: 'package',
      host: 'f-droid.org',
      path: raw,
      segments: [raw],
      hint: 'package identifier (F-Droid)',
    };
  }

  if (/^https?:\/\//i.test(raw) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) {
    try {
      const parsed = parseSourceUrl(raw);
      const host = parsed.host;
      if (host === 'f-droid.org' || host.endsWith('.f-droid.org')) {
        return {
          raw,
          kind: 'url',
          host,
          path: parsed.path,
          segments: parsed.segments,
          hint: 'F-Droid package page',
        };
      }
      return {
        raw,
        kind: 'url',
        host,
        path: parsed.path,
        segments: parsed.segments,
        hint: `repository on ${host}`,
      };
    } catch {
      return { raw, kind: 'unknown', host: '', path: '', segments: [], hint: 'unparseable URL' };
    }
  }

  if (OWNER_REPO.test(raw)) {
    const [owner = '', repo = ''] = raw.split('/');
    return {
      raw,
      kind: 'shorthand',
      host: 'github.com',
      path: `${owner}/${repo}`,
      segments: [owner, repo],
      hint: 'GitHub shorthand (owner/repository)',
    };
  }

  if (PACKAGE_NAME.test(raw)) {
    return {
      raw,
      kind: 'package',
      host: 'f-droid.org',
      path: raw,
      segments: [raw],
      hint: 'package identifier',
    };
  }

  return {
    raw,
    kind: 'unknown',
    host: '',
    path: '',
    segments: [],
    hint: 'not a recognised source',
  };
}
