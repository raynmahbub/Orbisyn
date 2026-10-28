import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AppCard,
  AppIcon,
  DynamicIcon,
  EmptyState,
  InstallButton,
  Modal,
  SectionHeading,
  SourcePill,
  TabBar,
  Toggle,
} from '../components/ui.js';
import { STORE_APP_BY_ID } from '../data/apps.js';
import { appsWithUpdates } from '../data/catalog.js';
import { createId, useStore } from '../StoreProvider.jsx';
import type { StoreApp } from '../types.js';

type LibraryTab = 'installed' | 'wishlist' | 'tracked' | 'collections' | 'external';

const COLLECTION_COLORS = ['#7c8cff', '#55d6a5', '#ffb86b', '#f58bd8', '#84d2ff', '#c191ff'];

export function LibraryScreen(): ReactNode {
  const {
    state,
    exportState,
    importState,
    resetDemo,
    showToast,
    uninstall,
    togglePinApp,
    toggleAutoUpdateApp,
    toggleTrack,
    addCollection,
    removeCollection,
    toggleCollectionApp,
  } = useStore();
  const [tab, setTab] = useState<LibraryTab>('installed');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLLECTION_COLORS[0] ?? '#7c8cff');
  const [collectionTarget, setCollectionTarget] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const installedApps = Object.keys(state.installed)
    .map((id) => STORE_APP_BY_ID[id])
    .filter((app): app is StoreApp => app !== undefined);
  const wishlistApps = state.wishlist
    .map((id) => STORE_APP_BY_ID[id])
    .filter((app): app is StoreApp => app !== undefined);
  const trackedApps = state.tracked
    .map((id) => STORE_APP_BY_ID[id])
    .filter((app): app is StoreApp => app !== undefined);
  const updates = appsWithUpdates().filter((app) => state.installed[app.id] !== undefined);

  const tabs: readonly { id: LibraryTab; label: string; count?: number }[] = [
    { id: 'installed', label: 'Installed', count: installedApps.length },
    { id: 'wishlist', label: 'Wishlist', count: wishlistApps.length },
    { id: 'tracked', label: 'Tracking', count: trackedApps.length },
    { id: 'collections', label: 'Collections', count: state.collections.length },
    { id: 'external', label: 'Imported', count: state.externalApps.length },
  ];

  const downloadBackup = (): void => {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orbisyn-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast({
      tone: 'success',
      title: 'Backup exported',
      message: 'Your library snapshot was downloaded as JSON.',
    });
  };

  const readImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!importState(parsed)) throw new Error('Unrecognized backup format');
      showToast({
        tone: 'success',
        title: 'Library restored',
        message: `${file.name} was imported into this browser.`,
      });
    } catch (error) {
      showToast({
        tone: 'error',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'The file could not be read.',
      });
    }
    event.target.value = '';
  };

  const createCollection = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    addCollection({
      id: createId('collection'),
      name: name.trim(),
      description: description.trim() || 'A personal Orbisyn collection.',
      appIds: [],
      color,
    });
    setName('');
    setDescription('');
    setCreateOpen(false);
    showToast({
      tone: 'success',
      title: 'Collection created',
      message: 'Add apps from their detail pages.',
    });
  };

  return (
    <div className="os-page os-library">
      <section className="os-page-hero os-page-hero--library">
        <div>
          <span className="os-eyebrow">Your local universe</span>
          <h1>Everything you chose. In one place.</h1>
          <p>
            Installed apps, saved ideas, tracked sources and imported libraries all live together —
            under your control.
          </p>
        </div>
        <div className="os-library-stats">
          <div>
            <strong>{installedApps.length}</strong>
            <span>installed</span>
          </div>
          <div>
            <strong>{updates.length}</strong>
            <span>updates</span>
          </div>
          <div>
            <strong>{wishlistApps.length}</strong>
            <span>saved</span>
          </div>
          <div>
            <strong>{state.collections.length}</strong>
            <span>collections</span>
          </div>
        </div>
      </section>

      <div className="os-library-data-bar">
        <div>
          <DynamicIcon name="fingerprint" size={18} />
          <span>
            <strong>Local-first</strong> · Data is stored in this browser
          </span>
        </div>
        <div className="os-library-data-bar__actions">
          <button
            type="button"
            className="os-button os-button--outline os-button--sm"
            onClick={downloadBackup}
          >
            <DynamicIcon name="download" size={15} /> Export
          </button>
          <button
            type="button"
            className="os-button os-button--outline os-button--sm"
            onClick={() => fileInput.current?.click()}
          >
            <DynamicIcon name="upload" size={15} /> Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="os-visually-hidden"
            onChange={(event) => void readImport(event)}
            aria-label="Import Orbisyn backup"
          />
          <button
            type="button"
            className="os-button os-button--ghost os-button--sm"
            onClick={() => {
              resetDemo();
              showToast({
                tone: 'info',
                title: 'Preview reset',
                message: 'The local demo library was restored to its defaults.',
              });
            }}
          >
            <DynamicIcon name="refresh" size={15} /> Reset demo
          </button>
        </div>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'installed' ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="On this device"
            title="Installed apps"
            description="Manage source pinning, automatic updates and removal."
          />
          {installedApps.length === 0 ? (
            <EmptyState
              icon="package"
              title="No apps installed yet"
              message="Install an app from Discover or Explore to see it in your library."
              action={
                <Link to="/explore" className="os-button os-button--primary">
                  Browse apps
                </Link>
              }
            />
          ) : (
            <div className="os-installed-list">
              {installedApps.map((app) => {
                const entry = state.installed[app.id];
                const updateReady = updates.some((pending) => pending.id === app.id);
                return (
                  <article key={app.id} className="os-installed-item">
                    <AppIcon app={app} size={54} />
                    <div className="os-installed-item__identity">
                      <Link to={`/app/${app.id}`}>
                        <strong>{app.name}</strong>
                      </Link>
                      <span>{app.developer}</span>
                      <div>
                        <SourcePill id={entry?.sourceId ?? 'forge'} short />{' '}
                        <em>v{entry?.version ?? app.demoVersion}</em>
                      </div>
                    </div>
                    <div className="os-installed-item__status">
                      {updateReady ? (
                        <span className="os-status-chip os-status-chip--warning">
                          <DynamicIcon name="download" size={13} /> Update ready
                        </span>
                      ) : (
                        <span className="os-status-chip os-status-chip--success">
                          <DynamicIcon name="checkCircle" size={13} /> Up to date
                        </span>
                      )}
                      {entry?.pinned === true ? (
                        <span className="os-status-chip">
                          <DynamicIcon name="pin" size={13} /> Pinned
                        </span>
                      ) : null}
                    </div>
                    <div className="os-installed-item__actions">
                      <InstallButton app={app} size="sm" />
                      <button
                        type="button"
                        className="os-icon-button"
                        onClick={() => togglePinApp(app.id)}
                        title={entry?.pinned === true ? 'Unpin version' : 'Pin version'}
                        aria-label={entry?.pinned === true ? 'Unpin version' : 'Pin version'}
                      >
                        <DynamicIcon name={entry?.pinned === true ? 'pinOff' : 'pin'} size={17} />
                      </button>
                      <button
                        type="button"
                        className="os-icon-button"
                        onClick={() => {
                          uninstall(app.id);
                          showToast({
                            tone: 'info',
                            title: 'Removed from library',
                            message: `${app.name} was removed from this browser’s library.`,
                          });
                        }}
                        title="Uninstall"
                        aria-label={`Uninstall ${app.name}`}
                      >
                        <DynamicIcon name="trash" size={17} />
                      </button>
                    </div>
                    <div className="os-installed-item__auto">
                      <Toggle
                        checked={entry?.autoUpdate ?? false}
                        onChange={() => toggleAutoUpdateApp(app.id)}
                        label="Auto"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'wishlist' ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="Saved for later"
            title="Wishlist"
            description="Apps you want to remember without installing."
          />
          {wishlistApps.length === 0 ? (
            <EmptyState
              icon="bookmark"
              title="Your wishlist is empty"
              message="Tap Save on any app to keep it here."
              action={
                <Link to="/explore" className="os-button os-button--primary">
                  Explore apps
                </Link>
              }
            />
          ) : (
            <div className="os-app-grid">
              {wishlistApps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'tracked' ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="Source watch"
            title="Tracked apps"
            description="Follow release activity without adding an app to your device."
          />
          {trackedApps.length === 0 ? (
            <EmptyState
              icon="radio"
              title="No tracked sources"
              message="Track an app to watch its upstream releases."
            />
          ) : (
            <div className="os-tracked-list">
              {trackedApps.map((app) => (
                <article key={app.id}>
                  <AppIcon app={app} size={44} rounded={14} />
                  <div>
                    <Link to={`/app/${app.id}`}>
                      <strong>{app.name}</strong>
                    </Link>
                    <span>{app.reference}</span>
                  </div>
                  <div className="os-tracked-list__sources">
                    {app.sourceIds.slice(0, 2).map((source) => (
                      <SourcePill key={source} id={source} short />
                    ))}
                  </div>
                  <Link
                    to={`/app/${app.id}`}
                    className="os-icon-button"
                    aria-label={`Open ${app.name}`}
                  >
                    <DynamicIcon name="chevronRight" size={17} />
                  </Link>
                  <button
                    type="button"
                    className="os-icon-button"
                    onClick={() => toggleTrack(app.id)}
                    aria-label={`Stop tracking ${app.name}`}
                  >
                    <DynamicIcon name="x" size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'collections' ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="Curated by you"
            title="Collections"
            description="Group apps for devices, workflows or people."
            action={
              <button
                type="button"
                className="os-button os-button--primary os-button--sm"
                onClick={() => setCreateOpen(true)}
              >
                <DynamicIcon name="plus" size={16} /> New collection
              </button>
            }
          />
          <div className="os-collection-grid">
            {state.collections.map((collection) => (
              <article
                key={collection.id}
                className="os-collection-card"
                style={{ '--collection-color': collection.color } as CSSProperties}
              >
                <div className="os-collection-card__head">
                  <span>
                    <DynamicIcon name="folderPlus" size={21} />
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCollection(collection.id)}
                    aria-label={`Delete ${collection.name}`}
                  >
                    <DynamicIcon name="trash" size={16} />
                  </button>
                </div>
                <h3>{collection.name}</h3>
                <p>{collection.description}</p>
                <div className="os-collection-card__apps">
                  {collection.appIds.length === 0 ? (
                    <span>Empty — add apps from their detail pages.</span>
                  ) : (
                    collection.appIds.slice(0, 7).map((id) => {
                      const app = STORE_APP_BY_ID[id];
                      return app === undefined ? null : (
                        <AppIcon key={id} app={app} size={36} rounded={11} />
                      );
                    })
                  )}
                </div>
                <footer>
                  <span>{collection.appIds.length} apps</span>
                  <button type="button" onClick={() => setCollectionTarget(collection.id)}>
                    Manage
                  </button>
                </footer>
              </article>
            ))}
            <button
              type="button"
              className="os-collection-card os-collection-card--new"
              onClick={() => setCreateOpen(true)}
            >
              <DynamicIcon name="plus" size={28} />
              <strong>Create a collection</strong>
              <span>Build a setup for a device or a project.</span>
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'external' ? (
        <section className="os-section">
          <SectionHeading
            eyebrow="Imported sources"
            title="External apps"
            description="Apps imported from Obtainium exports, custom registries or direct URLs."
            action={
              <Link to="/sources" className="os-button os-button--outline os-button--sm">
                <DynamicIcon name="plus" size={15} /> Add source
              </Link>
            }
          />
          {state.externalApps.length === 0 ? (
            <EmptyState
              icon="fileJson"
              title="No external apps yet"
              message="Import an Obtainium JSON export or add a custom registry from the Sources screen."
              action={
                <Link to="/sources" className="os-button os-button--primary">
                  Import library
                </Link>
              }
            />
          ) : (
            <div className="os-external-list">
              {state.externalApps.map((app) => (
                <article key={app.id}>
                  <span className="os-external-list__icon">
                    <DynamicIcon name="link" size={19} />
                  </span>
                  <div>
                    <strong>{app.name}</strong>
                    <span>{app.url}</span>
                    <small>
                      {app.sourceName}
                      {app.packageId !== undefined ? ` · ${app.packageId}` : ''}
                    </small>
                  </div>
                  <Link
                    to={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="os-icon-button"
                    aria-label={`Open ${app.name} source`}
                  >
                    <DynamicIcon name="external" size={17} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} size="sm">
        <form className="os-form" onSubmit={createCollection}>
          <span className="os-eyebrow">New collection</span>
          <h2>Create a space for your apps</h2>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Travel phone"
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs here?"
              rows={3}
            />
          </label>
          <div className="os-color-picker">
            {COLLECTION_COLORS.map((option) => (
              <button
                type="button"
                key={option}
                className={color === option ? 'is-active' : ''}
                style={{ background: option }}
                onClick={() => setColor(option)}
                aria-label={`Use ${option} color`}
              />
            ))}
          </div>
          <button type="submit" className="os-button os-button--primary os-button--full">
            Create collection
          </button>
        </form>
      </Modal>

      <Modal
        open={collectionTarget !== undefined}
        onClose={() => setCollectionTarget(undefined)}
        size="sm"
      >
        {(() => {
          const collection = state.collections.find((entry) => entry.id === collectionTarget);
          if (collection === undefined) return null;
          return (
            <div className="os-form">
              <span className="os-eyebrow">Manage collection</span>
              <h2>{collection.name}</h2>
              <p>Select apps to include in this collection.</p>
              <div className="os-collection-picker">
                {Object.values(STORE_APP_BY_ID)
                  .slice(0, 24)
                  .map((app) => (
                    <button
                      type="button"
                      key={app.id}
                      className={collection.appIds.includes(app.id) ? 'is-active' : ''}
                      onClick={() => toggleCollectionApp(collection.id, app.id)}
                    >
                      <AppIcon app={app} size={30} rounded={9} />
                      <span>{app.name}</span>
                      {collection.appIds.includes(app.id) ? (
                        <DynamicIcon name="check" size={15} />
                      ) : (
                        <DynamicIcon name="plus" size={15} />
                      )}
                    </button>
                  ))}
              </div>
              <button
                type="button"
                className="os-button os-button--primary os-button--full"
                onClick={() => setCollectionTarget(undefined)}
              >
                Done
              </button>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
