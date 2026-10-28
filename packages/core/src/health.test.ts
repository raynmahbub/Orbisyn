import { describe, expect, it } from 'vitest';
import type { HealthInputs } from './health.js';
import { assessHealth, describeAge, gradeFor } from './health.js';

const NOW = new Date('2024-06-01T00:00:00.000Z');

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    stars: 1_200,
    forks: 90,
    openIssues: 40,
    contributors: 25,
    lastCommitAt: new Date('2024-05-20T00:00:00.000Z'),
    releasesLastYear: 12,
    medianReleaseIntervalDays: 30,
    archived: false,
    hasSecurityPolicy: true,
    hasContributingGuide: true,
    hasCi: true,
    licenseSpdx: 'MIT',
    ...overrides,
  };
}

describe('assessHealth', () => {
  it('scores a healthy, actively maintained project highly', () => {
    const assessment = assessHealth(inputs(), { now: NOW });
    expect(assessment.score).toBeGreaterThanOrEqual(85);
    expect(assessment.grade).toBe('A');
    expect(assessment.components).toHaveLength(6);
  });

  it('scores an archived repository to zero on maintenance', () => {
    const assessment = assessHealth(inputs({ archived: true }), { now: NOW });
    const maintenance = assessment.components.find((component) => component.id === 'maintenance');
    expect(maintenance?.score).toBe(0);
    expect(maintenance?.rationale).toContain('archived');
  });

  it('decays the maintenance score as commits get older', () => {
    const fresh = assessHealth(inputs(), { now: NOW }).score;
    const stale = assessHealth(inputs({ lastCommitAt: new Date('2022-01-01T00:00:00.000Z') }), {
      now: NOW,
    }).score;
    expect(stale).toBeLessThan(fresh);
  });

  it('penalises an open-issue backlog relative to stars', () => {
    const healthy = assessHealth(inputs(), { now: NOW }).score;
    const backlog = assessHealth(inputs({ openIssues: 4_000 }), { now: NOW }).score;
    expect(backlog).toBeLessThan(healthy);
  });

  it('never inflates a score when data is missing', () => {
    const assessment = assessHealth(
      inputs({
        stars: null,
        forks: null,
        openIssues: null,
        contributors: null,
        lastCommitAt: null,
        releasesLastYear: null,
        medianReleaseIntervalDays: null,
        hasSecurityPolicy: null,
        hasContributingGuide: null,
        hasCi: null,
        licenseSpdx: null,
      }),
      { now: NOW },
    );
    expect(assessment.score).toBeLessThan(60);
    expect(assessment.components.every((component) => component.rationale.length > 0)).toBe(true);
  });

  it('records the raw inputs for auditability', () => {
    const assessment = assessHealth(inputs(), { now: NOW });
    expect(assessment.inputs.stars).toBe(1_200);
    expect(assessment.computedAt).toEqual(NOW);
  });
});

describe('gradeFor', () => {
  it('maps scores to grades at the documented boundaries', () => {
    expect(gradeFor(100)).toBe('A');
    expect(gradeFor(85)).toBe('A');
    expect(gradeFor(84)).toBe('B');
    expect(gradeFor(55)).toBe('C');
    expect(gradeFor(40)).toBe('D');
    expect(gradeFor(39)).toBe('E');
  });
});

describe('describeAge', () => {
  it('formats ages in human units', () => {
    expect(describeAge(0.5)).toBe('less than a day');
    expect(describeAge(10)).toBe('10 day(s)');
    expect(describeAge(90)).toBe('3 month(s)');
    expect(describeAge(800)).toBe('2.2 year(s)');
  });
});
