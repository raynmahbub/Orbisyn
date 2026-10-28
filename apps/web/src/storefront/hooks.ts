import type { ResolveResponse } from '@orbisyn/core';
import { useCallback, useEffect, useState } from 'react';

export interface GatewayStatus {
  readonly state: 'checking' | 'online' | 'offline' | 'degraded';
  readonly store?: string;
  readonly providers?: readonly { kind: string; state: string }[];
  readonly version?: string;
}

interface HealthPayload {
  readonly status?: string;
  readonly store?: string;
  readonly version?: string;
  readonly providers?: readonly { kind: string; state: string }[];
}

export function useGatewayStatus(): GatewayStatus {
  const [status, setStatus] = useState<GatewayStatus>({ state: 'checking' });

  useEffect(() => {
    let active = true;
    const check = async (): Promise<void> => {
      try {
        const response = await fetch('/api/health', { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`health returned ${response.status}`);
        const payload = (await response.json()) as HealthPayload;
        if (!active) return;
        setStatus({
          state: payload.status === 'degraded' ? 'degraded' : 'online',
          ...(payload.store === undefined ? {} : { store: payload.store }),
          ...(payload.version === undefined ? {} : { version: payload.version }),
          ...(payload.providers === undefined ? {} : { providers: payload.providers }),
        });
      } catch {
        if (active) setStatus({ state: 'offline' });
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return status;
}

export interface LiveVerification {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data?: ResolveResponse;
  readonly error?: string;
  readonly verify: (reference: string) => Promise<void>;
}

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const error = 'error' in payload ? payload.error : undefined;
  if (typeof error !== 'object' || error === null) return null;
  const message = 'message' in error ? error.message : undefined;
  return typeof message === 'string' ? message : null;
}

/** Verifies an editorial listing against the real upstream provider engine. */
export function useLiveVerification(): LiveVerification {
  const [status, setStatus] = useState<LiveVerification['status']>('idle');
  const [data, setData] = useState<ResolveResponse | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const verify = useCallback(async (reference: string): Promise<void> => {
    setStatus('loading');
    setError(undefined);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ reference, releases: 5, refresh: false }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload) ?? `The gateway returned ${response.status}.`);
      }
      setData(payload as ResolveResponse);
      setStatus('success');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The upstream source could not be verified.',
      );
      setStatus('error');
    }
  }, []);

  return {
    status,
    ...(data === undefined ? {} : { data }),
    ...(error === undefined ? {} : { error }),
    verify,
  };
}

export function useCopyToClipboard(): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, []);
  return { copied, copy };
}
