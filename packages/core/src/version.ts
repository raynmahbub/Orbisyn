/**
 * Version semantics.
 *
 * Upstream projects are inconsistent: CalVer, SemVer, `1.2.3-beta.1`,
 * `v2.0-rc3`, `2024.10.1-nightly`. Orbisyn needs a total order that is
 * *stable* and *explainable*, so this module implements a tolerant parser and a
 * documented comparator rather than delegating to a strict SemVer library.
 */

import { DomainError } from './errors.js';
import type { ReleaseChannel } from './model.js';

export interface ParsedVersion {
  /** Original text, unchanged. */
  readonly raw: string;
  /** Numbers extracted from the core of the version, left to right. */
  readonly core: readonly number[];
  readonly prerelease: readonly (string | number)[];
  readonly build: string | undefined;
  readonly channel: ReleaseChannel;
  readonly isCalver: boolean;
  readonly isValid: boolean;
}

const PRERELEASE_KEYWORDS: ReadonlyArray<readonly [ReleaseChannel, RegExp]> = [
  ['nightly', /^(nightly|dev|snapshot|canary|edge)/i],
  ['rc', /^(rc|cr|candidate)/i],
  ['beta', /^(beta|b\d*)/i],
  ['beta', /^(alpha|a\d*|pre|preview)/i],
];

const CALVER_PATTERN = /^\d{4}\.\d{1,2}(\.\d{1,2})?/;

/**
 * Parses a version string leniently. Never throws: callers that need to reject
 * unparseable versions should check `isValid` or call {@link requireVersion}.
 */
export function parseVersion(input: string): ParsedVersion {
  const raw = input.trim();
  const withoutV = raw.replace(/^v(?=\d)/i, '');
  const [withoutBuild, build] = splitOnce(withoutV, '+');

  // SemVer's own separator is the authoritative split point; everything after
  // the first `-` is a pre-release, everything before it is the numeric core.
  const dashIndex = withoutBuild.indexOf('-');
  const coreText = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex);
  const prereleaseText = dashIndex === -1 ? '' : withoutBuild.slice(dashIndex + 1);

  const core: number[] = [];
  const prereleaseTokens: string[] = [];
  let numericPhase = true;

  for (const segment of coreText.split('.').filter((part) => part.length > 0)) {
    const match = numericPhase ? /^(\d+)(.*)$/.exec(segment) : null;
    if (match !== null) {
      core.push(Number.parseInt(match[1] as string, 10));
      const remainder = match[2] ?? '';
      if (remainder.length > 0) {
        // `1.2.3beta` and friends: the tail is a pre-release, not a number.
        numericPhase = false;
        prereleaseTokens.push(remainder);
      }
      continue;
    }
    numericPhase = false;
    prereleaseTokens.push(segment);
  }

  prereleaseTokens.push(...prereleaseText.split(/[.\-_]/).filter((token) => token.length > 0));

  const prerelease: (string | number)[] = [];
  let channel: ReleaseChannel | null = null;
  for (const token of prereleaseTokens) {
    if (channel === null) {
      for (const [candidate, pattern] of PRERELEASE_KEYWORDS) {
        if (pattern.test(token)) {
          channel = candidate;
          break;
        }
      }
    }
    prerelease.push(/^\d+$/.test(token) ? Number.parseInt(token, 10) : token.toLowerCase());
  }

  const isValid = core.length > 0;
  const resolvedChannel: ReleaseChannel = !isValid
    ? 'unknown'
    : (channel ?? channelForUnlabelledPrerelease(prerelease));

  return {
    raw,
    core,
    prerelease,
    build: build.length > 0 ? build : undefined,
    channel: resolvedChannel,
    isCalver: CALVER_PATTERN.test(coreText),
    isValid,
  };
}

/**
 * Releases such as `v1.21.11-1` or `2.1.60-1` use a trailing number as a
 * *packaging revision*, not as a pre-release marker — every Forgejo, Debian and
 * Anki build looks like this. Treating them as pre-releases would hide the
 * current stable build from stable-channel users, so a purely numeric suffix
 * keeps the release on the stable channel. Anything containing a word
 * (`-rc1`, `-alpha`, `-nightly`) is still classified as a pre-release.
 */
function channelForUnlabelledPrerelease(prerelease: readonly (string | number)[]): ReleaseChannel {
  if (prerelease.length === 0) return 'stable';
  return prerelease.every((token) => typeof token === 'number') ? 'stable' : 'unknown';
}

export function requireVersion(input: string): ParsedVersion {
  const parsed = parseVersion(input);
  if (!parsed.isValid) {
    throw DomainError.invalidRelease(input, 'no numeric component found');
  }
  return parsed;
}

/**
 * Total order over versions. Pre-release identifiers sort *before* the
 * corresponding stable release, numeric identifiers before alphanumeric ones,
 * and a version with more prerelease fields wins ties — the SemVer rules,
 * extended to the CalVer and dated forms seen in the wild.
 *
 * Returns a negative number when `a` is older than `b`.
 */
export function compareVersions(a: string, b: string): number {
  const left = requireVersion(a);
  const right = requireVersion(b);

  const length = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < length; index += 1) {
    const l = left.core[index] ?? 0;
    const r = right.core[index] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }

  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (right.prerelease.length === 0 && left.prerelease.length > 0) return -1;

  const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < prereleaseLength; index += 1) {
    const l = left.prerelease[index];
    const r = right.prerelease[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    if (typeof l === 'number' && typeof r === 'number') return l < r ? -1 : 1;
    if (typeof l === 'number') return -1;
    if (typeof r === 'number') return 1;
    return l < r ? -1 : 1;
  }

  return 0;
}

export function isNewer(candidate: string, current: string | null | undefined): boolean {
  if (current === null || current === undefined || current.trim().length === 0) return true;
  try {
    return compareVersions(candidate, current) > 0;
  } catch {
    // An unparseable baseline must not hide an update; fall back to inequality.
    return candidate.trim() !== current.trim();
  }
}

export function sortByVersionDesc<T>(
  items: readonly T[],
  select: (item: T) => string,
): readonly T[] {
  return [...items].sort((left, right) => {
    const a = parseVersion(select(left));
    const b = parseVersion(select(right));
    if (a.isValid && b.isValid) {
      const byVersion = compareVersions(b.raw, a.raw);
      if (byVersion !== 0) return byVersion;
    }
    return 0;
  });
}

export function detectChannel(input: string, isPrereleaseHint = false): ReleaseChannel {
  const parsed = parseVersion(input);
  if (!parsed.isValid) return 'unknown';
  if (parsed.channel !== 'stable') return parsed.channel;
  return isPrereleaseHint ? 'unknown' : 'stable';
}

export function toSemver(input: string): string | undefined {
  const parsed = parseVersion(input);
  if (!parsed.isValid) return undefined;
  const [major = 0, minor = 0, patch = 0] = parsed.core;
  const prerelease = parsed.prerelease.length > 0 ? `-${parsed.prerelease.join('.')}` : '';
  const build = parsed.build === undefined ? '' : `+${parsed.build}`;
  return `${major}.${minor}.${patch}${prerelease}${build}`;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, ''];
  return [value.slice(0, index), value.slice(index + separator.length)];
}
