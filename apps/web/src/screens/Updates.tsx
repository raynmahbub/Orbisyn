import type { UpdateCandidate } from '@orbisyn/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UpdatesIcon } from '../components/icons.js';
import {
  Badge,
  EmptyState,
  ErrorState,
  LineSkeleton,
  SectionHeader,
} from '../components/primitives.js';
import { useAsyncList } from '../hooks/useAsyncList.js';
import { describeError, useUpdatesCheck } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { type InstalledApp, localStore } from '../lib/local-store.js';

/**
 * Updates.
 *
 * The device knows what is installed; the gateway knows what exists. The check
 * joins the two and *only* reports genuine advances, honouring the release
 * channel the user opted into — a stable user is never offered an rc build.
 */
export function UpdatesScreen() {
  const installed = useAsyncList<InstalledApp[]>(() => localStore.installed(), []);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);

  const check = useUpdatesCheck(
    (installed.data ?? []).map((entry) => ({ appId: entry.appId, version: entry.version })),
  );

  const visible: readonly UpdateCandidate[] = (check.data?.updates ?? []).filter(
    (update) => !dismissed.includes(update.appId),
  );

  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Updates"
        description="Apps you track on this device, compared against the releases Orbisyn has stored."
      />

      {installed.isPending && <LineSkeleton lines={2} />}

      {installed.isSuccess && (installed.data ?? []).length === 0 && (
        <EmptyState
          title="Nothing tracked yet"
          description="Open an app and press Track on a release. Orbisyn then watches that project's upstream releases for this device."
          action={
            <Link className="button button--primary button--sm" to="/">
              Find something to track
            </Link>
          }
        />
      )}

      {check.isPending && (installed.data ?? []).length > 0 && <LineSkeleton lines={3} />}
      {check.isError && (
        <ErrorState {...describeError(check.error)} onRetry={() => void check.refetch()} />
      )}

      {check.isSuccess && visible.length === 0 && (installed.data ?? []).length > 0 && (
        <div className="alert">
          <span className="row row--tight">
            <UpdatesIcon size={18} />
            <strong className="alert__title">Everything is up to date</strong>
          </span>
          <p className="text-sm text-muted">
            Checked {relativeTime(check.data.checkedAt)} across {(installed.data ?? []).length}{' '}
            tracked app(s).
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="list">
          {visible.map((update) => (
            <li key={update.appId} className="list-item">
              <div className="stack stack--tight" style={{ minWidth: 0, flex: 1 }}>
                <Link to={`/apps/${update.appId}`} className="app-card__title">
                  {update.appId}
                </Link>
                <span className="text-xs text-subtle">
                  {update.installedVersion ?? 'not installed'} → {update.latestVersion} ·{' '}
                  {relativeTime(update.release.publishedAt)}
                </span>
              </div>
              <Badge tone="primary">{update.release.channel}</Badge>
              <a
                className="button button--sm"
                href={update.release.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open release
              </a>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={async () => {
                  await localStore.removeInstall(update.appId);
                  setDismissed((current) => [...current, update.appId]);
                }}
              >
                Stop tracking
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
