/**
 * @orbisyn/sdk — the supported way to build against a gateway.
 *
 * ```ts
 * const client = new OrbisynClient({ baseUrl: 'http://localhost:8787' });
 * const { app, releases } = await client.resolve({
 *   reference: 'https://github.com/florisboard/florisboard',
 *   releases: 5,
 *   refresh: false,
 * });
 * ```
 */
export * from './client.js';
export * from './errors.js';
