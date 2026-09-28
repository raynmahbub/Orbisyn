import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { localStore } from './lib/local-store.js';
import { Onboarding } from './screens/Onboarding.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

/**
 * Bootstrap.
 *
 * Query defaults encode the offline-first policy: cache aggressively, retry
 * almost never (each retry can cost an upstream API call), and never refetch
 * just because a window regained focus.
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

function Root() {
  const [onboarding, setOnboarding] = useState<'unknown' | 'show' | 'done'>('unknown');

  useEffect(() => {
    void localStore.onboardingSeen().then((seen) => setOnboarding(seen ? 'done' : 'show'));
    void localStore.settings().then((settings) => {
      const theme =
        settings.theme === 'system'
          ? matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : settings.theme;
      document.documentElement.dataset.theme = theme;
    });
  }, []);

  if (onboarding === 'unknown') return null;
  if (onboarding === 'show') return <Onboarding onDone={() => setOnboarding('done')} />;
  return <App />;
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('root container missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
