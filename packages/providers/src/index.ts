/**
 * @orbisyn/providers — the source engine.
 *
 * Isomorphic by design: the same adapters run in the Node gateway and in the
 * browser (they only need `fetch`), so an offline-first client can resolve a
 * source directly when the gateway is unreachable.
 */

export * from './adapters/direct-url.js';
export * from './adapters/fdroid.js';
export * from './adapters/gitea.js';
export * from './adapters/github.js';
export * from './adapters/gitlab.js';
export * from './catalog/seed.js';
export * from './detect.js';
export * from './http/errors.js';
export * from './http/fetch-client.js';
export * from './registry.js';
export * from './shared/collect.js';
export * from './shared/releases.js';
