import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { appsWithUpdates } from '../data/catalog.js';
import { BRIDGES } from '../data/sources.js';
import { useGatewayStatus } from '../hooks.js';
import { useStore } from '../StoreProvider.jsx';
import type { BridgeId } from '../types.js';
import {
  CommandPalette,
  InstallQueue,
  NotificationsPopover,
  Onboarding,
  Toasts,
} from './overlays.js';
import { BrandMark, DynamicIcon } from './ui.js';

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: string;
  readonly end?: boolean;
  readonly mobile?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Discover', icon: 'home', end: true, mobile: true },
  { to: '/explore', label: 'Explore', icon: 'compass', mobile: true },
  { to: '/updates', label: 'Updates', icon: 'download', mobile: true },
  { to: '/library', label: 'Library', icon: 'library', mobile: true },
  { to: '/sources', label: 'Sources', icon: 'layers' },
  { to: '/settings', label: 'Settings', icon: 'settings', mobile: true },
  { to: '/about', label: 'About', icon: 'info' },
];

export function StoreLayout(): ReactNode {
  const { state, updateSettings } = useStore();
  const status = useGatewayStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get('q') ?? '');
    setPlatform(params.get('platform') ?? 'all');
  }, [location.search]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: transient drawers intentionally reset on route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      const target = event.target as HTMLElement | null;
      const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (event.key === '/' && !inField && !commandOpen) {
        event.preventDefault();
        document.getElementById('orbisyn-global-search')?.focus();
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setNotificationsOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen]);

  const updateCount = useMemo(
    () => appsWithUpdates().filter((app) => !state.ignoredUpdates.includes(app.id)).length,
    [state.ignoredUpdates],
  );
  const activeJobs = state.queue.filter((job) => job.status === 'active').length;
  const unread = state.notifications.filter((notification) => !notification.read).length;
  const enabledSources = BRIDGES.filter((bridge) => state.sourceEnabled[bridge.id] === true);
  const theme = state.settings.theme;

  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim().length > 0) params.set('q', query.trim());
    if (platform !== 'all') params.set('platform', platform);
    navigate(`/explore${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    updateSettings({ theme: next });
  };

  return (
    <div className="os-app">
      <a className="os-skip-link" href="#os-main">
        Skip to content
      </a>
      <div className="os-ambient os-ambient--one" aria-hidden="true" />
      <div className="os-ambient os-ambient--two" aria-hidden="true" />

      <aside className={`os-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}>
        <Link to="/" className="os-logo" aria-label="Orbisyn home">
          <BrandMark size={36} />
          <span>
            <strong>Orbisyn</strong>
            <small>Every app. One orbit.</small>
          </span>
        </Link>

        <div className="os-sidebar__section-label">Store</div>
        <nav className="os-nav" aria-label="Store navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) => `os-nav__item ${isActive ? 'is-active' : ''}`}
            >
              <DynamicIcon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.to === '/updates' && updateCount > 0 ? <em>{updateCount}</em> : null}
            </NavLink>
          ))}
        </nav>

        <div className="os-sidebar__section-label">Quick filters</div>
        <div className="os-sidebar__shortcuts">
          <Link to="/explore?category=Privacy">
            <DynamicIcon name="shield" size={15} /> Privacy picks
          </Link>
          <Link to="/explore?platform=desktop">
            <DynamicIcon name="monitor" size={15} /> Desktop apps
          </Link>
          <Link to="/explore?source=droidify">
            <DynamicIcon name="repo" size={15} /> F-Droid repos
          </Link>
          <Link to="/explore?sort=fresh">
            <DynamicIcon name="sparkles" size={15} /> Fresh releases
          </Link>
        </div>

        <div className="os-sidebar__spacer" />

        <div className="os-mesh-card">
          <div className="os-mesh-card__head">
            <span className="os-mesh-card__orb">
              <BrandMark size={26} />
            </span>
            <div>
              <strong>Source mesh</strong>
              <small>
                {enabledSources.length} of {BRIDGES.length} active
              </small>
            </div>
          </div>
          <div className="os-mesh-card__bars">
            {BRIDGES.map((bridge) => (
              <span
                key={bridge.id}
                className={state.sourceEnabled[bridge.id] === true ? 'is-on' : ''}
                style={{ '--bar-color': bridge.accent } as CSSProperties}
                title={bridge.name}
              />
            ))}
          </div>
          <Link to="/sources">
            Manage sources <DynamicIcon name="arrow" size={14} />
          </Link>
        </div>

        <Link to="/console" className="os-console-link">
          <DynamicIcon name="terminal" size={16} />
          <span>Developer console</span>
          <DynamicIcon name="external" size={14} />
        </Link>
      </aside>

      <div className="os-workspace">
        <header className="os-topbar">
          <button
            type="button"
            className="os-icon-button os-topbar__menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            <DynamicIcon name="menu" size={21} />
          </button>
          <Link to="/" className="os-topbar__mobile-logo" aria-label="Orbisyn home">
            <BrandMark size={30} />
            <strong>Orbisyn</strong>
          </Link>
          {/* biome-ignore lint/a11y/useSemanticElements: React 19's renderer does not yet expose the HTML <search> element consistently. */}
          <form className="os-search" onSubmit={submitSearch} role="search">
            <DynamicIcon name="search" size={18} />
            <input
              id="orbisyn-global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps, developers, sources…"
              aria-label="Search the catalog"
            />
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Open command palette"
            >
              <kbd>⌘</kbd>
              <kbd>K</kbd>
            </button>
          </form>
          <div className="os-topbar__actions">
            <label className="os-platform-select">
              <span className="os-visually-hidden">Platform filter</span>
              <DynamicIcon
                name={
                  platform === 'mobile'
                    ? 'smartphone'
                    : platform === 'desktop'
                      ? 'monitor'
                      : 'globe'
                }
                size={16}
              />
              <select
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value);
                  const params = new URLSearchParams(location.search);
                  if (event.target.value === 'all') params.delete('platform');
                  else params.set('platform', event.target.value);
                  navigate(`/explore${params.size > 0 ? `?${params.toString()}` : ''}`);
                }}
              >
                <option value="all">All platforms</option>
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
                <option value="android">Android</option>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
                <option value="web">Web</option>
              </select>
              <DynamicIcon name="chevronDown" size={14} />
            </label>
            <button
              type="button"
              className="os-icon-button os-topbar__theme"
              onClick={toggleTheme}
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme}`}
            >
              <DynamicIcon
                name={theme === 'light' ? 'sun' : theme === 'system' ? 'globe' : 'moon'}
                size={19}
              />
            </button>
            <div className="os-popover-anchor">
              <button
                type="button"
                className="os-icon-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              >
                <DynamicIcon name="bell" size={19} />
                {unread > 0 ? <span className="os-icon-button__badge">{unread}</span> : null}
              </button>
              {notificationsOpen ? (
                <NotificationsPopover onClose={() => setNotificationsOpen(false)} />
              ) : null}
            </div>
            <button
              type="button"
              className="os-icon-button"
              onClick={() => setQueueOpen(true)}
              aria-label={`Install queue${activeJobs > 0 ? `, ${activeJobs} active` : ''}`}
            >
              <DynamicIcon name="download" size={19} />
              {activeJobs > 0 ? <span className="os-icon-button__badge">{activeJobs}</span> : null}
            </button>
            <Link to="/settings" className="os-avatar" aria-label="Open settings">
              <span>OR</span>
              <i className={`os-status-dot ${status.state === 'online' ? 'is-live' : ''}`} />
            </Link>
          </div>
        </header>

        <div className="os-status-strip">
          <span
            className={`os-status-dot ${status.state === 'online' ? 'is-live' : status.state === 'degraded' ? 'is-warning' : ''}`}
          />
          {status.state === 'online'
            ? 'Provider engine online'
            : status.state === 'degraded'
              ? 'Some providers are degraded'
              : status.state === 'checking'
                ? 'Checking provider engine…'
                : 'Preview catalog · start the gateway for live verification'}
          <span className="os-status-strip__separator" />
          <span>{enabledSources.length} sources connected</span>
          <span className="os-status-strip__separator" />
          <span>{Object.keys(state.installed).length} apps in library</span>
          <span className="os-status-strip__spacer" />
          <span className="os-status-strip__preview">Interactive product preview</span>
        </div>

        <main className="os-main" id="os-main">
          <Outlet />
        </main>

        <footer className="os-footer">
          <span>
            <BrandMark size={20} /> Orbisyn
          </span>
          <p>
            Every source. One orbit. Built for user choice, verifiable metadata and cross-platform
            freedom.
          </p>
          <div>
            <Link to="/about">About</Link>
            <Link to="/sources">Sources</Link>
            <Link to="/console">Console</Link>
          </div>
        </footer>
      </div>

      <nav className="os-bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.filter((item) => item.mobile === true).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) => `os-bottom-nav__item ${isActive ? 'is-active' : ''}`}
          >
            <DynamicIcon name={item.icon} size={20} />
            <span>{item.label}</span>
            {item.to === '/updates' && updateCount > 0 ? <em /> : null}
          </NavLink>
        ))}
      </nav>

      {mobileMenuOpen ? (
        <button
          type="button"
          className="os-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <Onboarding />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <InstallQueue open={queueOpen} onClose={() => setQueueOpen(false)} />
      <Toasts />
    </div>
  );
}

export function storeBridgeIds(): readonly BridgeId[] {
  return BRIDGES.map((bridge) => bridge.id);
}
