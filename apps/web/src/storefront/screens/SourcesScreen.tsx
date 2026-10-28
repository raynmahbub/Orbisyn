import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { DynamicIcon, EmptyState, SectionHeading, SourcePill, Toggle } from '../components/ui.js';
import { BRIDGES, CUSTOM_SOURCE_KINDS, sourceModeLabel } from '../data/sources.js';
import { createId, useStore } from '../StoreProvider.jsx';
import type { BridgeId, CustomSource, ExternalApp } from '../types.js';

const OSP_EXAMPLE = `{
  "name": "My community registry",
  "osp": "1.0",
  "apps": [
    {
      "id": "com.example.app",
      "name": "Example App",
      "reference": "https://github.com/example/app",
      "license": "MIT"
    }
  ]
}`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const part = parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.hostname;
    return decodeURIComponent(part)
      .replace(/[-_]+/g, ' ')
      .replace(/\.json$/i, '');
  } catch {
    return url;
  }
}

function parseRegistry(
  value: unknown,
  fallbackSource: string,
): {
  readonly apps: ExternalApp[];
  readonly registryName: string;
} {
  const root = asRecord(value);
  const registryName = asString(root?.name) ?? fallbackSource;
  const candidates = Array.isArray(root?.apps)
    ? root.apps
    : Array.isArray(root?.entries)
      ? root.entries
      : [];
  const now = new Date().toISOString();
  const apps = candidates
    .map((entry): ExternalApp | null => {
      const record = asRecord(entry);
      if (record === null) return null;
      const url = asString(record.url) ?? asString(record.reference) ?? asString(record.sourceUrl);
      if (url === undefined) return null;
      const id = asString(record.id) ?? asString(record.packageId) ?? `${registryName}:${url}`;
      const name = asString(record.name) ?? asString(record.appName) ?? nameFromUrl(url);
      const sourceName = asString(record.sourceId) ?? asString(record.sourceName) ?? registryName;
      return {
        id: `${sourceName}:${id}`,
        name,
        url,
        sourceName,
        ...(asString(record.id) === undefined ? {} : { packageId: asString(record.id) as string }),
        addedAt: now,
      };
    })
    .filter((entry): entry is ExternalApp => entry !== null);
  return { apps, registryName };
}

function detectKind(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('aurora') || lower.includes('play.google.com')) return 'aurora';
  if (lower.includes('f-droid') || lower.includes('fdroid') || lower.includes('izzy'))
    return 'fdroid';
  if (lower.includes('obtainium')) return 'obtainium';
  if (lower.includes('komi') || lower.includes('github-store')) return 'komi';
  if (
    lower.includes('osp') ||
    lower.includes('registry') ||
    lower.includes('odion') ||
    lower.includes('otherz')
  )
    return 'osp';
  if (
    lower.endsWith('.apk') ||
    lower.endsWith('.appimage') ||
    lower.endsWith('.dmg') ||
    lower.endsWith('.exe')
  )
    return 'direct';
  return 'forge';
}

export function SourcesScreen(): ReactNode {
  const {
    state,
    toggleSource,
    addCustomSource,
    updateCustomSourceStatus,
    removeCustomSource,
    importExternalApps,
    showToast,
    notify,
  } = useStore();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('forge');
  const [kindTouched, setKindTouched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | undefined>(undefined);
  const [showProtocol, setShowProtocol] = useState(false);
  const obtainiumInput = useRef<HTMLInputElement>(null);
  const ospInput = useRef<HTMLInputElement>(null);

  const enabled = BRIDGES.filter((bridge) => state.sourceEnabled[bridge.id] === true);
  const live = BRIDGES.filter((bridge) => bridge.mode === 'live');

  const addSource = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        throw new Error('HTTPS required');
      }
    } catch {
      showToast({
        tone: 'error',
        title: 'Use a valid HTTPS URL',
        message: 'Custom sources must point to an HTTPS registry, repository or artifact.',
      });
      return;
    }
    const meta = CUSTOM_SOURCE_KINDS.find((entry) => entry.id === kind) ?? CUSTOM_SOURCE_KINDS[0];
    if (meta === undefined) return;
    const source: CustomSource = {
      id: createId('source'),
      name: name.trim() || nameFromUrl(trimmed),
      url: trimmed,
      kind: meta.id,
      bridgeId: meta.bridgeId,
      addedAt: new Date().toISOString(),
      status:
        meta.id === 'aurora'
          ? 'session-required'
          : meta.id === 'osp' || meta.id === 'komi'
            ? 'pending'
            : 'connected',
    };
    setAdding(true);
    addCustomSource(source);
    if (!state.sourceEnabled[source.bridgeId]) toggleSource(source.bridgeId);
    setName('');
    setUrl('');
    setKindTouched(false);
    setAdding(false);
    showToast({
      tone: 'success',
      title: 'Source added',
      message: `${source.name} is now part of your source mesh.`,
    });
    notify('Source connected', `${source.name} was added from ${parsed.hostname}.`, 'success');

    if (['forge', 'fdroid', 'obtainium', 'direct'].includes(meta.id)) {
      setVerifyingId(source.id);
      try {
        const response = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ reference: trimmed, releases: 1, refresh: false }),
        });
        updateCustomSourceStatus(source.id, response.ok ? 'connected' : 'pending');
      } catch {
        updateCustomSourceStatus(source.id, 'pending');
      } finally {
        setVerifyingId(undefined);
      }
    }
  };

  const handleImport = async (
    event: ChangeEvent<HTMLInputElement>,
    fallbackSource: string,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = parseRegistry(parsed, fallbackSource);
      if (result.apps.length === 0) throw new Error('No app references were found in this file.');
      importExternalApps(result.apps);
      const source: CustomSource = {
        id: createId('source'),
        name: result.registryName,
        url: file.name,
        kind: fallbackSource === 'Obtainium' ? 'obtainium' : 'osp',
        bridgeId: fallbackSource === 'Obtainium' ? 'obtainium' : 'community',
        addedAt: new Date().toISOString(),
        status: 'connected',
      };
      addCustomSource(source);
      showToast({
        tone: 'success',
        title: `${fallbackSource} import complete`,
        message: `${result.apps.length} app references were added to your imported library.`,
      });
      notify('Library imported', `${result.apps.length} references from ${file.name}.`, 'success');
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'The JSON file could not be parsed.',
      });
    }
    event.target.value = '';
  };

  const verifyCustom = async (source: CustomSource): Promise<void> => {
    setVerifyingId(source.id);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ reference: source.url, releases: 1, refresh: true }),
      });
      updateCustomSourceStatus(source.id, response.ok ? 'connected' : 'pending');
      showToast({
        tone: response.ok ? 'success' : 'warning',
        title: response.ok ? 'Source verified' : 'Source needs review',
        message: response.ok
          ? `${source.name} answered through the live provider engine.`
          : 'The gateway could not resolve this reference yet.',
      });
    } catch {
      updateCustomSourceStatus(source.id, 'pending');
      showToast({
        tone: 'warning',
        title: 'Gateway unavailable',
        message: 'Start the API gateway to perform live source verification.',
      });
    } finally {
      setVerifyingId(undefined);
    }
  };

  return (
    <div className="os-page os-sources">
      <section className="os-page-hero os-page-hero--sources">
        <div>
          <span className="os-eyebrow">Source mesh</span>
          <h1>Connect the stores you already trust.</h1>
          <p>
            Orbisyn unifies live APIs, signed repository indexes, direct release tracking, companion
            handoffs and community registries — with the limits of each shown clearly.
          </p>
        </div>
        <div className="os-sources-summary">
          <div>
            <strong>{enabled.length}</strong>
            <span>active bridges</span>
          </div>
          <div>
            <strong>{live.length}</strong>
            <span>live engines</span>
          </div>
          <div>
            <strong>{state.customSources.length}</strong>
            <span>custom sources</span>
          </div>
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Named stores, one model"
          title="The compatibility map"
          description="Komi Store is the successor to GitHub Store, so Orbisyn treats both as one lineage."
        />
        <div className="os-bridge-grid">
          {BRIDGES.map((bridge) => (
            <article
              key={bridge.id}
              className="os-bridge-card"
              style={{ '--bridge-color': bridge.accent } as CSSProperties}
            >
              <div className="os-bridge-card__head">
                <span className="os-bridge-card__icon">
                  <DynamicIcon name={bridge.icon} size={24} />
                </span>
                <span className={`os-mode-badge os-mode-badge--${bridge.mode}`}>
                  {sourceModeLabel(bridge.mode)}
                </span>
              </div>
              <h3>{bridge.name}</h3>
              <p>{bridge.description}</p>
              <div className="os-bridge-card__lineage">
                {bridge.lineage.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="os-bridge-card__capabilities">
                {bridge.capabilities.map((capability) => (
                  <span key={capability}>
                    <DynamicIcon name="check" size={13} /> {capability}
                  </span>
                ))}
              </div>
              <div className="os-bridge-card__note">
                <DynamicIcon name="info" size={15} /> {bridge.note}
              </div>
              <footer>
                <div>
                  <strong>{bridge.requirement}</strong>
                  <span>{bridge.platforms.join(' · ')}</span>
                </div>
                <Toggle
                  checked={state.sourceEnabled[bridge.id] === true}
                  onChange={() => toggleSource(bridge.id)}
                  label={`Enable ${bridge.name}`}
                />
              </footer>
            </article>
          ))}
        </div>
      </section>

      <div className="os-section os-two-column">
        <section className="os-panel os-add-source">
          <SectionHeading
            eyebrow="Bring your own"
            title="Add a custom source"
            description="Use an HTTPS repository, signed index, catalog export or direct artifact URL."
          />
          <form className="os-form" onSubmit={(event) => void addSource(event)}>
            <label>
              Source name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My university forge"
              />
            </label>
            <label>
              Source URL
              <input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (!kindTouched) setKind(detectKind(event.target.value));
                }}
                placeholder="https://github.com/owner/repo"
                required
              />
            </label>
            <label>
              Source type
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setKindTouched(true);
                }}
              >
                {CUSTOM_SOURCE_KINDS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="os-button os-button--primary os-button--full"
              disabled={adding}
            >
              <DynamicIcon name="plus" size={17} /> Add to source mesh
            </button>
          </form>
          <div className="os-source-privacy">
            <DynamicIcon name="shield" size={17} />
            <p>
              Credentials stay on your device in the native app. This web preview stores only
              non-secret source URLs and preferences locally.
            </p>
          </div>
        </section>

        <section className="os-panel os-import-panel">
          <SectionHeading
            eyebrow="Move in"
            title="Import an existing library"
            description="Bring app references from popular store export formats."
          />
          <div className="os-import-actions">
            <button type="button" onClick={() => obtainiumInput.current?.click()}>
              <span className="os-import-actions__icon os-import-actions__icon--orange">
                <DynamicIcon name="link" size={21} />
              </span>
              <span>
                <strong>Obtainium export</strong>
                <small>Reads the `apps` array from your JSON backup.</small>
              </span>
              <DynamicIcon name="upload" size={18} />
            </button>
            <input
              ref={obtainiumInput}
              type="file"
              accept="application/json,.json"
              className="os-visually-hidden"
              onChange={(event) => void handleImport(event, 'Obtainium')}
              aria-label="Import Obtainium JSON"
            />
            <button type="button" onClick={() => ospInput.current?.click()}>
              <span className="os-import-actions__icon os-import-actions__icon--violet">
                <DynamicIcon name="fileJson" size={21} />
              </span>
              <span>
                <strong>OSP community registry</strong>
                <small>Odion / Otherz / custom JSON catalogs.</small>
              </span>
              <DynamicIcon name="upload" size={18} />
            </button>
            <input
              ref={ospInput}
              type="file"
              accept="application/json,.json"
              className="os-visually-hidden"
              onChange={(event) => void handleImport(event, 'Community registry')}
              aria-label="Import OSP registry JSON"
            />
            <button
              type="button"
              onClick={() => {
                setKind('fdroid');
                setKindTouched(true);
                setUrl('https://f-droid.org/repo');
                setName('F-Droid main repository');
                showToast({
                  tone: 'info',
                  title: 'Repository template loaded',
                  message: 'Review the URL and add the F-Droid repository to your mesh.',
                });
              }}
            >
              <span className="os-import-actions__icon os-import-actions__icon--green">
                <DynamicIcon name="repo" size={21} />
              </span>
              <span>
                <strong>Droid-ify / F-Droid repo</strong>
                <small>Load the official signed repository template.</small>
              </span>
              <DynamicIcon name="arrow" size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setKind('aurora');
                setKindTouched(true);
                setUrl('https://play.google.com/store');
                setName('Aurora / Play handoff');
                if (!state.sourceEnabled.aurora) toggleSource('aurora');
                showToast({
                  tone: 'warning',
                  title: 'Companion handoff enabled',
                  message: 'Orbisyn will link to your local Aurora session without proxying Play.',
                });
              }}
            >
              <span className="os-import-actions__icon os-import-actions__icon--pink">
                <DynamicIcon name="sparkles" size={21} />
              </span>
              <span>
                <strong>Aurora / Play bridge</strong>
                <small>Link proprietary listings through a companion session.</small>
              </span>
              <DynamicIcon name="arrow" size={18} />
            </button>
          </div>
          <button
            type="button"
            className="os-text-link"
            onClick={() => setShowProtocol((open) => !open)}
          >
            {showProtocol ? 'Hide' : 'View'} OSP registry example{' '}
            <DynamicIcon
              name="chevronDown"
              size={15}
              className={showProtocol ? 'os-rotate-180' : ''}
            />
          </button>
          {showProtocol ? <pre className="os-code-block">{OSP_EXAMPLE}</pre> : null}
        </section>
      </div>

      <section className="os-section">
        <SectionHeading
          eyebrow="Your connections"
          title="Custom sources"
          description="Source status is honest: verified, pending or awaiting a companion session."
        />
        {state.customSources.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No custom sources yet"
            message="Add a repository or import a store export to see it here."
          />
        ) : (
          <div className="os-custom-sources">
            {state.customSources.map((source) => (
              <article key={source.id}>
                <span
                  className="os-custom-sources__icon"
                  style={
                    {
                      '--source-color':
                        BRIDGES.find((bridge) => bridge.id === source.bridgeId)?.accent ??
                        '#7c8cff',
                    } as CSSProperties
                  }
                >
                  <DynamicIcon
                    name={BRIDGES.find((bridge) => bridge.id === source.bridgeId)?.icon ?? 'link'}
                    size={20}
                  />
                </span>
                <div className="os-custom-sources__identity">
                  <strong>{source.name}</strong>
                  <span>{source.url}</span>
                  <small>
                    {CUSTOM_SOURCE_KINDS.find((entry) => entry.id === source.kind)?.label ??
                      source.kind}
                  </small>
                </div>
                <div className="os-custom-sources__bridge">
                  <SourcePill id={source.bridgeId} short />
                </div>
                <span className={`os-source-status os-source-status--${source.status}`}>
                  <i /> {verifyingId === source.id ? 'Verifying…' : source.status.replace('-', ' ')}
                </span>
                <div className="os-custom-sources__actions">
                  <button
                    type="button"
                    className="os-icon-button"
                    onClick={() => void verifyCustom(source)}
                    aria-label={`Verify ${source.name}`}
                    title="Verify live"
                  >
                    <DynamicIcon
                      name={verifyingId === source.id ? 'refresh' : 'shield'}
                      size={17}
                      className={verifyingId === source.id ? 'os-spin' : ''}
                    />
                  </button>
                  {source.url.startsWith('http') ? (
                    <Link
                      to={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="os-icon-button"
                      aria-label={`Open ${source.name}`}
                    >
                      <DynamicIcon name="external" size={17} />
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="os-icon-button"
                    onClick={() => removeCustomSource(source.id)}
                    aria-label={`Remove ${source.name}`}
                  >
                    <DynamicIcon name="trash" size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="No smoke and mirrors"
          title="What Orbisyn does — and does not — integrate"
        />
        <div className="os-truth-table">
          <div className="os-truth-table__head">
            <span>Source family</span>
            <span>Method</span>
            <span>What is real</span>
            <span>What requires a native shell</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="git" size={16} /> GitHub / GitLab / Codeberg / Forgejo
            </span>
            <span>Public API</span>
            <span>Release, asset, checksum and repository metadata</span>
            <span>Silent install and APK package-manager actions</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="orbit" size={16} /> Komi / GitHub Store
            </span>
            <span>Catalog bridge</span>
            <span>Reference import and deduplication</span>
            <span>Reading a private on-device catalog</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="repo" size={16} /> F-Droid / Droid-ify
            </span>
            <span>Signed index</span>
            <span>APK hashes, versions and signer evidence</span>
            <span>Installing to the Android system</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="link" size={16} /> Obtainium / direct URL
            </span>
            <span>URL tracking</span>
            <span>Source settings and artifact page discovery</span>
            <span>Background update service</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="sparkles" size={16} /> Aurora / Play
            </span>
            <span>Local handoff</span>
            <span>Library linking and companion deep links</span>
            <span>Authenticated session and installation</span>
          </div>
          <div>
            <span>
              <DynamicIcon name="users" size={16} /> Odion / Otherz / community
            </span>
            <span>OSP registry</span>
            <span>Portable JSON app references</span>
            <span>Registry signing and device trust policy</span>
          </div>
        </div>
        <div className="os-source-legal-note">
          <DynamicIcon name="info" size={18} />
          <p>
            Orbisyn does not scrape Google Play, share credentials, bypass paid apps or claim
            ownership of third-party catalogs. Each source remains subject to its own terms and
            publisher controls.
          </p>
        </div>
      </section>
    </div>
  );
}

export function availableBridgeIds(): readonly BridgeId[] {
  return BRIDGES.map((bridge) => bridge.id);
}
