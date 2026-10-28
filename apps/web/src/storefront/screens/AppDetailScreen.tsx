import { formatBytes } from '@orbisyn/core';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AppCard,
  AppIcon,
  DynamicIcon,
  EmptyState,
  InstallButton,
  PlatformIcon,
  ScreenshotPreview,
  SectionHeading,
  SourcePill,
  TabBar,
  VerificationBadge,
  WishlistButton,
} from '../components/ui.js';
import { getApp, similarApps } from '../data/catalog.js';
import { BRIDGE_BY_ID, sourceModeLabel } from '../data/sources.js';
import { useCopyToClipboard, useLiveVerification } from '../hooks.js';
import { useStore } from '../StoreProvider.jsx';
import type { BridgeId } from '../types.js';

type DetailTab = 'overview' | 'releases' | 'security' | 'sources';

export function AppDetailScreen(): ReactNode {
  const { appId } = useParams();
  const app = getApp(appId);
  const { state, toggleTrack, toggleCollectionApp, showToast } = useStore();
  const verification = useLiveVerification();
  const { copied, copy } = useCopyToClipboard();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [shot, setShot] = useState(0);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [preferred, setPreferred] = useState<BridgeId | undefined>(undefined);

  useEffect(() => {
    if (appId === undefined) return;
    setTab('overview');
    setShot(0);
    setPreferred(undefined);
  }, [appId]);

  if (app === undefined) {
    return (
      <div className="os-page">
        <EmptyState
          icon="help"
          title="App not found"
          message="This app is not in the curated Orbisyn catalog."
          action={
            <Link to="/explore" className="os-button os-button--primary">
              Back to Explore
            </Link>
          }
        />
      </div>
    );
  }

  const installed = state.installed[app.id];
  const tracked = state.tracked.includes(app.id);
  const sourceList = app.sourceIds
    .map((id) => BRIDGE_BY_ID[id])
    .filter((bridge) => bridge !== undefined);
  const selectedSource =
    preferred ??
    app.sourceIds.find((id) => state.sourceEnabled[id] === true) ??
    app.sourceIds[0] ??
    'forge';
  const live = verification.data;

  const tabs: readonly { id: DetailTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'releases', label: 'Releases', count: live?.releases.length },
    { id: 'security', label: 'Security' },
    { id: 'sources', label: 'Sources', count: sourceList.length },
  ];

  return (
    <div
      className="os-page os-app-detail"
      style={{ '--detail-a': app.color, '--detail-b': app.colorAlt } as CSSProperties}
    >
      <nav className="os-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Discover</Link>
        <DynamicIcon name="chevronRight" size={14} />
        <Link to={`/explore?category=${encodeURIComponent(app.category)}`}>{app.category}</Link>
        <DynamicIcon name="chevronRight" size={14} />
        <span>{app.name}</span>
      </nav>

      <section className="os-detail-hero">
        <div className="os-detail-hero__glow" />
        <div className="os-detail-hero__main">
          <AppIcon app={app} size={112} rounded={28} />
          <div className="os-detail-hero__identity">
            <div className="os-detail-hero__badges">
              <VerificationBadge app={app} />
              {app.editorsChoice === true ? (
                <span className="os-badge os-badge--star">
                  <DynamicIcon name="star" size={13} /> Editors’ choice
                </span>
              ) : null}
              {app.fresh === true ? (
                <span className="os-badge os-badge--fresh">
                  <DynamicIcon name="sparkles" size={13} /> Fresh
                </span>
              ) : null}
            </div>
            <h1>{app.name}</h1>
            <p className="os-detail-hero__developer">by {app.developer}</p>
            <p className="os-detail-hero__tagline">{app.tagline}</p>
            <div className="os-detail-hero__platforms">
              {app.platforms.map((platform) => (
                <span key={platform} title={platform}>
                  <PlatformIcon platform={platform} size={16} /> {platform}
                </span>
              ))}
            </div>
            <div className="os-detail-hero__actions">
              <InstallButton app={app} size="lg" />
              <WishlistButton app={app} />
              <button
                type="button"
                className={tracked ? 'os-icon-button os-icon-button--active' : 'os-icon-button'}
                onClick={() => {
                  toggleTrack(app.id);
                  showToast({
                    tone: 'info',
                    title: tracked ? 'Tracking paused' : 'Now tracking',
                    message: `${app.name} ${tracked ? 'was removed from' : 'was added to'} your watch list.`,
                  });
                }}
              >
                <DynamicIcon name="radio" size={18} /> {tracked ? 'Tracking' : 'Track'}
              </button>
              <div className="os-popover-anchor">
                <button
                  type="button"
                  className="os-icon-button"
                  onClick={() => setCollectionsOpen((open) => !open)}
                >
                  <DynamicIcon name="folderPlus" size={18} /> Collect
                </button>
                {collectionsOpen ? (
                  <div className="os-popover os-collection-popover">
                    <strong>Add to a collection</strong>
                    {state.collections.map((collection) => (
                      <button
                        type="button"
                        key={collection.id}
                        onClick={() => toggleCollectionApp(collection.id, app.id)}
                      >
                        <span
                          className={
                            collection.appIds.includes(app.id) ? 'os-check is-checked' : 'os-check'
                          }
                        >
                          {collection.appIds.includes(app.id) ? (
                            <DynamicIcon name="check" size={12} />
                          ) : null}
                        </span>
                        {collection.name}
                      </button>
                    ))}
                    <Link to="/library">Manage collections</Link>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="os-icon-button"
                onClick={() => {
                  void copy(window.location.href);
                  showToast({
                    tone: 'success',
                    title: copied ? 'Copied' : 'Link copied',
                    message: `Share ${app.name} with anyone using this link.`,
                  });
                }}
              >
                <DynamicIcon name="link" size={18} /> Share
              </button>
            </div>
          </div>
        </div>
        <div className="os-detail-hero__facts">
          <div>
            <span>Preview version</span>
            <strong>{app.demoVersion}</strong>
          </div>
          <div>
            <span>Size</span>
            <strong>{app.demoSize}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{app.demoUpdated}</strong>
          </div>
          <div>
            <span>License</span>
            <strong>{app.openSource ? app.license : 'Proprietary'}</strong>
          </div>
          <div>
            <span>Channel</span>
            <strong>Stable</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{app.sourceIds.length}</strong>
          </div>
        </div>
      </section>

      <div className="os-detail-note">
        <DynamicIcon name="info" size={17} />
        <p>
          <strong>Interactive preview.</strong> Version and size values are sample catalog metadata.
          Use “Verify live source” to fetch real release facts from the upstream provider engine.
        </p>
        <button
          type="button"
          className="os-button os-button--outline os-button--sm"
          disabled={app.liveResolve === false || verification.status === 'loading'}
          onClick={() => void verification.verify(app.reference)}
        >
          <DynamicIcon
            name={verification.status === 'loading' ? 'refresh' : 'shield'}
            size={15}
            className={verification.status === 'loading' ? 'os-spin' : ''}
          />
          {verification.status === 'loading' ? 'Verifying…' : 'Verify live source'}
        </button>
      </div>

      {app.liveResolve === false ? (
        <div className="os-inline-warning">
          <DynamicIcon name="info" size={16} /> This listing uses a companion handoff. Orbisyn links
          to the vendor page but does not proxy a private catalog.
        </div>
      ) : null}
      {verification.status === 'error' ? (
        <div className="os-inline-warning os-inline-warning--error">
          <DynamicIcon name="zap" size={16} /> Live verification failed:{' '}
          {verification.error ?? 'unknown error'}. The preview catalog remains available.
        </div>
      ) : null}
      {verification.status === 'success' && live !== undefined ? (
        <LiveEvidencePanel live={live} />
      ) : null}

      <div className="os-detail-layout">
        <div className="os-detail-main">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />
          {tab === 'overview' ? (
            <div className="os-detail-content">
              <section className="os-detail-section">
                <SectionHeading eyebrow="At a glance" title={`Why ${app.name} stands out`} />
                <div className="os-highlight-grid">
                  {app.highlights.map((highlight) => (
                    <div key={highlight}>
                      <DynamicIcon name="checkCircle" size={19} />
                      <p>{highlight}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="os-detail-section">
                <SectionHeading eyebrow="Preview" title="A consistent experience everywhere" />
                <div className="os-screenshot-rail">
                  {app.screenshots.map((screenshot, index) => (
                    <ScreenshotPreview
                      key={screenshot.title}
                      app={app}
                      index={(shot + index) % app.screenshots.length}
                    />
                  ))}
                </div>
                <div className="os-screenshot-controls">
                  <button
                    type="button"
                    onClick={() =>
                      setShot((shot - 1 + app.screenshots.length) % app.screenshots.length)
                    }
                    aria-label="Previous screenshot"
                  >
                    <DynamicIcon name="chevronDown" size={16} className="os-rotate-90" />
                  </button>
                  {app.screenshots.map((screenshot, index) => (
                    <button
                      type="button"
                      key={screenshot.title}
                      className={shot === index ? 'is-active' : ''}
                      onClick={() => setShot(index)}
                      aria-label={`Screenshot ${index + 1}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setShot((shot + 1) % app.screenshots.length)}
                    aria-label="Next screenshot"
                  >
                    <DynamicIcon name="chevronDown" size={16} className="os-rotate-270" />
                  </button>
                </div>
              </section>
              <section className="os-detail-section">
                <SectionHeading eyebrow="About" title={app.tagline} />
                <p className="os-detail-description">{app.description}</p>
              </section>
              <section className="os-detail-section">
                <SectionHeading
                  eyebrow="What’s new"
                  title={`Preview ${app.demoVersion}`}
                  description={`Updated ${app.demoUpdated} · ${app.demoSize}`}
                />
                <ul className="os-release-notes">
                  {app.releaseNotes.map((note) => (
                    <li key={note}>
                      <DynamicIcon name="check" size={15} /> {note}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          {tab === 'releases' ? (
            <div className="os-detail-content">
              <section className="os-detail-section">
                <SectionHeading
                  eyebrow="Channels"
                  title="Release history"
                  description="Stable builds are pinned to the same source as the installed package."
                />
                <div className="os-release-list">
                  {[app.demoVersion, app.demoPreviousVersion, 'Earlier stable', 'Archive'].map(
                    (version, index) => (
                      <article key={version} className={index === 0 ? 'is-current' : ''}>
                        <span className="os-release-list__icon">
                          <DynamicIcon name={index === 0 ? 'packageCheck' : 'package'} size={19} />
                        </span>
                        <div>
                          <strong>Version {version}</strong>
                          <p>
                            {index === 0
                              ? 'Current preview build · stable channel'
                              : 'Available for rollback when source pinning is enabled.'}
                          </p>
                        </div>
                        <span>{index === 0 ? app.demoUpdated : `${index * 3 + 2} weeks ago`}</span>
                        <Link
                          to={app.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="os-icon-button"
                          aria-label={`Open source release ${version}`}
                        >
                          <DynamicIcon name="external" size={17} />
                        </Link>
                      </article>
                    ),
                  )}
                </div>
                {live !== undefined ? (
                  <div className="os-live-releases">
                    <h3>
                      <DynamicIcon name="radio" size={17} /> Live upstream releases
                    </h3>
                    {live.releases.slice(0, 8).map((release) => {
                      const artifacts = release.artifacts.filter(
                        (artifact) => !artifact.listingOnly,
                      );
                      return (
                        <article key={release.id}>
                          <div className="os-live-release__meta">
                            <strong>{release.version}</strong>
                            <span>{release.channel}</span>
                            <span>{new Date(release.publishedAt).toLocaleDateString()}</span>
                            <Link to={release.sourceUrl} target="_blank" rel="noopener noreferrer">
                              Source <DynamicIcon name="external" size={13} />
                            </Link>
                          </div>
                          {artifacts.length > 0 ? (
                            <ul className="os-live-release__artifacts">
                              {artifacts.map((artifact) => (
                                <li key={artifact.url}>
                                  <a
                                    href={artifact.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Download ${artifact.fileName ?? `${artifact.platform} ${artifact.architecture} artifact`}`}
                                  >
                                    <DynamicIcon name="download" size={14} />
                                    {artifact.fileName ??
                                      `${artifact.platform} ${artifact.architecture} artifact`}
                                    {artifact.sizeBytes === undefined
                                      ? ''
                                      : ` · ${formatBytes(artifact.sizeBytes)}`}
                                  </a>
                                  <span className="os-live-release__evidence">
                                    {artifact.checksum === undefined ? (
                                      'No published checksum'
                                    ) : (
                                      <code>
                                        {artifact.checksum.algorithm.toUpperCase()}{' '}
                                        {artifact.checksum.value}
                                      </code>
                                    )}
                                    {artifact.signature === undefined
                                      ? ' · No published signature'
                                      : ` · ${artifact.signature.scheme} signature published`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="os-live-release__empty">
                              No downloadable artifacts published.
                            </p>
                          )}
                        </article>
                      );
                    })}
                    <p className="os-live-release__notice">
                      These links go directly to upstream. Published checksums are shown as
                      evidence; this web preview does not verify downloaded bytes or run installers.
                    </p>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {tab === 'security' ? (
            <div className="os-detail-content">
              <section className="os-detail-section">
                <SectionHeading
                  eyebrow="Source transparency"
                  title="Security evidence"
                  description="Facts are shown with their origin. Missing evidence is not guessed."
                />
                <div className="os-security-grid">
                  {app.checks.map((check) => (
                    <article key={check}>
                      <DynamicIcon name="shield" size={20} />
                      <strong>{check}</strong>
                      <p>Evidence is linked to the listing’s declared upstream reference.</p>
                    </article>
                  ))}
                </div>
                <div className="os-permission-panel">
                  <h3>Declared permissions</h3>
                  <div>
                    {app.permissions.map((permission) => (
                      <span key={permission}>
                        <DynamicIcon name="lock" size={14} /> {permission}
                      </span>
                    ))}
                  </div>
                  <p>
                    Platform permissions can differ by build. Always inspect the artifact page
                    before installing.
                  </p>
                </div>
                <div className="os-security-settings">
                  <h3>Your install policy</h3>
                  <div>
                    <span>
                      <DynamicIcon
                        name={state.settings.signatureCheck ? 'checkCircle' : 'x'}
                        size={16}
                      />{' '}
                      Signature check {state.settings.signatureCheck ? 'on' : 'off'}
                    </span>
                    <span>
                      <DynamicIcon
                        name={state.settings.checksumCheck ? 'checkCircle' : 'x'}
                        size={16}
                      />{' '}
                      Checksum check {state.settings.checksumCheck ? 'on' : 'off'}
                    </span>
                    <span>
                      <DynamicIcon
                        name={state.settings.sourcePinning ? 'checkCircle' : 'x'}
                        size={16}
                      />{' '}
                      Source pinning {state.settings.sourcePinning ? 'on' : 'off'}
                    </span>
                    <span>
                      <DynamicIcon
                        name={state.settings.quarantineUnknown ? 'checkCircle' : 'x'}
                        size={16}
                      />{' '}
                      Unknown builds quarantined
                    </span>
                  </div>
                  <Link to="/settings">
                    Edit security settings <DynamicIcon name="arrow" size={14} />
                  </Link>
                </div>
              </section>
            </div>
          ) : null}

          {tab === 'sources' ? (
            <div className="os-detail-content">
              <section className="os-detail-section">
                <SectionHeading
                  eyebrow="Source mesh"
                  title="Every way to get this app"
                  description="Choose one source or keep several enabled for resilience."
                />
                <div className="os-detail-source-list">
                  {sourceList.map((bridge) => (
                    <article
                      key={bridge.id}
                      className={selectedSource === bridge.id ? 'is-preferred' : ''}
                      style={{ '--source-color': bridge.accent } as CSSProperties}
                    >
                      <div className="os-detail-source-list__top">
                        <span className="os-detail-source-list__icon">
                          <DynamicIcon name={bridge.icon} size={21} />
                        </span>
                        <div>
                          <strong>{bridge.name}</strong>
                          <small>
                            {sourceModeLabel(bridge.mode)} · {bridge.requirement}
                          </small>
                        </div>
                        <span className="os-detail-source-list__mode">{bridge.mode}</span>
                      </div>
                      <p>{bridge.description}</p>
                      <div className="os-detail-source-list__lineage">
                        {bridge.lineage.map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </div>
                      <div className="os-detail-source-list__footer">
                        <Link to={app.sourceUrl} target="_blank" rel="noreferrer">
                          Open upstream <DynamicIcon name="external" size={14} />
                        </Link>
                        <button
                          type="button"
                          className={
                            selectedSource === bridge.id
                              ? 'os-button os-button--soft os-button--sm'
                              : 'os-button os-button--outline os-button--sm'
                          }
                          onClick={() => {
                            setPreferred(bridge.id);
                            showToast({
                              tone: 'success',
                              title: 'Preferred source set',
                              message: `${app.name} will use ${bridge.name} for this session.`,
                            });
                          }}
                          disabled={state.sourceEnabled[bridge.id] !== true}
                        >
                          {selectedSource === bridge.id ? 'Preferred' : 'Prefer this source'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="os-source-reference">
                  <span>Canonical resolver reference</span>
                  <code>{app.reference}</code>
                  <button type="button" onClick={() => void copy(app.reference)}>
                    <DynamicIcon name="link" size={14} /> Copy
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <aside className="os-detail-sidebar">
          <div className="os-detail-card">
            <span className="os-eyebrow">Install details</span>
            <dl>
              <div>
                <dt>Current</dt>
                <dd>{installed?.version ?? 'Not installed'}</dd>
              </div>
              <div>
                <dt>Latest preview</dt>
                <dd>{app.demoVersion}</dd>
              </div>
              <div>
                <dt>Formats</dt>
                <dd>{app.formats.join(', ')}</dd>
              </div>
              <div>
                <dt>Preferred source</dt>
                <dd>{BRIDGE_BY_ID[selectedSource]?.lineage[0] ?? selectedSource}</dd>
              </div>
              <div>
                <dt>Licence</dt>
                <dd>{app.openSource ? app.license : 'Proprietary'}</dd>
              </div>
              <div>
                <dt>Open source</dt>
                <dd>{app.openSource ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
            <InstallButton app={app} full />
            <Link
              to={app.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="os-button os-button--ghost os-button--full"
            >
              Open release page <DynamicIcon name="external" size={16} />
            </Link>
          </div>
          <div className="os-detail-card os-detail-card--sources">
            <span className="os-eyebrow">Available through</span>
            <div>
              {app.sourceIds.map((source) => (
                <SourcePill key={source} id={source} />
              ))}
            </div>
            <Link to="/sources">
              Understand these sources <DynamicIcon name="arrow" size={14} />
            </Link>
          </div>
          <div className="os-detail-card os-detail-card--privacy">
            <DynamicIcon name="fingerprint" size={23} />
            <strong>Your library stays local</strong>
            <p>
              Installs, wishlist, tracking and source choices are stored in this browser in the web
              preview.
            </p>
          </div>
        </aside>
      </div>

      <section className="os-section">
        <SectionHeading
          eyebrow="More like this"
          title={`You may also like`}
          description="Similar categories and overlapping sources."
        />
        <div className="os-app-grid">
          {similarApps(app, 4).map((similar) => (
            <AppCard key={similar.id} app={similar} />
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveEvidencePanel({
  live,
}: {
  readonly live: NonNullable<ReturnType<typeof useLiveVerification>['data']>;
}): ReactNode {
  const release = live.app.latestRelease;
  const version = live.app.latestVersion ?? release?.version ?? 'not published';
  const artifacts = live.releases.flatMap((entry) => entry.artifacts);
  const checksums = artifacts.filter((artifact) => artifact.checksum !== undefined).length;
  return (
    <section className="os-live-evidence">
      <div className="os-live-evidence__head">
        <span className="os-live-evidence__icon">
          <DynamicIcon name="radio" size={21} />
        </span>
        <div>
          <span className="os-eyebrow">Live upstream verification</span>
          <h2>
            {live.app.name} resolved from {live.app.source.kind}
          </h2>
          <p>{live.app.summary ?? 'No summary was published by the upstream source.'}</p>
        </div>
        <span className="os-badge os-badge--success">
          <DynamicIcon name="checkCircle" size={13} /> Live
        </span>
      </div>
      <div className="os-live-evidence__grid">
        <div>
          <span>Latest version</span>
          <strong>{version}</strong>
        </div>
        <div>
          <span>Licence</span>
          <strong>{live.app.license}</strong>
        </div>
        <div>
          <span>Health grade</span>
          <strong>{live.app.health?.grade ?? 'Not scored'}</strong>
        </div>
        <div>
          <span>Releases fetched</span>
          <strong>{live.releases.length}</strong>
        </div>
        <div>
          <span>Artifacts found</span>
          <strong>{artifacts.length}</strong>
        </div>
        <div>
          <span>Published checksums</span>
          <strong>{checksums}</strong>
        </div>
        <div>
          <span>Cache</span>
          <strong>{live.diagnostics.cache}</strong>
        </div>
        <div>
          <span>Warnings</span>
          <strong>{live.diagnostics.warnings.length}</strong>
        </div>
      </div>
      <div className="os-live-evidence__footer">
        <Link to={live.app.source.webUrl} target="_blank" rel="noreferrer">
          Open canonical repository <DynamicIcon name="external" size={14} />
        </Link>
        <span>
          Resolved in {live.diagnostics.durationMs} ms · {live.diagnostics.steps.length} steps
        </span>
      </div>
    </section>
  );
}
