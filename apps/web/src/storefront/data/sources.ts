import type { BridgeDefinition, BridgeId, Platform } from '../types.js';

/**
 * Store-source compatibility map.
 *
 * Some named stores expose public APIs; others are Android clients, private
 * catalogues or Play front ends. Orbisyn does not pretend those are all the
 * same thing. “Live” sources are resolved by the gateway; “handoff” sources are
 * opened in the companion app; “custom” sources accept an OSP/JSON registry.
 */
export const BRIDGES: readonly BridgeDefinition[] = [
  {
    id: 'forge',
    name: 'Forge Releases',
    eyebrow: 'Direct from developers',
    lineage: ['GitHub Releases', 'GitLab', 'Codeberg', 'Forgejo', 'Gitea'],
    mode: 'live',
    description:
      'Reads release metadata, assets, checksums, licenses and repository health directly from public forge APIs.',
    capabilities: ['Release history', 'Asset detection', 'Checksums', 'Repository health'],
    platforms: ['Android', 'Windows', 'macOS', 'Linux', 'Web'],
    enabledByDefault: true,
    accent: '#7c8cff',
    icon: 'git',
    requirement: 'No account required',
    note: 'The most trustworthy path: the developer’s own release is the source of truth.',
  },
  {
    id: 'komi',
    name: 'Komi / GitHub Store lineage',
    eyebrow: 'Catalog bridge',
    lineage: ['Komi Store', 'GitHub Store', 'OpenHub catalog'],
    mode: 'bridge',
    description:
      'Imports catalog references from Komi Store and its former GitHub Store identity without duplicating the same upstream releases.',
    capabilities: ['Catalog import', 'Reference deduplication', 'Deep links'],
    platforms: ['Android', 'Windows', 'macOS', 'Linux'],
    enabledByDefault: true,
    accent: '#54d6ff',
    icon: 'orbit',
    requirement: 'Catalog export or public reference',
    note: 'Komi Store is the successor to GitHub Store; Orbisyn treats them as one lineage.',
  },
  {
    id: 'droidify',
    name: 'F-Droid / Droid-ify Repos',
    eyebrow: 'Signed repository index',
    lineage: ['F-Droid', 'Droid-ify', 'IzzyOnDroid', 'Third-party repos'],
    mode: 'live',
    description:
      'Uses signed F-Droid repository indexes and keeps APK hashes, version codes and signer fingerprints attached to each release.',
    capabilities: ['Signed indexes', 'APK hashes', 'Signer fingerprints', 'Custom repos'],
    platforms: ['Android'],
    enabledByDefault: true,
    accent: '#55d6a5',
    icon: 'repo',
    requirement: 'Public repository URL',
    note: 'Droid-ify is a client for F-Droid-style repositories; the repository index is the integration point.',
  },
  {
    id: 'obtainium',
    name: 'Obtainium Direct',
    eyebrow: 'Track any release page',
    lineage: ['Obtainium', 'Direct APK', 'HTML fallback'],
    mode: 'live',
    description:
      'Tracks a URL to a release page or direct artifact and imports Obtainium export files with their source settings.',
    capabilities: ['URL tracking', 'Bulk import', 'Asset filters', 'Background checks'],
    platforms: ['Android'],
    enabledByDefault: true,
    accent: '#ffb86b',
    icon: 'link',
    requirement: 'Source URL or export JSON',
    note: 'Useful when a project publishes outside a traditional catalog.',
  },
  {
    id: 'aurora',
    name: 'Aurora / Play Bridge',
    eyebrow: 'Companion handoff',
    lineage: ['Aurora Store', 'Google Play catalog'],
    mode: 'handoff',
    description:
      'Keeps proprietary Play-only apps in the same library and hands installation to the user’s Aurora session. Orbisyn never scrapes or proxies Play.',
    capabilities: ['Library linking', 'Wishlist', 'Session handoff', 'Update reminders'],
    platforms: ['Android'],
    enabledByDefault: false,
    accent: '#f58bd8',
    icon: 'sparkles',
    requirement: 'Aurora session on device',
    note: 'Respects each service’s terms: no credential sharing, no anonymous Play API calls from this web preview.',
  },
  {
    id: 'community',
    name: 'Odion / Otherz / Community',
    eyebrow: 'Bring your own registry',
    lineage: ['Odion Store', 'Otherz Store', 'OSP registries', 'Custom JSON'],
    mode: 'custom',
    description:
      'Adds community catalogs through a documented JSON manifest. Unknown registries stay clearly marked until their sources are verified.',
    capabilities: ['Custom registries', 'OSP identity', 'Source review', 'Portable catalogs'],
    platforms: ['Any'],
    enabledByDefault: true,
    accent: '#c191ff',
    icon: 'users',
    requirement: 'HTTPS registry URL',
    note: 'Ideal for niche or regional stores that do not publish a formal API.',
  },
  {
    id: 'direct',
    name: 'Direct Download',
    eyebrow: 'Developer website',
    lineage: ['Official website', 'Mirror', 'Portable build'],
    mode: 'live',
    description:
      'Resolves direct installer URLs from official project sites, mirrors and portable-build pages with explicit trust warnings.',
    capabilities: ['Installer detection', 'Mirror choice', 'Manual review'],
    platforms: ['Windows', 'macOS', 'Linux', 'Android'],
    enabledByDefault: true,
    accent: '#84d2ff',
    icon: 'download',
    requirement: 'Exact artifact or release URL',
    note: 'No invented checksums: a missing upstream digest is shown as missing.',
  },
];

export const BRIDGE_BY_ID: Readonly<Record<BridgeId, BridgeDefinition>> = Object.fromEntries(
  BRIDGES.map((bridge) => [bridge.id, bridge]),
) as Readonly<Record<BridgeId, BridgeDefinition>>;

export const PLATFORM_FILTERS: readonly {
  readonly id: Platform | 'all' | 'desktop' | 'mobile';
  readonly label: string;
}[] = [
  { id: 'all', label: 'All platforms' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'android', label: 'Android' },
  { id: 'ios', label: 'iOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'web', label: 'Web' },
];

export const CUSTOM_SOURCE_KINDS: readonly {
  readonly id: string;
  readonly label: string;
  readonly bridgeId: BridgeId;
}[] = [
  { id: 'forge', label: 'GitHub / GitLab / Codeberg / Forgejo', bridgeId: 'forge' },
  { id: 'fdroid', label: 'F-Droid / Droid-ify repository', bridgeId: 'droidify' },
  { id: 'obtainium', label: 'Obtainium export or source URL', bridgeId: 'obtainium' },
  { id: 'komi', label: 'Komi / GitHub Store catalog reference', bridgeId: 'komi' },
  { id: 'aurora', label: 'Aurora / Play handoff (local session)', bridgeId: 'aurora' },
  { id: 'osp', label: 'Odion / Otherz OSP JSON registry', bridgeId: 'community' },
  { id: 'direct', label: 'Direct download URL', bridgeId: 'direct' },
];

export function sourceModeLabel(mode: SourceModeLabelInput): string {
  switch (mode) {
    case 'live':
      return 'Live API';
    case 'bridge':
      return 'Catalog bridge';
    case 'custom':
      return 'Custom registry';
    default:
      return 'Companion handoff';
  }
}

type SourceModeLabelInput = BridgeDefinition['mode'];
