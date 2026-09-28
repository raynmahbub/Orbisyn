import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { AppDetailScreen } from './screens/AppDetail.js';
import { HomeScreen } from './screens/Home.js';
import { LibraryScreen } from './screens/Library.js';
import { NotFoundScreen } from './screens/NotFound.js';
import { ProtocolScreen } from './screens/Protocol.js';
import { ProvidersScreen } from './screens/Providers.js';
import { ResolveScreen } from './screens/Resolve.js';
import { SearchScreen } from './screens/Search.js';
import { SettingsScreen } from './screens/Settings.js';
import { UpdatesScreen } from './screens/Updates.js';

/**
 * Routes.
 *
 * The navigation in the Bible maps one-to-one onto these paths, and every screen
 * is reachable by URL — deep links are how people share an Orbisyn record.
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'search', element: <SearchScreen /> },
      { path: 'resolve', element: <ResolveScreen /> },
      { path: 'apps/:appId', element: <AppDetailScreen /> },
      { path: 'updates', element: <UpdatesScreen /> },
      { path: 'library', element: <LibraryScreen /> },
      { path: 'providers', element: <ProvidersScreen /> },
      { path: 'protocol', element: <ProtocolScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
