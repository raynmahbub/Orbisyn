import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes.js';
import { StoreProvider } from './storefront/StoreProvider.jsx';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  );
}
