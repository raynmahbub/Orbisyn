import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENV_VAR_MAP, loadConfig } from './config.js';

/**
 * Configuration is the first thing that runs in a self-hosted deployment, and a
 * bad value must stop the process with a readable message rather than surface as
 * a mystery at request time.
 */
describe('loadConfig', () => {
  it('applies the documented local defaults to an empty environment', () => {
    const config = loadConfig({});

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8787);
    expect(config.rateLimitMax).toBe(120);
    expect(config.corsOrigins).toEqual([]);
    expect(config.forgeTokens).toEqual({});
    expect(config.forgeHosts).toEqual([]);
    expect(config.storeFile).toBe('./var/orbisyn/store.json');
    expect(config.syncVaultFile).toBe('./var/orbisyn/sync-vaults.json');
    expect(config.logLevel).toBe('info');
    expect(Object.keys(config)).not.toContain('databaseUrl');
  });

  it('reads the documented environment variables', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      GATEWAY_HOST: '127.0.0.1',
      GATEWAY_PORT: '9000',
      LOG_LEVEL: 'warn',
      GATEWAY_CORS_ORIGINS: 'https://orbisyn.example, https://staging.orbisyn.example',
      GATEWAY_RATE_LIMIT_MAX: '0',
      GATEWAY_CACHE_TTL_SECONDS: '900',
      ORBISYN_FORGE_HOSTS: 'forgejo.example.org,git.example.org',
      ORBISYN_WEB_ROOT: '/srv/orbisyn/web',
      ORBISYN_STORE_FILE: '/srv/orbisyn/data/store.json',
      ORBISYN_VERSION: '1.2.3',
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(9000);
    expect(config.logLevel).toBe('warn');
    expect(config.corsOrigins).toEqual([
      'https://orbisyn.example',
      'https://staging.orbisyn.example',
    ]);
    expect(config.rateLimitMax).toBe(0);
    expect(config.cacheTtlSeconds).toBe(900);
    expect(config.forgeHosts).toEqual(['forgejo.example.org', 'git.example.org']);
    expect(config.webRoot).toBe('/srv/orbisyn/web');
    expect(config.storeFile).toBe('/srv/orbisyn/data/store.json');
    expect(config.buildVersion).toBe('1.2.3');
  });

  it('parses per-host forge tokens and ignores malformed entries', () => {
    const config = loadConfig({
      ORBISYN_FORGE_TOKENS: 'codeberg.org=abc123, NOVALUE, =missing, forgejo.example.org:xyz',
    });

    expect(config.forgeTokens).toEqual({ 'codeberg.org': 'abc123' });
  });

  it('treats empty strings as absent rather than as values', () => {
    const config = loadConfig({ GITHUB_TOKEN: '   ', ORBISYN_WEB_ROOT: '  ' });
    expect(config.githubToken).toBeUndefined();
    expect(config.webRoot).toBeUndefined();
  });

  it('rejects an invalid port with a readable message', () => {
    expect(() => loadConfig({ GATEWAY_PORT: 'not-a-port' })).toThrow(
      /invalid gateway configuration/,
    );
  });

  it('rejects an unknown log level instead of silently defaulting', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/logLevel/);
  });
});

describe('documented environment', () => {
  const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');

  const documented = example
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.slice(0, line.indexOf('=')).trim());

  it('documents every variable the gateway reads', () => {
    const missing = Object.keys(ENV_VAR_MAP).filter((name) => !documented.includes(name));
    expect(missing).toEqual([]);
  });

  it('reads every variable it documents', () => {
    const unknown = documented.filter(
      (name) => !Object.hasOwn(ENV_VAR_MAP, name) && !name.startsWith('VITE_'),
    );
    expect(unknown).toEqual([]);
  });

  it('accepts the sample environment unchanged', () => {
    const env = Object.fromEntries(
      example
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
        }),
    );

    const config = loadConfig(env);
    expect(config.port).toBe(8787);
    expect(config.buildVersion).toBe('0.1.0-dev.0');
  });
});
