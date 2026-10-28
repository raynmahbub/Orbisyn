/**
 * Runtime configuration.
 *
 * The build must work in three environments without recompiling: served by the
 * gateway on the same origin, behind a reverse proxy under a path prefix, and
 * against a remote gateway. All three are expressed as `apiBase`, resolved here
 * and nowhere else. The gateway serves its API under `/api` and the client
 * itself at the root, so the default works without any configuration.
 */
export interface RuntimeConfig {
  readonly apiBase: string;
  readonly gatewayUrl: string;
  readonly environment: 'development' | 'production';
}

declare global {
  interface Window {
    __ORBISYN_CONFIG__?: Partial<RuntimeConfig> & { gatewayUrl?: string };
  }
}

const STORAGE_KEY = 'orbisyn.gateway.override';

export function resolveRuntimeConfig(): RuntimeConfig {
  const injected = typeof window === 'undefined' ? undefined : window.__ORBISYN_CONFIG__;
  const override = readOverride();
  const environment = import.meta.env.DEV ? 'development' : 'production';

  if (override !== null) {
    return { apiBase: trimSlash(override), gatewayUrl: override, environment };
  }

  if (injected?.apiBase !== undefined) {
    return {
      apiBase: trimSlash(injected.apiBase),
      gatewayUrl: injected.gatewayUrl ?? injected.apiBase,
      environment,
    };
  }

  // Development talks to the Vite proxy so the browser sees a single origin.
  return {
    apiBase: environment === 'development' ? '/api' : '',
    gatewayUrl: location.origin,
    environment,
  };
}

/** Users can point the client at their own gateway without a rebuild. */
export function setGatewayOverride(url: string | null): void {
  if (url === null || url.trim().length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, url.trim());
  }
}

export function getGatewayOverride(): string | null {
  return readOverride();
}

function readOverride(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null || value.trim().length === 0 ? null : value;
  } catch {
    return null;
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
