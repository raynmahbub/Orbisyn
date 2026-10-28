import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../testing/harness.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = 'a'.repeat(43);
const ENVELOPE = {
  expectedRevision: 0,
  iv: 'c'.repeat(16),
  ciphertext: 'd'.repeat(32),
};

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('end-to-end sync vault routes', () => {
  it('stores and returns ciphertext only to a matching bearer credential', async () => {
    harness = await createHarness();
    const saved = await harness.app.inject({
      method: 'PUT',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${CREDENTIAL}` },
      payload: ENVELOPE,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ id: ID, revision: 1 });
    expect(saved.body).not.toContain(CREDENTIAL);

    const unauthorized = await harness.app.inject({
      method: 'GET',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${'b'.repeat(43)}` },
    });
    expect(unauthorized.statusCode).toBe(401);

    const fetched = await harness.app.inject({
      method: 'GET',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${CREDENTIAL}` },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      id: ID,
      iv: ENVELOPE.iv,
      ciphertext: ENVELOPE.ciphertext,
      revision: 1,
    });
    expect(fetched.json()).not.toHaveProperty('credentialHash');
  });

  it('rejects stale revisions, malformed envelopes, and missing credentials', async () => {
    harness = await createHarness();
    await harness.app.inject({
      method: 'PUT',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${CREDENTIAL}` },
      payload: ENVELOPE,
    });

    const stale = await harness.app.inject({
      method: 'PUT',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${CREDENTIAL}` },
      payload: ENVELOPE,
    });
    expect(stale.statusCode).toBe(409);

    const noCredential = await harness.app.inject({
      method: 'PUT',
      url: `/api/sync-vaults/${ID}`,
      payload: ENVELOPE,
    });
    expect(noCredential.statusCode).toBe(401);

    const malformed = await harness.app.inject({
      method: 'PUT',
      url: `/api/sync-vaults/${ID}`,
      headers: { authorization: `Bearer ${CREDENTIAL}` },
      payload: { ...ENVELOPE, iv: 'short' },
    });
    expect(malformed.statusCode).toBe(400);
  });
});
