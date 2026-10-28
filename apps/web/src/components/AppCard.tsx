import type { AppRecord, AppSummary } from '@orbisyn/core';
import { Link } from 'react-router-dom';
import { healthTone, platformGlyph, platformLabel, relativeTime } from '../lib/format.js';
import { Badge, Chip } from './primitives.js';

/**
 * The unit of the whole interface: one card, one project.
 *
 * Every fact on the card is traceable — the version comes from the latest
 * release, the grade from the health score, the platform list from classified
 * artifacts. Nothing is decorative.
 */
export function AppCard({ summary, rationale }: { summary: AppSummary; rationale?: string }) {
  return (
    <Link to={`/apps/${summary.id}`} className="card card--interactive app-card">
      <div className="app-card__head">
        {summary.iconUrl !== undefined ? (
          <img className="app-card__icon" src={summary.iconUrl} alt="" loading="lazy" />
        ) : (
          <span className="app-card__icon">{summary.name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="stack stack--tight" style={{ minWidth: 0 }}>
          <span className="app-card__title truncate">{summary.name}</span>
          <span className="text-xs text-subtle">
            {summary.sourceKind} · updated {relativeTime(summary.fetchedAt)}
          </span>
        </div>
        <span className="spacer" />
        {summary.healthGrade !== null && (
          <Badge tone={gradeTone(summary.healthGrade)}>{summary.healthGrade}</Badge>
        )}
      </div>

      <p className="text-sm text-muted clamp-2">
        {summary.summary ?? 'No description published upstream.'}
      </p>

      {rationale !== undefined && (
        <p className="text-xs text-subtle clamp-2" style={{ fontStyle: 'italic' }}>
          {rationale}
        </p>
      )}

      <div className="app-card__meta">
        <Chip title={`Version ${summary.latestVersion ?? 'unknown'}`}>
          {summary.latestVersion ?? 'unreleased'}
        </Chip>
        <Chip title={summary.license}>{summary.license}</Chip>
        {summary.platforms.slice(0, 3).map((platform) => (
          <Chip key={platform} title={platformLabel(platform)}>
            {platformGlyph(platform)} {platformLabel(platform)}
          </Chip>
        ))}
        {summary.stars !== null && (
          <Chip title="Stars reported by the upstream forge">★ {formatStars(summary.stars)}</Chip>
        )}
        {summary.archived && <Badge tone="error">archived</Badge>}
      </div>
    </Link>
  );
}

export function AppCardFromRecord({ app, rationale }: { app: AppRecord; rationale?: string }) {
  return (
    <AppCard
      summary={{
        id: app.id,
        ospUri: app.ospUri,
        name: app.name,
        ...(app.summary === undefined ? {} : { summary: app.summary }),
        ...(app.iconUrl === undefined ? {} : { iconUrl: app.iconUrl }),
        license: app.license,
        platforms: app.platforms,
        categories: app.categories,
        archived: app.archived,
        fetchedAt: app.fetchedAt,
        latestVersion: app.latestVersion ?? app.latestRelease?.version ?? null,
        latestPublishedAt: app.latestRelease?.publishedAt ?? null,
        healthGrade: app.health?.grade ?? null,
        sourceKind: app.source.kind,
        stars: app.health?.inputs.stars ?? null,
      }}
      {...(rationale === undefined ? {} : { rationale })}
    />
  );
}

function gradeTone(
  grade: 'A' | 'B' | 'C' | 'D' | 'E',
): 'success' | 'warning' | 'error' | 'neutral' {
  if (grade === 'A' || grade === 'B') return 'success';
  if (grade === 'C') return 'warning';
  return 'error';
}

function formatStars(stars: number): string {
  return stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);
}

export { healthTone };
