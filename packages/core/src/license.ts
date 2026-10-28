/**
 * License normalisation.
 *
 * Upstream metadata mixes SPDX identifiers, human labels ("MIT License"),
 * deprecated forms ("GPL-3.0") and ambiguous text ("Custom"). We normalise to a
 * canonical SPDX id when we are confident, and otherwise preserve the upstream
 * label — never guess a licence, because that would mislead users.
 */

export interface NormalizedLicense {
  /** SPDX identifier when recognised, otherwise the cleaned upstream label. */
  readonly id: string;
  readonly spdx: string | null;
  readonly name: string;
  readonly osiApproved: boolean;
  readonly copyleft: 'none' | 'weak' | 'strong' | 'network' | 'unknown';
}

interface LicenseDefinition {
  readonly spdx: string;
  readonly name: string;
  readonly osiApproved: boolean;
  readonly copyleft: NormalizedLicense['copyleft'];
  readonly aliases: readonly string[];
}

const DEFINITIONS: readonly LicenseDefinition[] = [
  {
    spdx: 'MIT',
    name: 'MIT License',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['mit', 'the mit license', 'mit license', 'expat'],
  },
  {
    spdx: 'Apache-2.0',
    name: 'Apache License 2.0',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['apache-2.0', 'apache 2.0', 'apache license 2.0', 'apache-2', 'asl 2.0'],
  },
  {
    spdx: 'AGPL-3.0-or-later',
    name: 'GNU Affero General Public License v3.0 or later',
    osiApproved: true,
    copyleft: 'network',
    aliases: ['agpl-3.0', 'agpl-3.0-only', 'agpl-3.0-or-later', 'agplv3', 'gnu agplv3'],
  },
  {
    spdx: 'GPL-3.0-or-later',
    name: 'GNU General Public License v3.0 or later',
    osiApproved: true,
    copyleft: 'strong',
    aliases: ['gpl-3.0', 'gpl-3.0-only', 'gpl-3.0-or-later', 'gplv3', 'gpl 3'],
  },
  {
    spdx: 'GPL-2.0-or-later',
    name: 'GNU General Public License v2.0 or later',
    osiApproved: true,
    copyleft: 'strong',
    aliases: ['gpl-2.0', 'gpl-2.0-only', 'gpl-2.0-or-later', 'gplv2', 'gpl 2'],
  },
  {
    spdx: 'LGPL-3.0-or-later',
    name: 'GNU Lesser General Public License v3.0 or later',
    osiApproved: true,
    copyleft: 'weak',
    aliases: ['lgpl-3.0', 'lgpl-2.1', 'lgplv3', 'lgpl'],
  },
  {
    spdx: 'MPL-2.0',
    name: 'Mozilla Public License 2.0',
    osiApproved: true,
    copyleft: 'weak',
    aliases: ['mpl-2.0', 'mozilla public license 2.0', 'mpl 2.0'],
  },
  {
    spdx: 'BSD-3-Clause',
    name: 'BSD 3-Clause "New" or "Revised" License',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['bsd-3-clause', 'bsd 3-clause', 'new bsd'],
  },
  {
    spdx: 'BSD-2-Clause',
    name: 'BSD 2-Clause "Simplified" License',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['bsd-2-clause', 'bsd 2-clause', 'simplified bsd'],
  },
  {
    spdx: 'ISC',
    name: 'ISC License',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['isc', 'isc license'],
  },
  {
    spdx: 'Unlicense',
    name: 'The Unlicense',
    osiApproved: true,
    copyleft: 'none',
    aliases: ['unlicense', 'public domain', 'cc0-1.0', 'cc0'],
  },
  {
    spdx: 'EUPL-1.2',
    name: 'European Union Public License 1.2',
    osiApproved: true,
    copyleft: 'weak',
    aliases: ['eupl-1.2'],
  },
];

const BY_ALIAS: ReadonlyMap<string, LicenseDefinition> = new Map(
  DEFINITIONS.flatMap((definition) =>
    definition.aliases.map((alias) => [alias, definition] as const),
  ),
);

export const UNKNOWN_LICENSE: NormalizedLicense = {
  id: 'unknown',
  spdx: null,
  name: 'Unknown license',
  osiApproved: false,
  copyleft: 'unknown',
};

/**
 * Accepts anything a provider can throw at us: an SPDX id, a label, a spdx
 * expression such as `MIT OR Apache-2.0`, or `null`.
 */
export function normalizeLicense(input: string | null | undefined): NormalizedLicense {
  if (input === null || input === undefined) return UNKNOWN_LICENSE;
  const trimmed = input.trim();
  if (trimmed.length === 0) return UNKNOWN_LICENSE;

  const direct = BY_ALIAS.get(canonicalKey(trimmed));
  if (direct !== undefined) return fromDefinition(direct);

  // Composite SPDX expressions: normalise every operand, keep the expression.
  if (/\s(OR|AND|WITH)\s/i.test(trimmed)) {
    const operands = trimmed.split(/\s(?:OR|AND|WITH)\s/i);
    const normalizedOperands = operands.map((operand) => normalizeLicense(operand));
    if (normalizedOperands.every((operand) => operand.spdx !== null)) {
      const joined = normalizedOperands.map((operand) => operand.spdx).join(' OR ');
      const copyleft = normalizedOperands.some((operand) => operand.copyleft === 'network')
        ? 'network'
        : normalizedOperands.some((operand) => operand.copyleft === 'strong')
          ? 'strong'
          : normalizedOperands.some((operand) => operand.copyleft === 'weak')
            ? 'weak'
            : 'none';
      return {
        id: joined,
        spdx: joined,
        name: joined,
        osiApproved: normalizedOperands.every((operand) => operand.osiApproved),
        copyleft,
      };
    }
  }

  // Unrecognised: keep the upstream wording, mark it clearly as unverified.
  const cleaned = trimmed.replace(/\s+/g, ' ').slice(0, 64);
  return {
    id: cleaned,
    spdx: null,
    name: cleaned,
    osiApproved: false,
    copyleft: 'unknown',
  };
}

export function isOsiApproved(input: string | null | undefined): boolean {
  return normalizeLicense(input).osiApproved;
}

/** Permissive licences are the ones a commercial integrator can adopt directly. */
export function isPermissive(input: string | null | undefined): boolean {
  const normalized = normalizeLicense(input);
  return normalized.spdx !== null && normalized.copyleft === 'none';
}

function fromDefinition(definition: LicenseDefinition): NormalizedLicense {
  return {
    id: definition.spdx,
    spdx: definition.spdx,
    name: definition.name,
    osiApproved: definition.osiApproved,
    copyleft: definition.copyleft,
  };
}

function canonicalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+licen[cs]e$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
