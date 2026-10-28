/**
 * Repository health.
 *
 * Users pick an app for the next three years, not for the last release note.
 * The score is intentionally transparent: six weighted components, each derived
 * from a stated formula, all raw inputs preserved so a reviewer can recompute
 * the number by hand.
 *
 * Missing data never inflates a score — a component with no evidence scores
 * neutral-low (35) and says so in its rationale.
 */

export interface HealthInputs {
  readonly stars: number | null;
  readonly forks: number | null;
  readonly openIssues: number | null;
  readonly contributors: number | null;
  readonly lastCommitAt: Date | null;
  readonly releasesLastYear: number | null;
  readonly medianReleaseIntervalDays: number | null;
  readonly archived: boolean;
  readonly hasSecurityPolicy: boolean | null;
  readonly hasContributingGuide: boolean | null;
  readonly hasCi: boolean | null;
  readonly licenseSpdx: string | null;
}

export type HealthComponentId =
  | 'release-cadence'
  | 'maintenance'
  | 'community'
  | 'documentation'
  | 'governance'
  | 'licensing';

export interface HealthComponentScore {
  readonly id: HealthComponentId;
  readonly score: number;
  readonly weight: number;
  readonly rationale: string;
}

export interface HealthAssessment {
  readonly score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'E';
  readonly components: readonly HealthComponentScore[];
  readonly computedAt: Date;
  readonly inputs: HealthInputs;
}

const WEIGHTS: Readonly<Record<HealthComponentId, number>> = {
  'release-cadence': 0.25,
  maintenance: 0.25,
  community: 0.15,
  documentation: 0.1,
  governance: 0.15,
  licensing: 0.1,
};

const NEUTRAL_SCORE = 35;
const MS_PER_DAY = 86_400_000;

export interface AssessHealthOptions {
  readonly now?: Date;
  /** Optional reference date; defaults to `now`. Kept explicit for replayable tests. */
  readonly referenceDate?: Date;
}

export function assessHealth(
  inputs: HealthInputs,
  options: AssessHealthOptions = {},
): HealthAssessment {
  const now = options.now ?? new Date();
  const components: HealthComponentScore[] = [
    scoreReleaseCadence(inputs),
    scoreMaintenance(inputs, now),
    scoreCommunity(inputs),
    scoreDocumentation(inputs),
    scoreGovernance(inputs),
    scoreLicensing(inputs),
  ];

  const weighted = components.reduce(
    (total, component) => total + component.score * component.weight,
    0,
  );
  const totalWeight = components.reduce((total, component) => total + component.weight, 0);
  const score = Math.round(Math.min(100, Math.max(0, weighted / totalWeight)));

  return { score, grade: gradeFor(score), components, computedAt: now, inputs };
}

function scoreReleaseCadence(inputs: HealthInputs): HealthComponentScore {
  const id: HealthComponentId = 'release-cadence';
  if (inputs.releasesLastYear === null && inputs.medianReleaseIntervalDays === null) {
    return component(id, NEUTRAL_SCORE, 'no release history available from this source');
  }

  const perYear = inputs.releasesLastYear ?? 0;
  // 12+ releases/year is a maintained project; <2 is a dormant one.
  const frequencyScore = clamp01(perYear / 12) * 100;

  const interval = inputs.medianReleaseIntervalDays;
  const regularityScore =
    interval === null ? NEUTRAL_SCORE : clamp01(1 - Math.abs(interval - 45) / 180) * 100;

  const score = Math.round(frequencyScore * 0.7 + regularityScore * 0.3);
  return component(
    id,
    score,
    `${perYear} release(s) in the last 12 months${
      interval === null ? '' : `, median interval ${Math.round(interval)} day(s)`
    }`,
  );
}

function scoreMaintenance(inputs: HealthInputs, now: Date): HealthComponentScore {
  const id: HealthComponentId = 'maintenance';
  if (inputs.archived) return component(id, 0, 'repository is archived upstream');

  const lastCommit = inputs.lastCommitAt;
  if (lastCommit === null) {
    return component(id, NEUTRAL_SCORE, 'no commit history exposed by this source');
  }

  const ageDays = Math.max(0, (now.getTime() - lastCommit.getTime()) / MS_PER_DAY);
  // Fresh today -> 100, untouched for a year -> ~10.
  const score = Math.round(clamp01(1 - ageDays / 400) * 100);
  return component(id, score, `last commit ${describeAge(ageDays)} ago`);
}

function scoreCommunity(inputs: HealthInputs): HealthComponentScore {
  const id: HealthComponentId = 'community';
  const contributors = inputs.contributors;
  const stars = inputs.stars;
  const openIssues = inputs.openIssues;

  if (contributors === null && stars === null) {
    return component(id, NEUTRAL_SCORE, 'community statistics are not exposed by this source');
  }

  // Logarithmic: 1 maintainer is a bus factor risk, 50+ is a healthy project.
  const contributorScore =
    contributors === null
      ? NEUTRAL_SCORE
      : clamp01(Math.log10(Math.max(1, contributors)) / Math.log10(50)) * 100;

  const starScore =
    stars === null
      ? NEUTRAL_SCORE
      : clamp01(Math.log10(Math.max(1, stars)) / Math.log10(5_000)) * 100;

  // A large open-issue backlog relative to stars signals triage debt.
  const triagePenalty =
    openIssues !== null && stars !== null && stars > 0 ? clamp01((openIssues / stars) * 4) * 15 : 0;

  const score = Math.round(
    clamp01((contributorScore * 0.6 + starScore * 0.4 - triagePenalty) / 100) * 100,
  );
  return component(
    id,
    score,
    `${formatCount(contributors)} contributor(s), ${formatCount(stars)} star(s), ${formatCount(openIssues)} open issue(s)`,
  );
}

function scoreDocumentation(inputs: HealthInputs): HealthComponentScore {
  const id: HealthComponentId = 'documentation';
  if (inputs.hasContributingGuide === null) {
    return component(id, NEUTRAL_SCORE, 'no contribution guide detection available');
  }
  const score = inputs.hasContributingGuide ? 90 : 40;
  return component(
    id,
    score,
    inputs.hasContributingGuide ? 'contribution guide present' : 'no contribution guide found',
  );
}

function scoreGovernance(inputs: HealthInputs): HealthComponentScore {
  const id: HealthComponentId = 'governance';
  const signals: boolean[] = [];
  if (inputs.hasCi !== null) signals.push(inputs.hasCi);
  if (inputs.hasSecurityPolicy !== null) signals.push(inputs.hasSecurityPolicy);
  if (signals.length === 0) {
    return component(id, NEUTRAL_SCORE, 'no automation or policy signals detected');
  }
  const positives = signals.filter(Boolean).length;
  const score = Math.round((positives / signals.length) * 100);
  const present = [
    inputs.hasCi === true ? 'CI' : null,
    inputs.hasSecurityPolicy === true ? 'security policy' : null,
  ].filter(isPresent);
  return component(
    id,
    score,
    present.length === 0
      ? 'no CI pipeline or security policy detected'
      : `found ${present.join(' and ')}`,
  );
}

function scoreLicensing(inputs: HealthInputs): HealthComponentScore {
  const id: HealthComponentId = 'licensing';
  if (inputs.licenseSpdx === null) {
    return component(id, 20, 'no machine readable licence detected');
  }
  return component(id, 95, `licence declared as ${inputs.licenseSpdx}`);
}

function component(id: HealthComponentId, score: number, rationale: string): HealthComponentScore {
  return { id, score: Math.round(clamp(score, 0, 100)), weight: WEIGHTS[id], rationale };
}

export function gradeFor(score: number): HealthAssessment['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

export function describeAge(days: number): string {
  if (days < 1) return 'less than a day';
  if (days < 30) return `${Math.round(days)} day(s)`;
  if (days < 365) return `${Math.round(days / 30)} month(s)`;
  const years = days / 365;
  return `${years.toFixed(years < 10 ? 1 : 0)} year(s)`;
}

function formatCount(value: number | null): string {
  if (value === null) return 'n/a';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function isPresent(value: string | null): value is string {
  return value !== null;
}
