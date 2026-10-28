import { type ChangeEvent, type ReactNode, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setGatewayOverride } from '../../lib/runtime.js';
import { DynamicIcon, Modal, SectionHeading, Toggle } from '../components/ui.js';
import { useStore } from '../StoreProvider.jsx';
import { persistedState, STORE_STORAGE_KEY } from '../state.js';
import {
  createSyncVaultCredentials,
  decodeSyncPairing,
  encodeSyncPairing,
  readSyncVaultCredentials,
  type SyncVaultCredentials,
  saveSyncVaultCredentials,
  syncVaultState,
} from '../sync-vault.js';
import type { Settings } from '../types.js';

const THEMES: readonly {
  id: Settings['theme'];
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    id: 'dark',
    label: 'Midnight',
    icon: 'moon',
    description: 'Deep contrast with luminous source colours.',
  },
  {
    id: 'light',
    label: 'Daylight',
    icon: 'sun',
    description: 'Bright, calm surfaces for daytime browsing.',
  },
  {
    id: 'system',
    label: 'System',
    icon: 'globe',
    description: 'Follow your device appearance automatically.',
  },
];

const INSTALL_METHODS: readonly {
  id: Settings['installMethod'];
  label: string;
  description: string;
}[] = [
  {
    id: 'system',
    label: 'System installer',
    description: 'Standard platform prompt with user confirmation.',
  },
  {
    id: 'session',
    label: 'Session installer',
    description: 'Faster installs on supporting Android versions.',
  },
  {
    id: 'shizuku',
    label: 'Shizuku / Dhizuku',
    description: 'Elevated install without full root access.',
  },
  { id: 'root', label: 'Root', description: 'For rooted devices and advanced automation.' },
  {
    id: 'manual',
    label: 'Download only',
    description: 'Verify and save the artifact, then install manually.',
  },
];

export function SettingsScreen(): ReactNode {
  const { state, updateSettings, exportState, importState, resetDemo, showToast } = useStore();
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncVault, setSyncVault] = useState<SyncVaultCredentials | null>(() =>
    readSyncVaultCredentials(),
  );
  const [pairingCode, setPairingCode] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const settings = state.settings;

  const flashSaved = (): void => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const change = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    updateSettings({ [key]: value } as Partial<Settings>);
    flashSaved();
  };

  const exportBackup = (): void => {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'orbisyn-settings-and-library.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast({
      tone: 'success',
      title: 'Backup created',
      message: 'Settings and library data were exported.',
    });
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      if (!importState(JSON.parse(await file.text()) as unknown))
        throw new Error('Unknown backup format');
      showToast({
        tone: 'success',
        title: 'Settings restored',
        message: `${file.name} was imported successfully.`,
      });
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'Could not read backup.',
      });
    }
    event.target.value = '';
  };

  const saveGateway = (): void => {
    const value = settings.gatewayUrl.trim();
    setGatewayOverride(value === '' || value === '/api' ? null : value);
    window.location.reload();
  };

  const createVault = (): void => {
    try {
      const credentials = createSyncVaultCredentials();
      saveSyncVaultCredentials(credentials);
      setSyncVault(credentials);
      setSyncMessage(
        'Encrypted vault created on this device. Sync once, then copy the pairing code to another device.',
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : 'Secure browser storage is unavailable.',
      );
    }
  };

  const importPairing = (): void => {
    try {
      const credentials = decodeSyncPairing(pairingCode);
      saveSyncVaultCredentials(credentials);
      setSyncVault(credentials);
      setPairingCode('');
      setSyncMessage('Pairing imported. Sync now to merge this device with the encrypted vault.');
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : 'Pairing code could not be imported.',
      );
    }
  };

  const copyPairing = async (): Promise<void> => {
    if (syncVault === null) return;
    try {
      await navigator.clipboard.writeText(encodeSyncPairing(syncVault));
      setSyncMessage(
        'Pairing code copied. Treat it like a password: anyone with it can read and change this vault.',
      );
    } catch {
      setSyncMessage('Clipboard access was blocked. Select and copy the pairing code manually.');
    }
  };

  const syncNow = async (): Promise<void> => {
    setSyncBusy(true);
    setSyncMessage('Encrypting and synchronizing your library…');
    try {
      const credentials = syncVault ?? createSyncVaultCredentials();
      const result = await syncVaultState(persistedState(state), credentials);
      saveSyncVaultCredentials(result.credentials);
      setSyncVault(result.credentials);
      if (!importState(result.state))
        throw new Error('The synchronized library could not be applied.');
      setSyncMessage(`Synced encrypted snapshot revision ${result.credentials.revision}.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="os-page os-settings">
      <section className="os-page-hero os-page-hero--settings">
        <div>
          <span className="os-eyebrow">Make it yours</span>
          <h1>Settings that respect your choices.</h1>
          <p>
            Control appearance, install policy, verification checks, network behaviour and your
            local data.
          </p>
        </div>
        <div className={`os-save-indicator ${saved ? 'is-visible' : ''}`}>
          <DynamicIcon name="checkCircle" size={18} /> Saved locally
        </div>
      </section>

      <div className="os-settings-layout">
        <aside className="os-settings-nav">
          <a href="#appearance">
            <DynamicIcon name="palette" size={17} /> Appearance
          </a>
          <a href="#installs">
            <DynamicIcon name="download" size={17} /> Installs & updates
          </a>
          <a href="#security">
            <DynamicIcon name="shield" size={17} /> Security
          </a>
          <a href="#network">
            <DynamicIcon name="wifi" size={17} /> Network
          </a>
          <a href="#sync">
            <DynamicIcon name="cloud" size={17} /> Device sync
          </a>
          <a href="#privacy">
            <DynamicIcon name="fingerprint" size={17} /> Privacy & data
          </a>
          <a href="#advanced">
            <DynamicIcon name="terminal" size={17} /> Advanced
          </a>
        </aside>

        <div className="os-settings-content">
          <section className="os-settings-card" id="appearance">
            <SectionHeading
              eyebrow="Look and feel"
              title="Appearance"
              description="Choose a theme and how much information the interface packs in."
            />
            <div className="os-theme-grid">
              {THEMES.map((theme) => (
                <button
                  type="button"
                  key={theme.id}
                  className={settings.theme === theme.id ? 'is-active' : ''}
                  onClick={() => change('theme', theme.id)}
                >
                  <span className={`os-theme-preview os-theme-preview--${theme.id}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <DynamicIcon name={theme.icon} size={17} />
                    <strong>{theme.label}</strong>
                    <small>{theme.description}</small>
                  </span>
                  {settings.theme === theme.id ? (
                    <DynamicIcon name="checkCircle" size={19} className="os-theme-check" />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="os-settings-toggles">
              <Toggle
                checked={settings.compact}
                onChange={(checked) => change('compact', checked)}
                label="Compact layout"
                description="Fit more apps and metadata on each screen."
                icon="layout"
              />
              <Toggle
                checked={settings.reducedMotion}
                onChange={(checked) => change('reducedMotion', checked)}
                label="Reduce motion"
                description="Minimize animation and parallax effects."
                icon="zap"
              />
            </div>
          </section>

          <section className="os-settings-card" id="installs">
            <SectionHeading
              eyebrow="Package manager"
              title="Installs & updates"
              description="Pick the backend a native Orbisyn shell should use, and how updates are queued."
            />
            <div className="os-method-grid">
              {INSTALL_METHODS.map((method) => (
                <button
                  type="button"
                  key={method.id}
                  className={settings.installMethod === method.id ? 'is-active' : ''}
                  onClick={() => change('installMethod', method.id)}
                >
                  <span>
                    <DynamicIcon
                      name={settings.installMethod === method.id ? 'checkCircle' : 'package'}
                      size={17}
                    />
                  </span>
                  <strong>{method.label}</strong>
                  <small>{method.description}</small>
                </button>
              ))}
            </div>
            <div className="os-settings-toggles">
              <Toggle
                checked={settings.autoUpdate}
                onChange={(checked) => change('autoUpdate', checked)}
                label="Automatic updates"
                description="Install eligible updates in the background."
                icon="refresh"
              />
              <Toggle
                checked={settings.prereleases}
                onChange={(checked) => change('prereleases', checked)}
                label="Include prereleases"
                description="Show beta, RC and nightly channels separately."
                icon="flask"
              />
              <Toggle
                checked={settings.parallelDownloads}
                onChange={(checked) => change('parallelDownloads', checked)}
                label="Parallel downloads"
                description="Process more than one source at a time."
                icon="layers"
              />
            </div>
          </section>

          <section className="os-settings-card" id="security">
            <SectionHeading
              eyebrow="Verify everything"
              title="Security policy"
              description="These choices gate the simulated web install flow and the planned native install pipeline."
            />
            <div className="os-settings-toggles os-settings-toggles--one">
              <Toggle
                checked={settings.signatureCheck}
                onChange={(checked) => change('signatureCheck', checked)}
                label="Verify package signatures"
                description="Block an update whose signer differs from the installed build."
                icon="fingerprint"
              />
              <Toggle
                checked={settings.checksumCheck}
                onChange={(checked) => change('checksumCheck', checked)}
                label="Check published digests"
                description="Compare SHA-256 or SHA-512 hashes when the publisher provides them."
                icon="shield"
              />
              <Toggle
                checked={settings.sourcePinning}
                onChange={(checked) => change('sourcePinning', checked)}
                label="Pin apps to their source"
                description="Never silently switch a package to a different repository."
                icon="pin"
              />
              <Toggle
                checked={settings.quarantineUnknown}
                onChange={(checked) => change('quarantineUnknown', checked)}
                label="Quarantine unknown builds"
                description="Require review for community imports and unsigned artifacts."
                icon="lock"
              />
            </div>
            <div className="os-security-note">
              <DynamicIcon name="info" size={17} />
              <p>
                Orbisyn never invents a checksum or signer fingerprint. If upstream does not publish
                one, the security screen says so.
              </p>
            </div>
          </section>

          <section className="os-settings-card" id="network">
            <SectionHeading
              eyebrow="Connections"
              title="Network & gateway"
              description="Control when sources are refreshed and where the resolver API lives."
            />
            <div className="os-settings-toggles">
              <Toggle
                checked={settings.wifiOnly}
                onChange={(checked) => change('wifiOnly', checked)}
                label="Wi-Fi only updates"
                description="Pause large downloads on metered connections."
                icon="wifi"
              />
            </div>
            <label className="os-field">
              Gateway URL
              <div>
                <DynamicIcon name="link" size={16} />
                <input
                  value={settings.gatewayUrl}
                  onChange={(event) => change('gatewayUrl', event.target.value)}
                  placeholder="https://orbisyn.example.org"
                />
              </div>
              <small>
                Leave as /api for the current origin. For mobile and desktop shells, enter the
                gateway origin; API requests use its /api path.
              </small>
            </label>
            <button type="button" className="os-button os-button--outline" onClick={saveGateway}>
              <DynamicIcon name="refresh" size={16} /> Save gateway and reconnect
            </button>
            <div className="os-network-status">
              <span>
                <DynamicIcon name="radio" size={17} /> Same-origin API
              </span>
              <span>
                <DynamicIcon name="cloudDownload" size={17} /> Cache TTL: 5 minutes
              </span>
              <span>
                <DynamicIcon name="shield" size={17} /> No proxy credentials
              </span>
            </div>
          </section>

          <section className="os-settings-card" id="sync">
            <SectionHeading
              eyebrow="Your devices"
              title="End-to-end encrypted sync"
              description="Pair your own devices with a secret code. The gateway stores ciphertext; only devices holding the pairing key can read your library."
            />
            <p className="os-sync-status" role="status" aria-live="polite">
              {syncMessage ||
                (syncVault === null
                  ? 'No sync vault is linked to this device.'
                  : `Vault ${syncVault.id.slice(0, 8)}… · local revision ${syncVault.revision}`)}
            </p>
            <div className="os-data-actions">
              {syncVault === null ? (
                <button
                  type="button"
                  className="os-button os-button--primary"
                  onClick={createVault}
                >
                  <DynamicIcon name="lock" size={16} /> Create encrypted vault
                </button>
              ) : null}
              <button
                type="button"
                className="os-button os-button--outline"
                onClick={() => void syncNow()}
                disabled={syncBusy}
              >
                <DynamicIcon name={syncBusy ? 'refresh' : 'cloud'} size={16} />
                {syncBusy ? 'Syncing…' : 'Sync now'}
              </button>
              {syncVault !== null ? (
                <button
                  type="button"
                  className="os-button os-button--outline"
                  onClick={() => void copyPairing()}
                >
                  <DynamicIcon name="copy" size={16} /> Copy pairing code
                </button>
              ) : null}
            </div>
            {syncVault !== null ? (
              <label className="os-field">
                Pairing code — keep it private
                <textarea
                  readOnly
                  rows={3}
                  value={encodeSyncPairing(syncVault)}
                  aria-label="End-to-end sync pairing code"
                />
                <small>
                  Anyone with this code can access this vault. Share it only through a trusted
                  channel.
                </small>
              </label>
            ) : null}
            <label className="os-field">
              Pair another device
              <textarea
                rows={3}
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                placeholder="Paste an orbisyn-sync-v1 pairing code"
                aria-label="Paste sync pairing code"
              />
            </label>
            <div className="os-data-actions">
              <button
                type="button"
                className="os-button os-button--outline"
                onClick={importPairing}
                disabled={pairingCode.trim().length === 0}
              >
                <DynamicIcon name="link" size={16} /> Import pairing
              </button>
            </div>
            <div className="os-security-note">
              <DynamicIcon name="info" size={17} />
              <p>
                Pairing is self-hosted and accountless; it is not a hosted sign-in service. Use
                HTTPS when syncing over an untrusted network. Removing a pairing code from one
                device does not revoke copies already shared with other devices.
              </p>
            </div>
          </section>

          <section className="os-settings-card" id="privacy">
            <SectionHeading
              eyebrow="Privacy by default"
              title="Your data"
              description="The store works without an account. Telemetry stays off in this preview."
            />
            <div className="os-settings-toggles">
              <Toggle
                checked={settings.telemetry}
                onChange={(checked) => change('telemetry', checked)}
                label="Anonymous product telemetry"
                description="Currently disabled at the product level in this preview."
                icon="radio"
                disabled
              />
            </div>
            <div className="os-data-grid">
              <div>
                <strong>{Object.keys(state.installed).length}</strong>
                <span>installed records</span>
              </div>
              <div>
                <strong>{state.customSources.length}</strong>
                <span>custom sources</span>
              </div>
              <div>
                <strong>{state.collections.length}</strong>
                <span>collections</span>
              </div>
              <div>
                <strong>{state.externalApps.length}</strong>
                <span>imported references</span>
              </div>
            </div>
            <div className="os-data-actions">
              <button type="button" className="os-button os-button--outline" onClick={exportBackup}>
                <DynamicIcon name="download" size={16} /> Export backup
              </button>
              <button
                type="button"
                className="os-button os-button--outline"
                onClick={() => fileInput.current?.click()}
              >
                <DynamicIcon name="upload" size={16} /> Import backup
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="os-visually-hidden"
                onChange={(event) => void importBackup(event)}
                aria-label="Import settings backup"
              />
              <button
                type="button"
                className="os-button os-button--ghost"
                onClick={() => setConfirmReset(true)}
              >
                <DynamicIcon name="trash" size={16} /> Clear local data
              </button>
            </div>
          </section>

          <section className="os-settings-card" id="advanced">
            <SectionHeading
              eyebrow="Power tools"
              title="Advanced"
              description="Inspect the resolver engine, identity scheme and provider diagnostics."
            />
            <div className="os-advanced-grid">
              <Link to="/console">
                <DynamicIcon name="terminal" size={21} />
                <span>
                  <strong>Developer console</strong>
                  <small>Resolve any source reference and inspect diagnostics.</small>
                </span>
                <DynamicIcon name="arrow" size={17} />
              </Link>
              <Link to="/console/providers">
                <DynamicIcon name="layers" size={21} />
                <span>
                  <strong>Provider registry</strong>
                  <small>Capabilities and status for the six live adapters.</small>
                </span>
                <DynamicIcon name="arrow" size={17} />
              </Link>
              <Link to="/console/protocol">
                <DynamicIcon name="orbit" size={21} />
                <span>
                  <strong>OSP identity protocol</strong>
                  <small>Canonical app identities and presence documents.</small>
                </span>
                <DynamicIcon name="arrow" size={17} />
              </Link>
            </div>
            <div className="os-shortcuts">
              <span>
                <kbd>⌘</kbd>
                <kbd>K</kbd> Command palette
              </span>
              <span>
                <kbd>/</kbd> Focus search
              </span>
              <span>
                <kbd>Esc</kbd> Close overlays
              </span>
            </div>
            <div className="os-build-info">
              <span>Orbisyn Store preview</span>
              <span>Version 1.0.0</span>
              <span>React · TypeScript · Fastify · Vite</span>
            </div>
          </section>
        </div>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} size="sm">
        <div className="os-form">
          <span className="os-eyebrow">Confirm reset</span>
          <h2>Clear local data?</h2>
          <p>
            This removes your library, collections, source settings and imported references from
            this browser.
          </p>
          <div className="os-modal-actions">
            <button
              type="button"
              className="os-button os-button--outline"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="os-button os-button--danger"
              onClick={() => {
                window.localStorage.removeItem(STORE_STORAGE_KEY);
                resetDemo();
                setConfirmReset(false);
                showToast({
                  tone: 'info',
                  title: 'Local data cleared',
                  message: 'The default preview library has been restored.',
                });
              }}
            >
              Clear and reset
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
