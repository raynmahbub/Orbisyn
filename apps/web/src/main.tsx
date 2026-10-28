import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './storefront/store.css';

/**
 * Bootstrap.
 *
 * Query defaults encode the offline-first policy of the resolver console:
 * cache aggressively, retry almost never (each retry can cost an upstream API
 * call), and never refetch just because the window regained focus.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const container = document.getElementById('root');
if (container === null) {
  throw new Error('root container missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
