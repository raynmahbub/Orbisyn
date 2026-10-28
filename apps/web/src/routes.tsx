import { type ComponentType, lazy, type ReactNode, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { StoreLayout } from './storefront/components/StoreLayout.js';
import { AboutScreen } from './storefront/screens/AboutScreen.js';
import { AppDetailScreen } from './storefront/screens/AppDetailScreen.js';
import { DiscoverScreen } from './storefront/screens/DiscoverScreen.js';
import { ExploreScreen } from './storefront/screens/ExploreScreen.js';
import { LibraryScreen } from './storefront/screens/LibraryScreen.js';
import { SettingsScreen } from './storefront/screens/SettingsScreen.js';
import { SourcesScreen } from './storefront/screens/SourcesScreen.js';
import { StoreNotFoundScreen } from './storefront/screens/StoreNotFoundScreen.js';
import { UpdatesScreen } from './storefront/screens/UpdatesScreen.js';

const ConsoleAppDetailScreen = lazy(() =>
  import('./screens/AppDetail.js').then(({ AppDetailScreen }) => ({ default: AppDetailScreen })),
);
const ConsoleHomeScreen = lazy(() =>
  import('./screens/Home.js').then(({ HomeScreen }) => ({ default: HomeScreen })),
);
const ConsoleLibraryScreen = lazy(() =>
  import('./screens/Library.js').then(({ LibraryScreen }) => ({ default: LibraryScreen })),
);
const ConsoleNotFoundScreen = lazy(() =>
  import('./screens/NotFound.js').then(({ NotFoundScreen }) => ({ default: NotFoundScreen })),
);
const ProtocolScreen = lazy(() =>
  import('./screens/Protocol.js').then(({ ProtocolScreen }) => ({ default: ProtocolScreen })),
);
const ProvidersScreen = lazy(() =>
  import('./screens/Providers.js').then(({ ProvidersScreen }) => ({ default: ProvidersScreen })),
);
const ResolveScreen = lazy(() =>
  import('./screens/Resolve.js').then(({ ResolveScreen }) => ({ default: ResolveScreen })),
);
const ConsoleSearchScreen = lazy(() =>
  import('./screens/Search.js').then(({ SearchScreen }) => ({ default: SearchScreen })),
);
const ConsoleSettingsScreen = lazy(() =>
  import('./screens/Settings.js').then(({ SettingsScreen }) => ({ default: SettingsScreen })),
);
const ConsoleUpdatesScreen = lazy(() =>
  import('./screens/Updates.js').then(({ UpdatesScreen }) => ({ default: UpdatesScreen })),
);

function consoleScreen(Component: ComponentType): ReactNode {
  return (
    <Suspense
      fallback={
        <div className="os-route-loading" role="status">
          Loading console…
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

/**
 * Orbisyn has two faces on one origin:
 *
 * - `/` is the consumer store.
 * - `/console` is the transparent resolver/developer console from the core
 *   platform, useful for auditing a source and inspecting diagnostics.
 *
 * Keeping the route tree separate from the router instance lets tests mount the
 * exact production routes in an in-memory history without touching `window`.
 * The developer console is loaded on demand rather than adding it to the store's
 * initial bundle.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <StoreLayout />,
    children: [
      { index: true, element: <DiscoverScreen /> },
      { path: 'explore', element: <ExploreScreen /> },
      { path: 'app/:appId', element: <AppDetailScreen /> },
      { path: 'updates', element: <UpdatesScreen /> },
      { path: 'library', element: <LibraryScreen /> },
      { path: 'sources', element: <SourcesScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: 'about', element: <AboutScreen /> },
      { path: '*', element: <StoreNotFoundScreen /> },
    ],
  },
  {
    path: '/console',
    element: <Layout />,
    children: [
      { index: true, element: consoleScreen(ConsoleHomeScreen) },
      { path: 'search', element: consoleScreen(ConsoleSearchScreen) },
      { path: 'resolve', element: consoleScreen(ResolveScreen) },
      { path: 'apps/:appId', element: consoleScreen(ConsoleAppDetailScreen) },
      { path: 'updates', element: consoleScreen(ConsoleUpdatesScreen) },
      { path: 'library', element: consoleScreen(ConsoleLibraryScreen) },
      { path: 'providers', element: consoleScreen(ProvidersScreen) },
      { path: 'protocol', element: consoleScreen(ProtocolScreen) },
      { path: 'settings', element: consoleScreen(ConsoleSettingsScreen) },
      { path: '*', element: consoleScreen(ConsoleNotFoundScreen) },
    ],
  },
  {
    // Legacy deep links from the original resolver client remain valid.
    path: '/apps/:appId',
    element: <Layout />,
    children: [{ index: true, element: consoleScreen(ConsoleAppDetailScreen) }],
  },
];
