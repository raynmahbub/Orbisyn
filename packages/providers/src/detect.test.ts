import { describe, expect, it } from 'vitest';
import { parseRef } from './detect.js';

describe('parseRef', () => {
  it('classifies OSP identity URIs', () => {
    const ref = parseRef('osp://bitwarden-android');
    expect(ref.kind).toBe('osp-uri');
    expect(ref.path).toBe('bitwarden-android');
  });

  it('classifies F-Droid package references', () => {
    expect(parseRef('fdroid:org.fdroid.fdroid').kind).toBe('package');
    expect(parseRef('org.fdroid.fdroid').kind).toBe('package');
    expect(parseRef('https://f-droid.org/en/packages/com.termux/').hint).toBe(
      'F-Droid package page',
    );
  });

  it('classifies forge URLs and keeps the host', () => {
    const ref = parseRef('https://codeberg.org/forgejo/forgejo');
    expect(ref.kind).toBe('url');
    expect(ref.host).toBe('codeberg.org');
    expect(ref.segments).toEqual(['forgejo', 'forgejo']);
  });

  it('classifies owner/repository shorthand as GitHub', () => {
    const ref = parseRef('bitwarden/android');
    expect(ref.kind).toBe('shorthand');
    expect(ref.host).toBe('github.com');
    expect(ref.hint).toContain('shorthand');
  });

  it('classifies a plain word as unknown', () => {
    expect(parseRef('passwords').kind).toBe('unknown');
  });
});
