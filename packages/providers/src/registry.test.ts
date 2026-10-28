import { describe, expect, it } from 'vitest';
import { createProviderRegistry, listProviderDescriptors } from './registry.js';

describe('createProviderRegistry', () => {
  it('detects the structured provider for forge references', () => {
    const registry = createProviderRegistry();
    expect(registry.detect('https://github.com/bitwarden/android')?.descriptor.kind).toBe('github');
    expect(registry.detect('gitlab.com/KDE/kdenlive')?.descriptor.kind).toBe('gitlab');
    expect(registry.detect('https://codeberg.org/forgejo/forgejo')?.descriptor.kind).toBe(
      'codeberg',
    );
    expect(registry.detect('org.fdroid.fdroid')?.descriptor.kind).toBe('fdroid');
  });

  it('sends an unrecognised download URL to the direct-url provider', () => {
    const registry = createProviderRegistry();
    expect(registry.detect('https://mirror.example.org/app-1.0.0.apk')?.descriptor.kind).toBe(
      'direct-url',
    );
  });

  it('refuses self-hosted forge hosts until they are configured', () => {
    const registry = createProviderRegistry();
    expect(() => registry.detect('https://forgejo.example.org/team/project')).toThrowError(
      /ORBISYN_FORGE_HOSTS/,
    );
  });

  it('enables a self-hosted forge host when it is configured', () => {
    const registry = createProviderRegistry({ extraForgeHosts: ['forgejo.example.org'] });
    const provider = registry.detect('https://forgejo.example.org/team/project');
    expect(provider?.descriptor.kind).toBe('forgejo');
    expect(provider?.descriptor.homepage).toBe('https://forgejo.example.org');
  });

  it('never claims an OSP identity URI', () => {
    expect(createProviderRegistry().detect('osp://bitwarden-android')).toBeNull();
  });

  it('exposes lookup by kind and a stable descriptor list', () => {
    const registry = createProviderRegistry();
    expect(registry.get('github')?.descriptor.kind).toBe('github');
    expect(registry.get('direct-url')?.descriptor.kind).toBe('direct-url');
    expect(listProviderDescriptors(registry).map((descriptor) => descriptor.kind)).toEqual([
      'codeberg',
      'direct-url',
      'fdroid',
      'github',
      'gitlab',
    ]);
  });

  it('registers direct-url last so it cannot swallow forge references', () => {
    const registry = createProviderRegistry();
    const kinds = registry.all().map((provider) => provider.descriptor.kind);
    expect(kinds.at(-1)).toBe('direct-url');
  });
});
