import type { RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { AppDetailScreen as ConsoleAppDetailScreen } from './screens/AppDetail.js';
import { HomeScreen as ConsoleHomeScreen } from './screens/Home.js';
import { LibraryScreen as ConsoleLibraryScreen } from './screens/Library.js';
import { NotFoundScreen as ConsoleNotFoundScreen } from './screens/NotFound.js';
import { ProtocolScreen } from './screens/Protocol.js';
import { ProvidersScreen } from './screens/Providers.js';
import { ResolveScreen } from './screens/Resolve.js';
import { SearchScreen as ConsoleSearchScreen } from './screens/Search.js';
import { SettingsScreen as ConsoleSettingsScreen } from './screens/Settings.js';
import { UpdatesScreen as ConsoleUpdatesScreen } from './screens/Updates.js';
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

/**
 * Orbisyn has two faces on one origin:
 *
 * - `/` is the consumer store.
 * - `/console` is the transparent resolver/developer console from the core
 *   platform, useful for auditing a source and inspecting diagnostics.
 *
 * Keeping the route tree separate from the router instance lets tests mount the
 * exact production routes in an in-memory history without touching `window`.
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
      { index: true, element: <ConsoleHomeScreen /> },
      { path: 'search', element: <ConsoleSearchScreen /> },
      { path: 'resolve', element: <ResolveScreen /> },
      { path: 'apps/:appId', element: <ConsoleAppDetailScreen /> },
      { path: 'updates', element: <ConsoleUpdatesScreen /> },
      { path: 'library', element: <ConsoleLibraryScreen /> },
      { path: 'providers', element: <ProvidersScreen /> },
      { path: 'protocol', element: <ProtocolScreen /> },
      { path: 'settings', element: <ConsoleSettingsScreen /> },
      { path: '*', element: <ConsoleNotFoundScreen /> },
    ],
  },
  {
    // Legacy deep links from the original resolver client remain valid.
    path: '/apps/:appId',
    element: <Layout />,
    children: [{ index: true, element: <ConsoleAppDetailScreen /> }],
  },
];
