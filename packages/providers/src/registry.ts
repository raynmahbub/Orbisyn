import type {
  ProviderDescriptor,
  ProviderRegistryPort,
  SourceKind,
  SourceProvider,
} from '@orbisyn/core';
import { DomainError } from '@orbisyn/core';
import { createDirectUrlProvider } from './adapters/direct-url.js';
import { createFdroidProvider } from './adapters/fdroid.js';
import {
  CODEBERG_CONFIG,
  createGiteaFamilyProvider,
  forgejoConfigForHost,
} from './adapters/gitea.js';
import { createGithubProvider } from './adapters/github.js';
import { createGitlabProvider } from './adapters/gitlab.js';
import { parseRef } from './detect.js';

/**
 * Provider registry.
 *
 * Detection is *ordered*, and the order is part of the contract:
 *
 * 1. forge adapters (structured APIs, richest records),
 * 2. F-Droid (package identifiers, verifiable artifacts),
 * 3. direct URL (anything else that is a real download).
 *
 * `direct-url` matches every absolute URL, so it must always come last —
 * otherwise it would swallow the forge references before they are recognised.
 */

export interface RegistryOptions {
  readonly github?: SourceProvider;
  readonly gitlab?: SourceProvider;
  readonly codeberg?: SourceProvider;
  readonly forgejo?: SourceProvider;
  readonly fdroid?: SourceProvider;
  readonly directUrl?: SourceProvider;
  /**
   * Extra self-hosted forges (`forgejo.example.org`, `gitea.example.org`).
   * Operators set this from configuration; the detector cannot guess them.
   */
  readonly extraForgeHosts?: readonly string[];
}

export function createProviderRegistry(options: RegistryOptions = {}): ProviderRegistryPort {
  const providers: SourceProvider[] = [
    options.github ?? createGithubProvider(),
    options.gitlab ?? createGitlabProvider(),
    options.codeberg ?? createGiteaFamilyProvider(CODEBERG_CONFIG),
    ...(options.extraForgeHosts ?? []).map((host) =>
      createGiteaFamilyProvider(forgejoConfigForHost(host)),
    ),
    ...(options.forgejo === undefined ? [] : [options.forgejo]),
    options.fdroid ?? createFdroidProvider(),
    // Last by construction: it accepts any absolute URL.
    options.directUrl ?? createDirectUrlProvider(),
  ];

  const byKind = new Map<SourceKind, SourceProvider>();
  for (const provider of providers) {
    // First registration wins: an injected provider always beats the default.
    if (!byKind.has(provider.descriptor.kind)) byKind.set(provider.descriptor.kind, provider);
  }

  return {
    all: () => [...providers],
    descriptors: () =>
      providers.map((provider) => provider.descriptor) as readonly ProviderDescriptor[],

    get(kind: SourceKind): SourceProvider | null {
      return byKind.get(kind) ?? null;
    },

    detect(reference: string): SourceProvider | null {
      const ref = parseRef(reference);
      if (ref.kind === 'osp-uri') return null;

      // Self-hosted Forgejo/Gitea hosts cannot be detected by pattern alone, so
      // an unconfigured one produces an actionable error rather than a
      // misleading "direct download" record.
      if (ref.kind === 'url' && /^(forgejo|gitea)\./i.test(ref.host)) {
        const configured = providers.some(
          (provider) =>
            provider.descriptor.kind === 'forgejo' &&
            new URL(provider.descriptor.homepage).host === ref.host,
        );
        if (!configured) {
          throw new DomainError({
            code: 'unsupported-source',
            message: `${ref.host} looks like a self-hosted Forgejo/Gitea instance. Add the host to ORBISYN_FORGE_HOSTS to enable it.`,
            context: { host: ref.host },
          });
        }
      }

      for (const provider of providers) {
        if (provider.supports(reference)) return provider;
      }
      return null;
    },
  };
}

export function listProviderDescriptors(
  registry: ProviderRegistryPort,
): readonly ProviderDescriptor[] {
  return [...registry.descriptors()].sort((left, right) => left.kind.localeCompare(right.kind));
}
