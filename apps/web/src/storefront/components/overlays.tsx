import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filterApps } from '../data/catalog.js';
import { BRIDGES } from '../data/sources.js';
import { useStore } from '../StoreProvider.jsx';
import type { InstallJob, StoreToast } from '../types.js';
import { AppIcon, BrandMark, DynamicIcon, EmptyState, Modal, SourcePill } from './ui.js';

const ONBOARDING_STEPS = [
  {
    icon: 'orbit',
    eyebrow: 'One place',
    title: 'Every source. One orbit.',
    body: 'Forge releases, F-Droid repositories, Obtainium-style links, catalog bridges and community registries become one searchable library.',
  },
  {
    icon: 'shield',
    eyebrow: 'Trust by design',
    title: 'See the evidence before you install.',
    body: 'Orbisyn keeps the source, license, release channel and upstream verification visible. Missing checksums stay missing — never invented.',
  },
  {
    icon: 'sparkles',
    eyebrow: 'Made for you',
    title: 'Your apps follow your devices.',
    body: 'Filter by platform, pin a source, keep a wishlist, import your existing library and choose exactly how updates are handled.',
  },
] as const;

export function Onboarding(): ReactNode {
  const { state, setOnboardingSeen } = useStore();
  const [step, setStep] = useState(0);
  if (state.onboardingSeen) return null;
  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const last = step === ONBOARDING_STEPS.length - 1;
  return (
    <Modal open onClose={() => setOnboardingSeen(true)} size="lg">
      <div className="os-onboarding">
        <div className="os-onboarding__visual">
          <div className="os-onboarding__orbit">
            <BrandMark size={94} />
            {BRIDGES.slice(0, 6).map((bridge, index) => (
              <span
                key={bridge.id}
                className="os-onboarding__satellite"
                style={
                  {
                    '--index': index,
                    '--satellite': bridge.accent,
                  } as CSSProperties
                }
              >
                <DynamicIcon name={bridge.icon} size={17} />
              </span>
            ))}
          </div>
        </div>
        <div className="os-onboarding__content">
          <span className="os-eyebrow">Welcome to Orbisyn · {current.eyebrow}</span>
          <h2>{current.title}</h2>
          <p>{current.body}</p>
          <fieldset className="os-onboarding__steps" aria-label="Onboarding progress">
            {ONBOARDING_STEPS.map((entry, index) => (
              <button
                type="button"
                key={entry.title}
                className={index === step ? 'is-active' : ''}
                onClick={() => setStep(index)}
                aria-label={`Step ${index + 1}: ${entry.title}`}
              />
            ))}
          </fieldset>
          <div className="os-onboarding__actions">
            <button
              type="button"
              className="os-button os-button--ghost"
              onClick={() => setOnboardingSeen(true)}
            >
              Skip
            </button>
            <span className="spacer" />
            {step > 0 ? (
              <button
                type="button"
                className="os-button os-button--outline"
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="os-button os-button--primary"
              onClick={() => {
                if (last) setOnboardingSeen(true);
                else setStep(step + 1);
              }}
            >
              {last ? 'Start exploring' : 'Continue'}
              <DynamicIcon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const QUICK_ROUTES = [
  { label: 'Discover', path: '/', icon: 'home', hint: 'Featured apps' },
  { label: 'Explore catalog', path: '/explore', icon: 'compass', hint: 'Search and filters' },
  { label: 'Updates', path: '/updates', icon: 'download', hint: 'Pending updates' },
  { label: 'Library', path: '/library', icon: 'library', hint: 'Installed and saved' },
  { label: 'Sources', path: '/sources', icon: 'layers', hint: 'Connect stores' },
  { label: 'Settings', path: '/settings', icon: 'settings', hint: 'Preferences' },
  { label: 'About Orbisyn', path: '/about', icon: 'info', hint: 'Product story' },
] as const;

export function CommandPalette({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const apps = useMemo(() => filterApps({ query, sort: 'relevance' }).slice(0, 5), [query]);
  const routes = QUICK_ROUTES.filter(
    (route) => query.trim().length === 0 || route.label.toLowerCase().includes(query.toLowerCase()),
  );
  if (!open) return null;

  const go = (path: string): void => {
    navigate(path);
    onClose();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes the palette; the dialog inside owns interaction.
    <div className="os-command-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="os-command"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="os-command__search">
          <DynamicIcon name="search" size={19} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps, sources or actions…"
            aria-label="Search commands"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="os-command__results">
          <section>
            <span className="os-command__label">Apps</span>
            {apps.length === 0 ? <p className="os-command__empty">No matching apps.</p> : null}
            {apps.map((app) => (
              <button type="button" key={app.id} onClick={() => go(`/app/${app.id}`)}>
                <AppIcon app={app} size={34} rounded={10} />
                <span>
                  <strong>{app.name}</strong>
                  <small>{app.tagline}</small>
                </span>
                <DynamicIcon name="chevronRight" size={16} />
              </button>
            ))}
          </section>
          <section>
            <span className="os-command__label">Go to</span>
            {routes.map((route) => (
              <button type="button" key={route.path} onClick={() => go(route.path)}>
                <span className="os-command__icon">
                  <DynamicIcon name={route.icon} size={17} />
                </span>
                <span>
                  <strong>{route.label}</strong>
                  <small>{route.hint}</small>
                </span>
                <DynamicIcon name="chevronRight" size={16} />
              </button>
            ))}
          </section>
        </div>
        <footer>
          <span>
            <kbd>⌘</kbd>
            <kbd>K</kbd> quick actions
          </span>
          <span>Everything stays local to this browser</span>
        </footer>
      </div>
    </div>
  );
}

function jobStage(job: InstallJob): string {
  if (job.status === 'done') return 'Preview complete · nothing installed';
  if (job.progress < 25) return 'Preparing a simulated handoff';
  if (job.progress < 72) return 'Native installer unavailable in this browser';
  if (job.progress < 96) return 'No artifact is downloaded by this preview';
  return 'Finishing the handoff preview';
}

export function InstallQueue({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const { state, clearCompletedJobs } = useStore();
  if (!open) return null;
  const active = state.queue.filter((job) => job.status === 'active').length;
  return (
    <>
      <button
        type="button"
        className="os-drawer-backdrop"
        aria-label="Close install queue"
        onClick={onClose}
      />
      <aside className="os-drawer" aria-label="Install queue">
        <header>
          <div>
            <span className="os-eyebrow">Web handoff preview</span>
            <h2>Install queue</h2>
          </div>
          <button
            type="button"
            className="os-icon-button"
            onClick={onClose}
            aria-label="Close install queue"
          >
            <DynamicIcon name="x" size={19} />
          </button>
        </header>
        <div className="os-drawer__status">
          <span className={`os-status-dot ${active > 0 ? 'is-live' : ''}`} />
          {active > 0 ? `${active} active ${active === 1 ? 'task' : 'tasks'}` : 'Queue idle'}
          {state.queue.some((job) => job.status === 'done') ? (
            <button type="button" onClick={clearCompletedJobs}>
              Clear completed
            </button>
          ) : null}
        </div>
        {state.queue.length === 0 ? (
          <EmptyState
            icon="packageCheck"
            title="No handoff previews yet"
            message="Queued install actions show the native handoff preview here. This browser does not download or install packages."
          />
        ) : (
          <div className="os-queue-list">
            {state.queue.map((job) => (
              <article key={job.id} className="os-queue-item">
                <div className="os-queue-item__head">
                  <span className="os-queue-item__icon">
                    <DynamicIcon name={job.kind === 'update' ? 'refresh' : 'download'} size={18} />
                  </span>
                  <div>
                    <strong>{job.appName}</strong>
                    <small>
                      {job.version} · <SourcePill id={job.sourceId} short />
                    </small>
                  </div>
                  <span className="os-queue-item__percent">{job.progress}%</span>
                </div>
                <div className="os-progress">
                  <span style={{ width: `${job.progress}%` }} />
                </div>
                <p>{jobStage(job)}</p>
              </article>
            ))}
          </div>
        )}
        <div className="os-drawer__notice">
          <DynamicIcon name="info" size={17} />
          <p>
            This web preview simulates the native package-manager handoff. It never downloads or
            executes an installer. A native Orbisyn shell calls the system installer, session
            installer, Shizuku, Dhizuku or root backend selected in Settings.
          </p>
        </div>
      </aside>
    </>
  );
}

export function NotificationsPopover({ onClose }: { readonly onClose: () => void }): ReactNode {
  const { state, dispatch } = useStore();
  const unread = state.notifications.filter((notification) => !notification.read).length;
  return (
    <div className="os-popover os-notifications" role="dialog" aria-label="Notifications">
      <header>
        <div>
          <h3>Notifications</h3>
          <p>{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        <button type="button" onClick={() => dispatch({ type: 'MARK_NOTIFICATIONS_READ' })}>
          Mark all read
        </button>
      </header>
      <div className="os-notifications__list">
        {state.notifications.slice(0, 8).map((notification) => (
          <article key={notification.id} className={notification.read ? '' : 'is-unread'}>
            <span className={`os-notification-icon os-notification-icon--${notification.tone}`}>
              <DynamicIcon
                name={
                  notification.tone === 'warning'
                    ? 'download'
                    : notification.tone === 'success'
                      ? 'checkCircle'
                      : 'info'
                }
                size={17}
              />
            </span>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
            </div>
          </article>
        ))}
      </div>
      <footer>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </footer>
    </div>
  );
}

const TOAST_ICONS: Record<StoreToast['tone'], string> = {
  success: 'checkCircle',
  info: 'info',
  warning: 'zap',
  error: 'x',
};

export function Toasts(): ReactNode {
  const { state, dispatch } = useStore();
  return (
    <div className="os-toasts" aria-live="polite">
      {state.toasts.map((toast) => (
        <article key={toast.id} className={`os-toast os-toast--${toast.tone}`}>
          <span className="os-toast__icon">
            <DynamicIcon name={TOAST_ICONS[toast.tone]} size={18} />
          </span>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_TOAST', id: toast.id })}
            aria-label="Dismiss notification"
          >
            <DynamicIcon name="x" size={15} />
          </button>
        </article>
      ))}
    </div>
  );
}
