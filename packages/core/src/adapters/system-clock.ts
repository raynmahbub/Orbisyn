import type { ClockPort } from '../ports.js';

/**
 * Production clock. Tests inject a frozen clock instead — every use case takes
 * time through the port, so behaviour stays deterministic under test.
 */
export function createSystemClock(): ClockPort {
  return {
    now: () => new Date(),
    isoNow: () => new Date().toISOString(),
  };
}

/** Deterministic clock for tests and replays. */
export function createFixedClock(at: Date | string): ClockPort & { advance(ms: number): void } {
  let current = typeof at === 'string' ? new Date(at) : new Date(at.getTime());
  return {
    now: () => new Date(current.getTime()),
    isoNow: () => current.toISOString(),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
