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
 * Application shell.
 *
 * One navigation definition drives both the desktop sidebar and the phone tab
 * bar, so the two can never disagree — a class of bug that is invisible until a
 * user on the other form factor reports it.
 */
interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: (props: { size?: number; className?: string }) => ReactElement;
  readonly end?: boolean;
  readonly inTabBar?: boolean;
}

const NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true, inTabBar: true },
  { to: '/search', label: 'Search', icon: SearchIcon, inTabBar: true },
  { to: '/updates', label: 'Updates', icon: UpdatesIcon, inTabBar: true },
  { to: '/library', label: 'Library', icon: LibraryIcon, inTabBar: true },
  { to: '/providers', label: 'Providers', icon: PlugIcon },
  { to: '/protocol', label: 'OSP', icon: ShieldIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, inTabBar: true },
];

export function Layout() {
  const health = useHealth();
  const location = useLocation();
  const degraded = health.data?.status === 'degraded';

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Orbisyn home">
          <span className="brand__mark" />
          <span>Orbisyn</span>
        </NavLink>
        <span className="spacer" />
        {health.isSuccess && (
          <Badge tone={degraded ? 'warning' : 'success'}>
            {degraded ? 'degraded' : 'online'} · {health.data.store}
          </Badge>
        )}
        {health.isError && <Badge tone="warning">offline</Badge>}
        <NavLink to="/settings" className="button button--ghost button--sm" aria-label="Settings">
          <SettingsIcon size={18} />
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
