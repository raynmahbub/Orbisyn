/**
 * Seed catalogue.
 *
 * Orbisyn has no crawl-everything index, and it should not pretend to. What it
 * ships instead is a *curated* list of references that resolve against the real
 * upstream sources on demand, plus the editor's rationale for including each one.
 *
 * Consequences worth stating plainly:
 *
 * - there are no invented star counts or download figures anywhere in this file;
 * - every entry is a resolvable reference, so the UI shows live data or an
 *   honest error;
 * - adding an entry is a one-line, reviewable change.
 */

export type CatalogCollectionId =
  | 'featured'
  | 'privacy'
  | 'productivity'
  | 'media'
  | 'hardware'
  | 'developer-tools'
  | 'hidden-gems';

export interface CatalogEntry {
  /** Anything a provider can resolve: a URL, an owner/repo shorthand or a package id. */
  readonly reference: string;
  readonly collections: readonly CatalogCollectionId[];
  /** Why this project is listed. Shown verbatim in the UI. */
  readonly rationale: string;
  /** Optional upstream the editor considers canonical when several exist. */
  readonly mirror?: string;
}

export interface CatalogCollection {
  readonly id: CatalogCollectionId;
  readonly title: string;
  readonly description: string;
}

export const CATALOG_COLLECTIONS: readonly CatalogCollection[] = [
  {
    id: 'featured',
    title: 'Featured',
    description: 'Projects with a long, verifiable release history and OSI-approved licensing.',
  },
  {
    id: 'privacy',
    title: 'Privacy and security',
    description: 'Endpoint security, password management and private communication.',
  },
  {
    id: 'productivity',
    title: 'Productivity',
    description: 'Notes, tasks and reference tools that work without an account.',
  },
  {
    id: 'media',
    title: 'Media',
    description: 'Players, editors and self-hosted media servers.',
  },
  {
    id: 'hardware',
    title: 'Hardware and devices',
    description: 'Companion apps for wearables, trackers and peripherals.',
  },
  {
    id: 'developer-tools',
    title: 'Developer tools',
    description: 'Forge software, terminals and build tooling.',
  },
  {
    id: 'hidden-gems',
    title: 'Hidden gems',
    description: 'Smaller projects with an active maintainer and clean licensing.',
  },
];

export const SEED_CATALOG: readonly CatalogEntry[] = [
  {
    reference: 'https://github.com/bitwarden/android',
    collections: ['featured', 'privacy'],
    rationale:
      'Reference implementation for the Android client of a widely audited password manager.',
  },
  {
    reference: 'https://github.com/florisboard/florisboard',
    collections: ['privacy', 'hidden-gems'],
    rationale:
      'Keyboard with no network permission by default; a clear privacy-first design choice.',
  },
  {
    reference: 'https://codeberg.org/forgejo/forgejo',
    collections: ['developer-tools', 'featured'],
    rationale:
      'Self-hostable forge that proves the Gitea-family adapter against a non-GitHub source.',
  },
  {
    reference: 'https://codeberg.org/Freeyourgadget/Gadgetbridge',
    collections: ['hardware', 'privacy'],
    rationale: 'Talks to wearables without a vendor cloud account.',
  },
  {
    reference: 'org.fdroid.fdroid',
    collections: ['developer-tools', 'featured'],
    rationale:
      'Client for the F-Droid catalogue, used here to exercise the package-index provider.',
  },
  {
    reference: 'https://github.com/immich-app/immich',
    collections: ['media'],
    rationale: 'Self-hosted photo library with a fast, regular release cadence.',
  },
  {
    reference: 'https://github.com/KRTirtho/spotube',
    collections: ['media', 'hidden-gems'],
    rationale: 'Independent music client that does not require an account.',
  },
  {
    reference: 'https://github.com/jellyfin/jellyfin-android',
    collections: ['media'],
    rationale: 'Official client for a fully self-hosted media server.',
  },
  {
    reference: 'https://github.com/termux/termux-app',
    collections: ['developer-tools'],
    rationale: 'Long-running terminal emulator with reproducible F-Droid builds.',
  },
  {
    reference: 'https://github.com/libre-tube/LibreTube',
    collections: ['media', 'hidden-gems'],
    rationale: 'Small team, consistent releases, no proprietary dependencies.',
  },
  {
    reference: 'https://github.com/organicmaps/organicmaps',
    collections: ['featured'],
    rationale: 'Offline maps with a mature data pipeline and an open governance model.',
  },
  {
    reference: 'https://github.com/ankitects/anki',
    collections: ['productivity'],
    rationale: 'Cross-platform desktop and mobile clients from a single monorepo.',
  },
];

export function entriesForCollection(
  collection: CatalogCollectionId,
  catalog: readonly CatalogEntry[] = SEED_CATALOG,
): readonly CatalogEntry[] {
  return catalog.filter((entry) => entry.collections.includes(collection));
}

export function getCollection(id: CatalogCollectionId): CatalogCollection {
  const found = CATALOG_COLLECTIONS.find((collection) => collection.id === id);
  if (found === undefined) {
    throw new Error(`unknown catalogue collection: ${id}`);
  }
  return found;
}
