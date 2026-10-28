import { DomainError } from '@orbisyn/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOutbound } from './outbound.js';

/**
 * Outbound validation is the gateway's safety net.
 *
 * A provider bug must be caught here — as a 500 naming the offending field —
 * rather than reach a client that then has to defend itself against a payload it
 * did not expect.
 */
const PayloadSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  releases: z.array(z.object({ version: z.string() })).default([]),
});

/** Runs a call that must fail closed, and hands back the domain error it threw. */
function expectInvariant(work: () => unknown): DomainError {
  try {
    work();
  } catch (caught) {
    if (caught instanceof DomainError) return caught;
    throw caught;
  }
  throw new Error('expected the payload to be rejected');
}

describe('parseOutbound', () => {
  it('returns the parsed payload, with schema defaults applied', () => {
    const parsed = parseOutbound(
      PayloadSchema,
      { id: 'app', version: '1.2.3' },
      'resolve response',
    );

    expect(parsed).toEqual({ id: 'app', version: '1.2.3', releases: [] });
  });

  it('fails loudly on a payload the schema rejects', () => {
    const error = expectInvariant(() =>
      parseOutbound(PayloadSchema, { id: '', version: 'v1.2.3' }, 'resolve response'),
    );

    expect(error.code).toBe('invariant-violated');
    expect(error.message).toContain('invalid resolve response payload');
  });

  it('names the offending fields in the error context', () => {
    const error = expectInvariant(() =>
      parseOutbound(PayloadSchema, { version: 'not-semver' }, 'releases payload'),
    );

    const issues = (error.context.issues ?? []) as string[];
    expect(issues).toHaveLength(2);
    // Both fields are named; the wording of the message itself is zod's.
    expect(issues.some((issue) => issue.startsWith('id: '))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('version: '))).toBe(true);
  });

  it('lists at most ten issues so a broken adapter cannot flood the log', () => {
    const Wide = z.object(
      Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`field${index}`, z.string()])),
    );
    const error = expectInvariant(() => parseOutbound(Wide, {}, 'wide payload'));

    expect(error.context.issues as string[]).toHaveLength(10);
  });

  it('describes a top level failure with an underscore', () => {
    const error = expectInvariant(() => parseOutbound(z.string(), 42, 'scalar payload'));

    expect((error.context.issues as string[])[0]).toMatch(/^_: /);
  });
});
