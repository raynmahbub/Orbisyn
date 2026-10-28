import type { Release } from '@orbisyn/core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HealthPanel } from '../components/HealthPanel.js';
import { DownloadIcon, LinkIcon, StarIcon } from '../components/icons.js';
import {
  Badge,
  CardSkeletons,
  Chip,
  EmptyState,
  LineSkeleton,
  SectionHeader,
  Stat,
} from '../components/primitives.js';
import { ReleaseList } from '../components/ReleaseList.js';
import { useApp, useReleases } from '../lib/api.js';
import {
  absoluteDate,
  licenseSummary,
  licenseTone,
  platformGlyph,
  platformLabel,
  relativeTime,
} from '../lib/format.js';
import { localStore } from '../lib/local-store.js';

/**
 * App detail.
 *
 * The page answers, in order: what is this, what is the latest version, which
 * file do I install, is it maintained, and where did every one of those claims
 * come from. Tracking an app locally is what feeds the Updates tab.
 */
export function AppDetailScreen() {
  const { appId } = useParams<{ appId: string }>();
  const app = useApp(appId);
  const releases = useReleases(appId);
  const [favourite, setFavourite] = useState(false);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (appId === undefined) return;
    void localStore.favourites().then((ids) => setFavourite(ids.includes(appId)));
    void localStore
      .installed()
      .then((entries) => setTracked(entries.some((entry) => entry.appId === appId)));
  }, [appId]);

  useEffect(() => {
    if (appId !== undefined && app.isSuccess) void localStore.pushHistory(appId);
  }, [appId, app.isSuccess]);

  if (app.isPending) {
    return (
      <div className="stack stack--loose">
        <LineSkeleton lines={2} />
        <CardSkeletons count={2} />
      </div>
    );
  }

  if (app.isError || app.data === null) {
    return (
      <EmptyState
        title="No record for this identity"
        description="Orbisyn only shows what it has resolved. Head back and resolve the upstream source once — afterwards this link works offline."
        action={
          <Link className="button button--primary button--sm" to="/search">
            Resolve a source
          </Link>
        }
      />
    );
  }

  const record = app.data;

  const toggleFavourite = async (): Promise<void> => {
    setFavourite(await localStore.toggleFavourite(record.id));
  };

  const trackApp = async (release: Release): Promise<void> => {
    const settings = await localStore.settings();
    await localStore.recordInstall({
      appId: record.id,
      name: record.name,
      version: release.version,
      channel: settings.defaultChannel,
      installedAt: new Date().toISOString(),
    });
    setTracked(true);
  };

  return (
    <div className="stack stack--loose">
      <nav className="row row--tight text-xs text-subtle">
        <Link to="/search">Search</Link>
        <span>/</span>
        <span className="mono">{record.id}</span>
      </nav>

      <header className="card stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {record.iconUrl !== undefined ? (
            <img
              src={record.iconUrl}
              alt=""
              width={72}
              height={72}
              style={{ borderRadius: 'var(--radius-lg)' }}
            />
          ) : (
            <span
              className="app-card__icon"
              style={{ width: 72, height: 72, flexBasis: 72, fontSize: 28 }}
            >
              {record.name.slice(0, 1).toUpperCase()}
            </span>
          )}

          <div className="stack stack--tight" style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 'var(--text-2xl)' }}>{record.name}</h1>
            <p className="text-sm text-muted">
              {record.summary ?? 'No description published upstream.'}
            </p>
            <div className="row row--tight">
              <span className="code">{record.ospUri}</span>
              {record.archived && <Badge tone="error">archived upstream</Badge>}
              {record.latestVersion !== undefined && (
                <Badge tone="primary">v{record.latestVersion}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="row">
          <button
            type="button"
            className="button button--sm"
            onClick={() => void toggleFavourite()}
          >
            <StarIcon filled={favourite} size={16} /> {favourite ? 'Favourited' : 'Favourite'}
          </button>
          <a
            className="button button--sm"
            href={record.source.webUrl}
            target="_blank"
            rel="noreferrer"
          >
            <LinkIcon size={16} /> Open {record.source.kind}
          </a>
          {record.homepage !== undefined && (
            <a
              className="button button--sm"
              href={record.homepage}
              target="_blank"
              rel="noreferrer"
            >
              Homepage
            </a>
          )}
          {tracked && <Badge tone="success">tracked on this device</Badge>}
        </div>
      </header>

      <section className="card stack">
        <div className="grid grid--narrow">
          <Stat
            label="Latest version"
            value={record.latestRelease?.version ?? record.latestVersion ?? 'unknown'}
            hint={
              record.latestRelease === undefined
                ? undefined
                : `published ${relativeTime(record.latestRelease.publishedAt)}`
            }
          />
          <Stat label="Licence" value={record.license} hint={licenseSummary(record.license)} />
          <Stat
            label="Platforms"
            value={record.platforms.map((platform) => platformGlyph(platform)).join(' ')}
            hint={record.platforms.map((platform) => platformLabel(platform)).join(', ')}
          />
          <Stat
            label="Provider"
            value={record.source.kind}
            hint={`${record.source.host}/${record.source.path}`}
          />
          <Stat
            label="Last resolved"
            value={relativeTime(record.fetchedAt)}
            hint={absoluteDate(record.fetchedAt)}
          />
        </div>

        <div className="row row--tight">
          <Chip title={licenseSummary(record.license)}>{licenseTone(record.license)}</Chip>
          {record.categories.map((category) => (
            <Chip key={category}>{category}</Chip>
          ))}
        </div>
      </section>

      {record.health !== undefined && <HealthPanel health={record.health} />}

      <section className="stack">
        <SectionHeader
          title="Releases"
          description="Artifacts link straight to the upstream host — Orbisyn never rehosts files."
        />
        {releases.isPending && <LineSkeleton lines={4} />}
        {releases.data !== undefined && (
          <ReleaseList releases={releases.data} onInstall={(release) => void trackApp(release)} />
        )}
      </section>

      <section className="card stack">
        <h2>Provenance</h2>
        <p className="text-sm text-muted">
          This record was resolved from <span className="code">{record.source.webUrl}</span> by the{' '}
          <strong>{record.source.kind}</strong> provider. Every version, size and checksum above
          came from that upstream response; nothing was inferred or merged from an unverified
          source.
        </p>
        {record.alternateSources.length > 0 && (
          <div className="stack stack--tight">
            <strong className="text-sm">Known other sources</strong>
            {record.alternateSources.map((alternate) => (
              <a
                key={alternate.webUrl}
                className="text-sm"
                href={alternate.webUrl}
                target="_blank"
                rel="noreferrer"
              >
                {alternate.kind}: {alternate.host}/{alternate.path}
              </a>
            ))}
          </div>
        )}
        <div className="row row--tight">
          <a
            className="button button--sm"
            href={record.source.webUrl}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon size={16} /> Browse upstream
          </a>
          <Link className="button button--ghost button--sm" to={`/updates`}>
            Update tracking
          </Link>
        </div>
      </section>
    </div>
  );
}
