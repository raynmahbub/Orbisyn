import { describe, expect, it } from 'vitest';
import { isOsiApproved, isPermissive, normalizeLicense } from './license.js';

describe('normalizeLicense', () => {
  it('maps human labels and deprecated identifiers to SPDX ids', () => {
    expect(normalizeLicense('MIT License').spdx).toBe('MIT');
    expect(normalizeLicense('GPL-3.0').spdx).toBe('GPL-3.0-or-later');
    expect(normalizeLicense('Apache 2.0').spdx).toBe('Apache-2.0');
    expect(normalizeLicense('GNU Affero General Public License v3.0').spdx).toBeNull();
  });

  it('recognises composite SPDX expressions', () => {
    const license = normalizeLicense('MIT OR Apache-2.0');
    expect(license.spdx).toBe('MIT OR Apache-2.0');
    expect(license.osiApproved).toBe(true);
    expect(license.copyleft).toBe('none');
  });

  it('keeps the strongest obligation of a composite expression', () => {
    expect(normalizeLicense('MIT AND AGPL-3.0').copyleft).toBe('network');
  });

  it('never guesses an unknown licence', () => {
    const license = normalizeLicense('Proprietary (free for personal use)');
    expect(license.spdx).toBeNull();
    expect(license.osiApproved).toBe(false);
    expect(license.copyleft).toBe('unknown');
    expect(license.id).toBe('Proprietary (free for personal use)');
  });

  it('treats missing input as unknown', () => {
    expect(normalizeLicense(null).id).toBe('unknown');
    expect(normalizeLicense('   ').id).toBe('unknown');
  });
});

describe('license policy helpers', () => {
  it('identifies OSI approved and permissive licences', () => {
    expect(isOsiApproved('MIT')).toBe(true);
    expect(isOsiApproved('Not a real licence')).toBe(false);
    expect(isPermissive('Apache-2.0')).toBe(true);
    expect(isPermissive('AGPL-3.0')).toBe(false);
  });
});
