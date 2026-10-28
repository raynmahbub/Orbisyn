import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal async loader for device-local state (IndexedDB), which is deliberately
 * outside the server cache layer: it is always available, so it is never a
 * "loading" spinner the user has to wait for twice.
 */
export interface AsyncListState<T> {
  readonly data: T | undefined;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly reload: () => void;
}

export function useAsyncList<T>(loader: () => Promise<T>, deps: DependencyList): AsyncListState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [state, setState] = useState<'pending' | 'success' | 'error'>('pending');
  const [nonce, setNonce] = useState(0);
  const nonceRef = useRef(0);
  nonceRef.current = nonce;

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  // The loader is read through a ref: callers pass an inline closure, and the
  // effect is meant to re-run only when the caller's own dependencies change.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    // Captured so a response from a superseded reload cannot overwrite the
    // result of the newer one.
    const request = nonce;
    setState('pending');
    loaderRef
      .current()
      .then((value) => {
        if (!active || request !== nonceRef.current) return;
        setData(value);
        setState('success');
      })
      .catch(() => {
        if (!active || request !== nonceRef.current) return;
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [...deps, nonce]);

  return {
    data,
    isPending: state === 'pending',
    isSuccess: state === 'success',
    isError: state === 'error',
    reload,
  };
}
