import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * Test environment.
 *
 * jsdom persists between tests in a file, so unmounting what a test rendered is
 * not optional — without this, queries match elements from previous tests and
 * failures become impossible to read.
 */
afterEach(() => {
  cleanup();
});

// jsdom ships no IndexedDB; the local store is a first-class part of the client,
// so the tests run against a real implementation rather than a stub.
// jsdom implements neither of these; components that call them must not crash.
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
