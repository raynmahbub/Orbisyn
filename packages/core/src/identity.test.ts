import { describe, expect, it } from 'vitest';
import {
  deriveAppId,
  disambiguateAppId,
  forgeKindForHost,
  looksLikeUrl,
  parseSourceUrl,
  slugify,
  sourceFingerprint,
} from './identity.js';

describe('parseSourceUrl', () => {
  it('accepts bare hosts, clone URLs and trailing slashes', () => {
    expect(parseSourceUrl('github.com/bitwarden/android').host).toBe('github.com');
    expect(parseSourceUrl('https://github.com/bitwarden/android/').path).toBe('bitwarden/android');
    expect(parseSourceUrl('git@github.com:bitwarden/android.git').path).toBe('bitwarden/android');
    expect(parseSourceUrl('https://GitHub.com/Bitwarden/Android').host).toBe('github.com');
  });

  it('drops query strings and fragments', () => {
    expect(parseSourceUrl('https://codeberg.org/forgejo/forgejo?tab=releases').segments).toEqual([
      'forgejo',
      'forgejo',
    ]);
  });
});

describe('looksLikeUrl', () => {
  it('distinguishes references from search terms', () => {
    expect(looksLikeUrl('https://github.com/bitwarden/android')).toBe(true);
    expect(looksLikeUrl('github.com/bitwarden/android')).toBe(true);
    expect(looksLikeUrl('password manager')).toBe(false);
  });
});

describe('deriveAppId', () => {
  it('uses owner and repository for forges', () => {
    expect(deriveAppId('github.com', 'bitwarden/android', 'fallback')).toBe('bitwarden-android');
    expect(deriveAppId('gitlab.com', 'KDE/kdenlive', 'fallback')).toBe('kde-kdenlive');
  });

  it('handles nested GitLab namespaces deterministically', () => {
    expect(deriveAppId('gitlab.com', 'group/subgroup/project', 'fallback')).toBe(
      'subgroup-project',
    );
  });

  it('derives package ids for F-Droid', () => {
    expect(deriveAppId('f-droid.org', 'packages/org.fdroid.fdroid', 'fallback')).toBe(
      'fdroid-org-fdroid-fdroid',
    );
  });

  it('falls back to the last path segment', () => {
    expect(deriveAppId('downloads.example.org', 'files/tool-2.0', 'fallback')).toBe('tool-2-0');
    expect(deriveAppId('example.org', '', 'example')).toBe('example');
  });
});

describe('slugify', () => {
  it('produces url-safe, hyphenated ids', () => {
    expect(slugify('Café Bär!!')).toBe('cafe-bar');
    expect(slugify('---')).toBe('unknown');
  });
});

describe('disambiguateAppId', () => {
  it('is deterministic and keeps ids short enough for the schema', () => {
    const first = disambiguateAppId('bitwarden-android', 'github.com', 'fork/android');
    const second = disambiguateAppId('bitwarden-android', 'github.com', 'fork/android');
    expect(first).toBe(second);
    expect(first).not.toBe('bitwarden-android');
    expect(first.length).toBeLessThanOrEqual(96);
  });
});

describe('sourceFingerprint', () => {
  it('ignores cosmetic differences between spellings', () => {
    expect(sourceFingerprint('GitHub.com', 'Bitwarden/Android.git')).toBe(
      'github.com/bitwarden/android',
    );
  });
});

describe('forgeKindForHost', () => {
  it('recognises self-managed instances', () => {
    expect(forgeKindForHost('codeberg.org')).toBe('codeberg');
    expect(forgeKindForHost('gitlab.gnome.org')).toBe('gitlab');
    expect(forgeKindForHost('forgejo.example.org')).toBe('forgejo');
    expect(forgeKindForHost('example.org')).toBeNull();
  });
});
