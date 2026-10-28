import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppIcon,
  DynamicIcon,
  EmptyState,
  InstallButton,
  SectionHeading,
  SourcePill,
  Toggle,
} from '../components/ui.js';
import { STORE_APPS } from '../data/apps.js';
import { appsWithUpdates } from '../data/catalog.js';
import { useStore } from '../StoreProvider.jsx';
import type { StoreApp } from '../types.js';

interface CheckSummary {
  readonly live: number;
  readonly attempted: number;
  readonly at: string;
}

export function UpdatesScreen(): ReactNode {
  const { state, updateAll, updateSettings, toggleIgnoreUpdate, showToast, notify } = useStore();
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<CheckSummary | undefined>(undefined);

  const updates = appsWithUpdates().filter(
    (app) => state.installed[app.id] !== undefined && !state.ignoredUpdates.includes(app.id),
  );
  const ignored = appsWithUpdates().filter((app) => state.ignoredUpdates.includes(app.id));
  const installedApps = STORE_APPS.filter((app) => state.installed[app.id] !== undefined);
  const upToDate = installedApps.filter((app) => !updates.some((pending) => pending.id === app.id));

  const checkSources = async (): Promise<void> => {
    setChecking(true);
    const sample = updates.slice(0, 3);
    const results = await Promise.allSettled(
      sample.map(async (app) => {
        const response = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ reference: app.reference, releases: 1, refresh: false }),
        });
        if (!response.ok) throw new Error(`${response.status}`);
        return response.status;
      }),
    );
    const live = results.filter((result) => result.status === 'fulfilled').length;
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSummary({ live, attempted: sample.length, at });
    setChecking(false);
    showToast({
      tone: live > 0 ? 'success' : 'info',
      title: live > 0 ? 'Live source check complete' : 'Preview check complete',
      message: `${live} of ${sample.length} sampled upstream references answered. Start the gateway for full live verification.`,
    });
    notify(
      'Update sources checked',
      `${live}/${sample.length} live references answered at ${at}.`,
      live > 0 ? 'success' : 'info',
    );
  };

  return (
    <div className="os-page os-updates">
      <section className="os-page-hero os-page-hero--updates">
        <div>
          <span className="os-eyebrow">Stay current, stay in control</span>
          <h1>
            {installedApps.length === 0
              ? 'Nothing to update yet.'
              : updates.length > 0
                ? `${updates.length} updates are ready.`
                : 'Everything is up to date.'}
          </h1>
          <p>
            {installedApps.length === 0
              ? 'Import an existing library or add a verified app before checking for updates. First-run state does not invent installed apps.'
              : 'Updates follow each saved source. Preview versions are labelled; review a live source before downloading anything.'}
          </p>
          <div className="os-page-hero__actions">
            <button
              type="button"
              className="os-button os-button--primary os-button--lg"
              onClick={() => updateAll(updates)}
              disabled={updates.length === 0}
            >
              <DynamicIcon name="download" size={18} /> Update all
            </button>
            <button
              type="button"
              className="os-button os-button--outline os-button--lg"
              onClick={() => void checkSources()}
              disabled={checking || installedApps.length === 0}
            >
              <DynamicIcon
                name={checking ? 'refresh' : 'radio'}
                size={18}
                className={checking ? 'os-spin' : ''}
              />
              {checking ? 'Checking…' : 'Check sources'}
            </button>
          </div>
        </div>
        <div className="os-update-summary">
          <div className="os-update-summary__orb">
            <DynamicIcon name="refresh" size={32} />
          </div>
          <strong>{updates.length}</strong>
          <span>pending</span>
          <small>
            {summary === undefined
              ? 'Not checked yet'
              : `${summary.live}/${summary.attempted} live at ${summary.at}`}
          </small>
        </div>
      </section>

      <section className="os-update-settings">
        <div className="os-update-settings__item">
          <DynamicIcon name="refresh" size={20} />
          <div>
            <strong>Automatic updates</strong>
            <span>Update when connected to an approved network.</span>
          </div>
          <Toggle
            checked={state.settings.autoUpdate}
            onChange={(checked) => updateSettings({ autoUpdate: checked })}
            label="Auto-update"
          />
        </div>
        <div className="os-update-settings__item">
          <DynamicIcon name="wifi" size={20} />
          <div>
            <strong>Network policy</strong>
            <span>Keep large downloads off metered connections.</span>
          </div>
          <Toggle
            checked={state.settings.wifiOnly}
            onChange={(checked) => updateSettings({ wifiOnly: checked })}
            label="Wi-Fi only"
          />
        </div>
        <div className="os-update-settings__item">
          <DynamicIcon name="flask" size={20} />
          <div>
            <strong>Prerelease channel</strong>
            <span>Include beta and release candidate builds.</span>
          </div>
          <Toggle
            checked={state.settings.prereleases}
            onChange={(checked) => updateSettings({ prereleases: checked })}
            label="Include prereleases"
          />
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Ready to install"
          title="Pending updates"
          description="Version values are preview catalog metadata; each source can be verified live."
        />
        {updates.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title={
              installedApps.length === 0 ? 'No apps in your library yet' : 'You’re all caught up'
            }
            message={
              installedApps.length === 0
                ? 'Apps appear here only after you import or otherwise register an installed app.'
                : 'No pending updates for the apps in your local library.'
            }
            action={
              <Link to="/explore" className="os-button os-button--primary">
                Discover more apps
              </Link>
            }
          />
        ) : (
          <div className="os-update-cards">
            {updates.map((app) => (
              <UpdateCard
                key={app.id}
                app={app}
                installedVersion={state.installed[app.id]?.version ?? 'Unknown'}
                onSkip={() => toggleIgnoreUpdate(app.id)}
              />
            ))}
          </div>
        )}
      </section>

      {ignored.length > 0 ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="Skipped"
            title="Updates you postponed"
            description="Restore any release to the pending list when you are ready."
          />
          <div className="os-ignored-list">
            {ignored.map((app) => (
              <div key={app.id}>
                <AppIcon app={app} size={36} rounded={11} />
                <strong>{app.name}</strong>
                <span>{app.demoVersion}</span>
                <button type="button" onClick={() => toggleIgnoreUpdate(app.id)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="os-section os-two-column">
        <section className="os-panel">
          <SectionHeading
            eyebrow="On this device"
            title="Up to date"
            description={`${upToDate.length} apps are already on their current preview build.`}
          />
          <div className="os-simple-app-list">
            {upToDate.slice(0, 8).map((app) => (
              <Link key={app.id} to={`/app/${app.id}`}>
                <AppIcon app={app} size={38} rounded={12} />
                <div>
                  <strong>{app.name}</strong>
                  <span>{state.installed[app.id]?.version ?? app.demoVersion}</span>
                </div>
                <DynamicIcon name="checkCircle" size={17} className="os-color-success" />
              </Link>
            ))}
          </div>
        </section>
        <section className="os-panel">
          <SectionHeading eyebrow="Activity" title="Recent source events" />
          <div className="os-activity-list">
            {state.notifications.slice(0, 7).map((notification) => (
              <div key={notification.id}>
                <span className={`os-activity-dot os-activity-dot--${notification.tone}`} />
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                </div>
                <small>{new Date(notification.createdAt).toLocaleDateString()}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="os-update-footnote">
        <DynamicIcon name="shield" size={17} />
        <p>
          Updates never silently switch source. A package installed from an F-Droid repository stays
          on that signer; a GitHub release stays on its developer asset stream.
        </p>
      </div>
    </div>
  );
}

function UpdateCard({
  app,
  installedVersion,
  onSkip,
}: {
  readonly app: StoreApp;
  readonly installedVersion: string;
  readonly onSkip: () => void;
}): ReactNode {
  const { state } = useStore();
  const sourceId = state.installed[app.id]?.sourceId ?? app.sourceIds[0] ?? 'forge';
  return (
    <article className="os-update-card">
      <div className="os-update-card__head">
        <AppIcon app={app} size={56} />
        <div>
          <h3>{app.name}</h3>
          <p>{app.developer}</p>
          <div className="os-update-card__version">
            <span>{installedVersion}</span>
            <DynamicIcon name="arrow" size={14} />
            <strong>{app.demoVersion}</strong>
          </div>
        </div>
        <span className="os-badge os-badge--fresh">Stable</span>
      </div>
      <div className="os-update-card__source">
        <SourcePill id={sourceId} />{' '}
        <span>
          {app.demoSize} · {app.demoUpdated}
        </span>
      </div>
      <div className="os-update-card__notes">
        <strong>What’s new</strong>
        <ul>
          {app.releaseNotes.slice(0, 3).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
      <div className="os-update-card__actions">
        <InstallButton app={app} />
        <button type="button" className="os-button os-button--ghost os-button--sm" onClick={onSkip}>
          Later
        </button>
        <Link to={`/app/${app.id}`} className="os-button os-button--ghost os-button--sm">
          Details
        </Link>
      </div>
    </article>
  );
}
