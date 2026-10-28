import { useEffect, useState } from 'react';
import { Badge, Chip, SectionHeader, Stat } from '../components/primitives.js';
import { client, useHealth } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import { DEFAULT_SETTINGS, localStore, type UserSettings } from '../lib/local-store.js';
import { getGatewayOverride, resolveRuntimeConfig, setGatewayOverride } from '../lib/runtime.js';

/**
 * Settings.
 *
 * Everything a self-hoster needs without editing a build: which gateway this
 * device talks to, how long resolutions are cached, which release channel to
 * track, and a portable export of everything the device stores.
 */
export function SettingsScreen() {
  const health = useHealth();
  const runtime = resolveRuntimeConfig();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [gateway, setGateway] = useState(getGatewayOverride() ?? '');
  const [exported, setExported] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void localStore.settings().then(setSettings);
  }, []);

  const persist = async (next: UserSettings): Promise<void> => {
    setSettings(next);
    await localStore.saveSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Settings"
        description="Device-local preferences and gateway configuration."
      />

      <section className="card stack">
        <h2>Gateway</h2>
        <div className="grid grid--narrow">
          <Stat
            label="Active API base"
            value={runtime.apiBase === '' ? '(same origin)' : runtime.apiBase}
          />
          <Stat label="Environment" value={runtime.environment} />
          <Stat
            label="Status"
            value={health.data?.status ?? (health.isError ? 'unreachable' : '…')}
            hint={
              health.data === undefined
                ? undefined
                : `v${health.data.version}, ${health.data.store} store`
            }
          />
          <Stat
            label="Uptime"
            value={
              health.data === undefined ? '…' : `${Math.round(health.data.uptimeSeconds / 60)} min`
            }
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="gateway">
            Override gateway URL
          </label>
          <input
            id="gateway"
            className="input"
            value={gateway}
            placeholder="https://orbisyn.example.org"
            onChange={(event) => setGateway(event.target.value)}
            spellCheck={false}
          />
          <div className="row row--tight">
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={() => {
                setGatewayOverride(gateway.length === 0 ? null : gateway);
                location.reload();
              }}
            >
              Save and reload
            </button>
            <button
              type="button"
              className="button button--sm"
              onClick={() => {
                setGatewayOverride(null);
                setGateway('');
                location.reload();
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => void client.health()}
            >
              Test connection
            </button>
          </div>
        </div>

        {(health.data?.providers ?? []).length > 0 && (
          <div className="stack stack--tight">
            <strong className="text-sm">Provider state</strong>
            <div className="row row--tight">
              {health.data?.providers.map((provider) => (
                <Chip
                  key={provider.kind}
                  title={
                    provider.lastFailureAt === null
                      ? 'No recent failures'
                      : `Last failure ${relativeTime(provider.lastFailureAt)}`
                  }
                >
                  {provider.kind}: {provider.state}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Tracking</h2>
        <div className="field">
          <span className="field__label">Release channel</span>
          <div className="row row--tight">
            {(['stable', 'beta', 'rc', 'nightly'] as const).map((channel) => (
              <Chip
                key={channel}
                active={settings.defaultChannel === channel}
                onClick={() => void persist({ ...settings, defaultChannel: channel })}
                title={
                  channel === 'stable'
                    ? 'Only stable releases'
                    : `Track ${channel} releases as well as stable ones`
                }
              >
                {channel}
              </Chip>
            ))}
          </div>
          <span className="text-xs text-subtle">
            Applies to the update check on this device and to apps you track from now on.
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="ttl">
            Keep resolutions cached for {settings.cacheTtlMinutes} minutes
          </label>
          <input
            id="ttl"
            type="range"
            min={5}
            max={1440}
            step={5}
            value={settings.cacheTtlMinutes}
            onChange={(event) =>
              void persist({ ...settings, cacheTtlMinutes: Number(event.target.value) })
            }
          />
          <span className="text-xs text-subtle">
            Longer cache means fewer upstream requests — useful when the gateway has no API token.
          </span>
        </div>

        {saved && <Badge tone="success">saved</Badge>}
      </section>

      <section className="card stack">
        <h2>Your data</h2>
        <p className="text-sm text-muted">
          Orbisyn stores favourites, tracked apps and collections on this device in IndexedDB.
          Export is a plain JSON document you can keep, inspect or import into another Orbisyn
          client.
        </p>
        <div className="row row--tight">
          <button
            type="button"
            className="button button--sm"
            onClick={async () => setExported(await localStore.exportData())}
          >
            Export my data
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={async () => {
              await localStore.clearCache();
              setExported(null);
            }}
          >
            Clear resolution cache
          </button>
        </div>
        {exported !== null && (
          <textarea
            className="input input--mono"
            readOnly
            value={exported}
            rows={8}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Exported data"
          />
        )}
      </section>
    </div>
  );
}
