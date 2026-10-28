import { describe, expect, it } from 'vitest';
import { classifyArtifact, extensionFor, formatBytes } from './artifact.js';

describe('classifyArtifact', () => {
  it('recognises Android packages', () => {
    const result = classifyArtifact({ fileName: 'app-1.4.0.apk' });
    expect(result.platform).toBe('android');
    expect(result.installable).toBe(true);
    expect(result.architecture).toBe('universal');
  });

  it('recognises architectures from file names', () => {
    expect(classifyArtifact({ fileName: 'app-1.4.0-arm64-v8a.apk' }).architecture).toBe('arm64');
    expect(classifyArtifact({ fileName: 'app-1.4.0-armv7.apk' }).architecture).toBe('armv7');
    expect(classifyArtifact({ fileName: 'tool-2.0-x86_64.AppImage' }).architecture).toBe('x86_64');
    expect(classifyArtifact({ fileName: 'tool-2.0-universal.dmg' }).architecture).toBe('universal');
  });

  it('falls back to MIME evidence when the name says nothing', () => {
    const result = classifyArtifact({
      fileName: 'download',
      contentType: 'application/vnd.android.package-archive',
    });
    expect(result.platform).toBe('android');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('reports low confidence for unrecognised payloads', () => {
    const result = classifyArtifact({ fileName: 'release-notes.txt' });
    expect(result.platform).toBe('web');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.installable).toBe(false);
  });

  it('detects desktop and Linux formats', () => {
    expect(classifyArtifact({ fileName: 'Tool-2.0.msi' }).platform).toBe('windows');
    expect(classifyArtifact({ fileName: 'Tool-2.0.dmg' }).platform).toBe('macos');
    expect(classifyArtifact({ fileName: 'tool_2.0_amd64.deb' }).platform).toBe('linux');
    expect(classifyArtifact({ fileName: 'tool-2.0.pkg.tar.zst' }).platform).toBe('linux');
  });

  it('treats a bare source archive as a listing, not an installer', () => {
    const result = classifyArtifact({
      fileName: 'tool-2.0.tar.gz',
      contentType: 'application/gzip',
    });
    expect(result.installable).toBe(false);
  });
});

describe('extensionFor', () => {
  it('prefers the file name, then the MIME type', () => {
    expect(extensionFor('application/zip', 'bundle.tar.gz')).toBe('tar.gz');
    expect(extensionFor('application/x-debian-package', undefined)).toBe('deb');
    expect(extensionFor(undefined, undefined)).toBe('bin');
  });
});

describe('formatBytes', () => {
  it('formats human readable sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2048)).toBe('2.00 KiB');
    expect(formatBytes(15_728_640)).toBe('15.0 MiB');
    expect(formatBytes(undefined)).toBe('unknown size');
  });
});
