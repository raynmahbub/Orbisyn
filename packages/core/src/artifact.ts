/**
 * Artifact classification.
 *
 * Release feeds hand us file names, MIME types and URLs in every possible
 * combination. This module turns that noise into a platform, an architecture
 * and a confidence level, so clients can filter "the build for my device"
 * without provider-specific rules.
 */

export type ArtifactPlatform = 'android' | 'ios' | 'macos' | 'windows' | 'linux' | 'web';
export type ArtifactArchitecture =
  | 'universal'
  | 'arm64'
  | 'armv7'
  | 'x86_64'
  | 'x86'
  | 'wasm'
  | 'unknown';

export interface ArtifactHint {
  readonly fileName?: string | undefined;
  readonly contentType?: string | undefined;
  readonly url?: string | undefined;
  readonly label?: string | undefined;
}

export interface ArtifactClassification {
  readonly platform: ArtifactPlatform;
  readonly architecture: ArtifactArchitecture;
  /** 0–1. Below 0.5 the caller should keep the artifact but flag it. */
  readonly confidence: number;
  readonly evidence: readonly string[];
  /** True when the file is installable as-is on the detected platform. */
  readonly installable: boolean;
}

interface Rule {
  readonly platform: ArtifactPlatform;
  readonly architecture?: ArtifactArchitecture;
  readonly installable: boolean;
  readonly patterns: readonly RegExp[];
}

/**
 * Ordered most-specific first. Every rule is expressed as a file-name pattern
 * plus optional MIME evidence; keeping it declarative makes the classifier
 * testable and reviewable.
 */
const RULES: readonly Rule[] = [
  {
    platform: 'android',
    installable: true,
    patterns: [/\.apk$/i, /\.aab$/i, /\.apks$/i, /\.xapk$/i],
  },
  {
    platform: 'ios',
    installable: true,
    patterns: [/\.ipa$/i, /\.tipa$/i],
  },
  {
    platform: 'macos',
    architecture: 'universal',
    installable: true,
    patterns: [/\.dmg$/i, /\.pkg$/i, /macos.*\.zip$/i, /darwin.*\.zip$/i],
  },
  {
    platform: 'windows',
    installable: true,
    patterns: [/\.msi$/i, /\.msix$/i, /\.appx$/i, /\.exe$/i, /win(dows)?[-_]?x?64.*\.zip$/i],
  },
  {
    platform: 'linux',
    installable: true,
    patterns: [
      /\.appimage$/i,
      /\.deb$/i,
      /\.rpm$/i,
      /\.flatpak(repo)?$/i,
      /\.snap$/i,
      /\.pkg\.tar\.(zst|xz|gz)$/i,
      /linux.*\.(zip|tar\.gz|tar\.xz)$/i,
    ],
  },
  {
    platform: 'web',
    installable: false,
    patterns: [/\.html?$/i, /\.wasm$/i, /web.*\.zip$/i],
  },
];

const MIME_PLATFORM_HINTS: ReadonlyArray<
  readonly [RegExp, ArtifactPlatform, ArtifactArchitecture, boolean]
> = [
  [/application\/vnd\.android\.package-archive/i, 'android', 'universal', true],
  [/application\/x-itunes|application\/ios/i, 'ios', 'universal', true],
  [/application\/x-apple-diskimage|application\/x-apple-pkg/i, 'macos', 'universal', true],
  [
    /application\/x-msdownload|application\/x-msi|application\/vnd\.microsoft/i,
    'windows',
    'universal',
    true,
  ],
  [
    /application\/x-debian-package|application\/x-rpm|application\/x-executable/i,
    'linux',
    'universal',
    true,
  ],
  [/application\/wasm|text\/html/i, 'web', 'wasm', false],
];

const ARCHITECTURE_PATTERNS: ReadonlyArray<readonly [RegExp, ArtifactArchitecture]> = [
  [/(^|[^a-z])(arm64|aarch64|arm64-v8a)([^a-z]|$)/i, 'arm64'],
  [/(^|[^a-z])(armv7|armhf|armeabi-v7a|arm32)([^a-z]|$)/i, 'armv7'],
  [/(^|[^a-z])(x86[_-]?64|amd64|x64)([^a-z]|$)/i, 'x86_64'],
  [/(^|[^a-z])(i[3-6]86|x86|ia32)([^a-z]|$)/i, 'x86'],
  [/(^|[^a-z])universal([^a-z]|$)/i, 'universal'],
  [/(^|[^a-z])wasm([^a-z]|$)/i, 'wasm'],
];

/** MIME type (or extension) to canonical file extension, for naming downloads. */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'application/vnd.android.package-archive': 'apk',
  'application/x-itunes-ipa': 'ipa',
  'application/x-apple-diskimage': 'dmg',
  'application/x-msdownload': 'exe',
  'application/x-msi': 'msi',
  'application/x-debian-package': 'deb',
  'application/x-rpm': 'rpm',
  'application/x-appimage': 'AppImage',
  'application/x-executable': 'AppImage',
  'application/gzip': 'tar.gz',
  'application/x-tar': 'tar',
  'application/x-xz': 'tar.xz',
  'application/zstd': 'tar.zst',
  'application/zip': 'zip',
  'application/wasm': 'wasm',
};

export function classifyArtifact(hint: ArtifactHint): ArtifactClassification {
  const evidence: string[] = [];
  const haystack = [hint.fileName, hint.label, hint.url].filter(isPresent).join(' ');

  let platform: ArtifactPlatform | undefined;
  let installable = false;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      platform = rule.platform;
      installable = rule.installable;
      evidence.push(`file name matched ${rule.platform} pattern`);
      break;
    }
  }

  if (platform === undefined && hint.contentType !== undefined) {
    for (const [pattern, candidatePlatform, , candidateInstallable] of MIME_PLATFORM_HINTS) {
      if (pattern.test(hint.contentType)) {
        platform = candidatePlatform;
        installable = candidateInstallable;
        evidence.push(`content type ${hint.contentType}`);
        break;
      }
    }
  }

  if (platform === undefined) {
    platform = 'web';
    evidence.push('no installer signature detected, treated as a source bundle');
  }

  let architecture: ArtifactArchitecture = 'unknown';
  for (const [pattern, candidate] of ARCHITECTURE_PATTERNS) {
    if (pattern.test(haystack)) {
      architecture = candidate;
      evidence.push(`architecture token ${candidate}`);
      break;
    }
  }
  if (architecture === 'unknown' && (platform === 'android' || platform === 'linux')) {
    architecture = 'universal';
    evidence.push('defaulted to universal for a portable package format');
  }

  const hasFileName = hint.fileName !== undefined && hint.fileName.length > 0;
  const hasMime = hint.contentType !== undefined;
  const hasPlatformHit = evidence.some(
    (entry) => entry.includes('pattern') || entry.includes('content type'),
  );
  const confidence = Math.min(
    1,
    (hasPlatformHit ? 0.7 : 0.2) + (hasFileName ? 0.2 : 0) + (hasMime ? 0.1 : 0),
  );

  return { platform, architecture, confidence, evidence, installable };
}

export function extensionFor(
  contentType: string | undefined,
  fileName: string | undefined,
): string {
  if (fileName !== undefined) {
    const match = /\.(tar\.(gz|xz|zst)|[a-z0-9]{1,8})$/i.exec(fileName);
    if (match?.[1] !== undefined) return match[1];
  }
  if (contentType !== undefined) {
    const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    const mapped = EXTENSION_BY_MIME[normalized];
    if (mapped !== undefined) return mapped;
  }
  return 'bin';
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}
