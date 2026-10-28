import type { OspDocument } from '@orbisyn/contracts';
import { OSP_DOCUMENT_FILENAME, OspDocumentSchema, ospUriForId } from '@orbisyn/contracts';
import type { AppRecord, Platform, RepositoryRef } from '@orbisyn/core';
import { normalizeLicense } from '@orbisyn/core';
import { fetchText } from './raw.js';

/**
 * OSP documents.
 *
 * A publisher adds one file — `orbisyn.json` — to the root of their repository
 * and any client can then resolve, verify and display the project without
 * crawling it first, and without trusting Orbisyn's own database.
 *
 * We never *assume* a document exists: discovery tries the documented raw-content
 * paths for the provider, and absence is a normal, silent outcome.
 */

export interface OspDocumentLocation {
  readonly url: string;
  readonly kind: RepositoryRef['kind'];
}

/**
 * Raw-content URLs per provider family, ordered most likely first. `HEAD` is
 * used where the forge supports it so that the default branch is followed
 * automatically — a repository that renames `master` to `main` keeps working.
 */
export function candidateDocumentUrls(reference: RepositoryRef): readonly OspDocumentLocation[] {
  const location = (url: string): OspDocumentLocation => ({ url, kind: reference.kind });

  switch (reference.kind) {
    case 'github':
      return [
        location(
          `https://raw.githubusercontent.com/${reference.path}/HEAD/${OSP_DOCUMENT_FILENAME}`,
        ),
        location(
          `https://raw.githubusercontent.com/${reference.path}/${reference.defaultBranch ?? 'main'}/${OSP_DOCUMENT_FILENAME}`,
        ),
        location(
          `https://raw.githubusercontent.com/${reference.path}/${reference.defaultBranch ?? 'master'}/${OSP_DOCUMENT_FILENAME}`,
        ),
      ];
    case 'gitlab':
      return [
        location(`https://${reference.host}/${reference.path}/-/raw/HEAD/${OSP_DOCUMENT_FILENAME}`),
        location(
          `https://${reference.host}/${reference.path}/-/raw/${reference.defaultBranch ?? 'main'}/${OSP_DOCUMENT_FILENAME}`,
        ),
      ];
    case 'codeberg':
    case 'forgejo':
      return [
        location(`https://${reference.host}/${reference.path}/raw/HEAD/${OSP_DOCUMENT_FILENAME}`),
        location(
          `https://${reference.host}/${reference.path}/raw/branch/${reference.defaultBranch ?? 'main'}/${OSP_DOCUMENT_FILENAME}`,
        ),
      ];
    case 'fdroid':
      // F-Droid packages live in fdroiddata, which is not the app's own
      // repository: publishing an OSP document there would be misleading.
      return [];
    case 'direct-url': {
      // A published file is the only reference we have; the document would live
      // next to it, so the last path segment is dropped before resolving.
      const directory = new URL('.', reference.webUrl);
      return [location(new URL(OSP_DOCUMENT_FILENAME, directory).toString())];
    }
    default:
      return [];
  }
}

export interface OspDiscoveryResult {
  readonly document: OspDocument;
  readonly url: string;
  readonly warnings: readonly string[];
}

/**
 * Fetches the first valid document it finds. Invalid JSON or a schema mismatch
 * is reported as a warning and skipped — an old or hand-edited document must not
 * break resolution.
 */
export async function discoverOspDocument(
  reference: RepositoryRef,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OspDiscoveryResult | null> {
  const warnings: string[] = [];

  for (const candidate of candidateDocumentUrls(reference)) {
    const text = await fetchText(candidate.url, options);
    if (text === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      warnings.push(`${candidate.url} is not valid JSON`);
      continue;
    }

    const result = OspDocumentSchema.safeParse(parsed);
    if (!result.success) {
      warnings.push(
        `${candidate.url} does not satisfy the OSP schema (${result.error.issues[0]?.message ?? 'unknown'})`,
      );
      continue;
    }

    return { document: result.data, url: candidate.url, warnings };
  }

  return null;
}

/**
 * Builds a usable app record from a document alone — the "publish once, appear
 * everywhere" path. Fields the document does not carry stay absent rather than
 * being invented; `fetchedAt` marks when we read the document.
 */
export function appRecordFromDocument(
  document: OspDocument,
  options: { now?: Date; fallbackSource?: RepositoryRef } = {},
): AppRecord {
  const source = options.fallbackSource ?? documentToRepositoryRef(document);
  const license = normalizeLicense(document.license);
  const platforms: readonly Platform[] = document.platforms;

  return {
    id: document.id,
    ospUri: ospUriForId(document.id),
    name: document.name,
    ...(document.summary === undefined ? {} : { summary: document.summary }),
    homepage: document.mirrors[0] ?? source.webUrl,
    screenshots: [],
    license: license.id,
    categories: [...document.categories],
    tags: ['osp'],
    platforms: [...platforms],
    ...(document.maintainers[0]?.name === undefined
      ? {}
      : { author: document.maintainers[0].name }),
    source,
    alternateSources: [],
    archived: false,
    fetchedAt: (options.now ?? new Date()).toISOString(),
  };
}

export function documentToRepositoryRef(document: OspDocument): RepositoryRef {
  const primary = document.sources[0];
  if (primary === undefined) {
    throw new Error(`OSP document ${document.id} declares no source`);
  }
  let host = 'unknown';
  let path = primary.url;
  try {
    const url = new URL(primary.url);
    host = url.host;
    path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  } catch {
    // Keep the raw URL as the path; the record is still displayable.
  }

  return {
    kind: primary.kind,
    id: document.id,
    host,
    path,
    webUrl: primary.url,
  };
}

export interface OspVerification {
  readonly consistent: boolean;
  readonly mismatches: readonly string[];
  /** Fields the document confirms, useful for a "verified by publisher" badge. */
  readonly confirmed: readonly string[];
}

/**
 * Cross-checks a document against what the provider resolved independently.
 * Only *conflicting* values count as mismatches; a document that says less than
 * the provider is not wrong.
 */
export function verifyDocumentAgainstApp(document: OspDocument, app: AppRecord): OspVerification {
  const mismatches: string[] = [];
  const confirmed: string[] = [];

  if (document.id !== app.id) {
    mismatches.push(`identity: document declares ${document.id}, provider resolved ${app.id}`);
  } else {
    confirmed.push('identity');
  }

  const documentLicense = normalizeLicense(document.license);
  const appLicense = normalizeLicense(app.license);
  if (
    documentLicense.spdx !== null &&
    appLicense.spdx !== null &&
    documentLicense.spdx !== appLicense.spdx
  ) {
    mismatches.push(
      `licence: document says ${documentLicense.spdx}, provider resolved ${appLicense.spdx}`,
    );
  } else if (documentLicense.spdx !== null) {
    confirmed.push('licence');
  }

  const providerPlatforms = new Set<Platform>(app.platforms);
  const overlapping = document.platforms.filter((platform) => providerPlatforms.has(platform));
  if (overlapping.length === 0) {
    mismatches.push(
      `platforms: document declares ${document.platforms.join(', ')}, provider resolved ${app.platforms.join(', ')}`,
    );
  } else {
    confirmed.push('platforms');
  }

  const sourcesMatch = document.sources.some((source) => {
    try {
      const url = new URL(source.url);
      return (
        url.host === app.source.host &&
        url.pathname.includes(app.source.path.split('/').at(-1) ?? '')
      );
    } catch {
      return false;
    }
  });
  if (sourcesMatch) confirmed.push('source');

  return { consistent: mismatches.length === 0, mismatches, confirmed };
}
