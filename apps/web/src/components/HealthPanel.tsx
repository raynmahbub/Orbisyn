import type { RepositoryHealth } from '@orbisyn/core';
import { absoluteDate } from '../lib/format.js';
import { Badge, Stat } from './primitives.js';

/**
 * Repository health.
 *
 * The score is shown with its six weighted components and the raw inputs it was
 * derived from. A user who disagrees with the weighting can see exactly why, and
 * a maintainer can see which signal is dragging the score down.
 *
 * (The panel also demonstrates the kind of aggregate the project document calls
 * "AI intelligence" — deterministic, explainable and auditable.)
 */
export function HealthPanel({ health }: { health: RepositoryHealth }) {
  return (
    <section className="card stack">
      <div className="row row--between">
        <div className="stack stack--tight">
          <h2>Repository health</h2>
          <p className="text-xs text-subtle">Computed {absoluteDate(health.computedAt)}</p>
        </div>
        <Badge tone={tone(health.grade)}>
          {health.grade} · {health.score}/100
        </Badge>
      </div>

      <div className="stack stack--tight">
        {health.components.map((component) => (
          <div key={component.id} className="meter">
            <div className="row row--between">
              <span className="text-sm" style={{ textTransform: 'capitalize' }}>
                {component.id.replace('-', ' ')}{' '}
                <span className="text-xs text-subtle">
                  ({Math.round(component.weight * 100)}% weight)
                </span>
              </span>
              <span className="text-xs text-subtle">{component.score}</span>
            </div>
            <div className="meter__track">
              <div className="meter__fill" style={{ width: `${component.score}%` }} />
            </div>
            <span className="text-xs text-subtle">{component.rationale}</span>
          </div>
        ))}
      </div>

      <div className="grid grid--narrow">
        <Stat label="Stars" value={health.inputs.stars ?? 'n/a'} />
        <Stat label="Contributors" value={health.inputs.contributors ?? 'n/a'} />
        <Stat label="Open issues" value={health.inputs.openIssues ?? 'n/a'} />
        <Stat label="Releases / 12 months" value={health.inputs.releasesLastYear ?? 'n/a'} />
        <Stat
          label="Median release gap"
          value={
            health.inputs.medianReleaseIntervalDays === null
              ? 'n/a'
              : `${Math.round(health.inputs.medianReleaseIntervalDays)} days`
          }
        />
        <Stat label="Last commit" value={absoluteDate(health.inputs.lastCommitAt)} />
      </div>
    </section>
  );
}

function tone(grade: RepositoryHealth['grade']): 'success' | 'warning' | 'error' {
  if (grade === 'A' || grade === 'B') return 'success';
  if (grade === 'C') return 'warning';
  return 'error';
}
