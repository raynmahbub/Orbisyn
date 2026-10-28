import { useEffect, useState } from 'react';

/**
 * Debounce that survives slow typists and fast typers alike: the value settles
 * after the user stops typing, and the timer is cleared on unmount so a
 * navigation cannot schedule a stale query.
 */
export function useSearchDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
