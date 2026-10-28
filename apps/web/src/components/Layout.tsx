import type { ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useHealth } from '../lib/api.js';
import {
  HomeIcon,
  LibraryIcon,
  OrbitIcon,
  PlugIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UpdatesIcon,
} from './icons.js';
import { Badge } from './primitives.js';

/**
 * Resolver console shell.
 *
 * The consumer store lives at `/`; this layout is mounted under `/console` and
 * keeps the original upstream-resolution tooling available for auditing.
 */
interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: (props: { size?: number; className?: string }) => ReactElement;
  readonly end?: boolean;
  readonly inTabBar?: boolean;
}

const NAV: readonly NavItem[] = [
  { to: '/console', label: 'Home', icon: HomeIcon, end: true, inTabBar: true },
  { to: '/console/search', label: 'Search', icon: SearchIcon, inTabBar: true },
  { to: '/console/updates', label: 'Updates', icon: UpdatesIcon, inTabBar: true },
  { to: '/console/library', label: 'Library', icon: LibraryIcon, inTabBar: true },
  { to: '/console/providers', label: 'Providers', icon: PlugIcon },
  { to: '/console/protocol', label: 'OSP', icon: ShieldIcon },
  { to: '/console/settings', label: 'Settings', icon: SettingsIcon, inTabBar: true },
];

export function Layout() {
  const health = useHealth();
  const location = useLocation();
  const degraded = health.data?.status === 'degraded';

  return (
    <div className="shell console-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Orbisyn store home">
          <span className="brand__mark" />
          <span>Orbisyn</span>
        </NavLink>
        <span className="badge badge--neutral">Developer console</span>
        <span className="spacer" />
        {health.isSuccess && (
          <Badge tone={degraded ? 'warning' : 'success'}>
            {degraded ? 'degraded' : 'online'} · {health.data.store}
          </Badge>
        )}
        {health.isError && <Badge tone="warning">offline</Badge>}
        <NavLink
          to="/settings"
          className="button button--ghost button--sm"
          aria-label="Store settings"
        >
          <SettingsIcon size={18} />
        </NavLink>
        <NavLink to="/" className="button button--primary button--sm">
          Back to store
        </NavLink>
      </header>

      <div className="shell__body">
        <aside className="shell__sidebar">
          <nav aria-label="Primary">
            <ul className="nav__list">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end ?? false} className="nav__link">
                    <Icon />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="shell__main" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV.filter((item) => item.inTabBar === true).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="bottom-nav__link">
            <span className="bottom-nav__icon">
              <Icon size={20} />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <span className="visually-hidden">
        <OrbitIcon size={1} />
      </span>
    </div>
  );
}
