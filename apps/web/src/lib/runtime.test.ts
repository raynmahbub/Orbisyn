import { afterEach, describe, expect, it } from 'vitest';
import { getGatewayOverride, resolveRuntimeConfig, setGatewayOverride } from './runtime.js';

/**
 * Runtime configuration decides where every request goes, so the precedence
 * order (user override → injected build config → same-origin default) is
 * pinned here. Getting this wrong sends a self-hosted user's traffic to the
 * wrong gateway, which is both a bug and a privacy problem.
 */
afterEach(() => {
  localStorage.clear();
  delete window.__ORBISYN_CONFIG__;
});

describe('resolveRuntimeConfig', () => {
  it('defaults to the relative API path so the app works on any origin', () => {
    const config = resolveRuntimeConfig();
    expect(config.apiBase).toBe('/api');
    expect(config.environment).toBe('development');
  });

  it('prefers a build-time injected gateway', () => {
    window.__ORBISYN_CONFIG__ = {
      apiBase: 'https://orbisyn.example/api/',
      gatewayUrl: 'https://orbisyn.example',
    };
    const config = resolveRuntimeConfig();
    expect(config.apiBase).toBe('https://orbisyn.example/api');
    expect(config.gatewayUrl).toBe('https://orbisyn.example');
  });

  it('lets the user override the gateway without a rebuild', () => {
    window.__ORBISYN_CONFIG__ = { apiBase: 'https://orbisyn.example' };
    setGatewayOverride('http://192.168.1.10:8787/');

    const config = resolveRuntimeConfig();
    expect(config.apiBase).toBe('http://192.168.1.10:8787/api');
    expect(getGatewayOverride()).toBe('http://192.168.1.10:8787/');
  });

  it('clears the override and falls back to the injected value', () => {
    window.__ORBISYN_CONFIG__ = { apiBase: 'https://orbisyn.example' };
    setGatewayOverride('http://localhost:8787');
    setGatewayOverride(null);

    expect(getGatewayOverride()).toBeNull();
    expect(resolveRuntimeConfig().apiBase).toBe('https://orbisyn.example/api');
  });

  it('ignores a blank override rather than producing an empty base url', () => {
    setGatewayOverride('   ');
    expect(getGatewayOverride()).toBeNull();
    expect(resolveRuntimeConfig().apiBase).toBe('/api');
  });
});
