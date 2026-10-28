import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AppCard,
  AppIcon,
  DynamicIcon,
  EmptyState,
  Modal,
  SectionHeading,
  SourcePill,
} from '../components/ui.js';
import {
  CATEGORIES,
  filterApps,
  getApp,
  type PlatformFilter,
  type SortMode,
} from '../data/catalog.js';
import { BRIDGES, PLATFORM_FILTERS, sourceModeLabel } from '../data/sources.js';
import { useStore } from '../StoreProvider.jsx';
import type { BridgeId, Category, StoreApp } from '../types.js';

const SORT_OPTIONS: readonly { id: SortMode; label: string }[] = [
  { id: 'relevance', label: 'Best match' },
  { id: 'fresh', label: 'Recently updated' },
  { id: 'sources', label: 'Most sources' },
  { id: 'name', label: 'Name A–Z' },
];

function parseCategory(value: string | null): Category | 'all' {
  return CATEGORIES.some((category) => category.id === value) ? (value as Category) : 'all';
}

function parsePlatform(value: string | null): PlatformFilter {
  return PLATFORM_FILTERS.some((entry) => entry.id === value) ? (value as PlatformFilter) : 'all';
}

function parseSource(value: string | null): BridgeId | 'all' {
  return BRIDGES.some((bridge) => bridge.id === value) ? (value as BridgeId) : 'all';
}

function parseSort(value: string | null): SortMode {
  return SORT_OPTIONS.some((option) => option.id === value) ? (value as SortMode) : 'relevance';
}

export function ExploreScreen(): ReactNode {
  const [params, setParams] = useSearchParams();
  const { state } = useStore();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const query = params.get('q') ?? '';
  const category = parseCategory(params.get('category'));
  const platform = parsePlatform(params.get('platform'));
  const source = parseSource(params.get('source'));
  const sort = parseSort(params.get('sort'));
  const openSourceOnly = params.get('open') === '1';
  const verifiedOnly = params.get('verified') === '1';
  const enabledOnly = params.get('scope') !== 'all';

  const [searchInput, setSearchInput] = useState(query);
  useEffect(() => setSearchInput(query), [query]);

  const updateParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === 'all' || value === '0') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const baseFilters = {
    query,
    platform,
    source,
    sort,
    openSourceOnly,
    verifiedOnly,
    enabledSources: enabledOnly ? state.sourceEnabled : undefined,
  };
  const apps = filterApps({ ...baseFilters, category });
  const withoutCategory = filterApps({ ...baseFilters, category: 'all' });
  const categoryCounts: Record<string, number> = {};
  for (const app of withoutCategory) {
    categoryCounts[app.category] = (categoryCounts[app.category] ?? 0) + 1;
  }

  const activeFilterCount = [
    query.length > 0,
    category !== 'all',
    platform !== 'all',
    source !== 'all',
    openSourceOnly,
    verifiedOnly,
    !enabledOnly,
  ].filter(Boolean).length;

  const clearFilters = (): void => setParams(new URLSearchParams(), { replace: true });
  const toggleCompare = (appId: string): void => {
    setSelected((current) => {
      if (current.includes(appId)) return current.filter((id) => id !== appId);
      if (current.length >= 3) return [...current.slice(1), appId];
      return [...current, appId];
    });
  };

  return (
    <div className="os-page os-explore">
      <section className="os-page-hero os-page-hero--explore">
        <div>
          <span className="os-eyebrow">Unified catalog</span>
          <h1>Find the right app. From any source.</h1>
          <p>
            Search curated listings, then compare platform support, licenses and source evidence
            side by side.
          </p>
        </div>
        <div className="os-page-hero__search">
          <DynamicIcon name="search" size={22} />
          <input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              updateParam('q', event.target.value);
            }}
            placeholder="Try “password”, “offline”, “APK”, or a developer…"
            aria-label="Search apps"
          />
          {searchInput.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                updateParam('q', null);
              }}
              aria-label="Clear search"
            >
              <DynamicIcon name="x" size={18} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
      </section>

      <div className="os-explore-layout">
        <aside className="os-filter-panel">
          <div className="os-filter-panel__head">
            <h2>
              <DynamicIcon name="filter" size={18} /> Filters
            </h2>
            {activeFilterCount > 0 ? (
              <button type="button" onClick={clearFilters}>
                Clear all
              </button>
            ) : null}
          </div>

          <div className="os-filter-group">
            <span className="os-filter-group__label">Platform</span>
            <div className="os-filter-chips">
              {PLATFORM_FILTERS.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={platform === entry.id ? 'is-active' : ''}
                  onClick={() => updateParam('platform', entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="os-filter-group">
            <span className="os-filter-group__label">Category</span>
            <div className="os-filter-list">
              <button
                type="button"
                className={category === 'all' ? 'is-active' : ''}
                onClick={() => updateParam('category', 'all')}
              >
                <span>All categories</span>
                <em>{filterApps({ ...baseFilters, category: 'all' }).length}</em>
              </button>
              {CATEGORIES.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={category === entry.id ? 'is-active' : ''}
                  onClick={() => updateParam('category', entry.id)}
                >
                  <span>
                    <DynamicIcon name={entry.icon} size={15} /> {entry.id}
                  </span>
                  <em>{categoryCounts[entry.id] ?? 0}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="os-filter-group">
            <span className="os-filter-group__label">Source lens</span>
            <div className="os-filter-list os-filter-list--compact">
              <button
                type="button"
                className={source === 'all' ? 'is-active' : ''}
                onClick={() => updateParam('source', 'all')}
              >
                <span>All sources</span>
                <em>{filterApps({ ...baseFilters, source: 'all', category }).length}</em>
              </button>
              {BRIDGES.map((bridge) => (
                <button
                  type="button"
                  key={bridge.id}
                  className={source === bridge.id ? 'is-active' : ''}
                  onClick={() => updateParam('source', bridge.id)}
                  title={`${sourceModeLabel(bridge.mode)} · ${bridge.requirement}`}
                >
                  <span>
                    <i style={{ background: bridge.accent }} /> {bridge.lineage[0]}
                  </span>
                  <em>{filterApps({ ...baseFilters, source: bridge.id, category }).length}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="os-filter-group">
            <span className="os-filter-group__label">Listing quality</span>
            <label className="os-checkbox-row">
              <input
                type="checkbox"
                checked={openSourceOnly}
                onChange={(event) => updateParam('open', event.target.checked ? '1' : null)}
              />
              <span>Open source only</span>
            </label>
            <label className="os-checkbox-row">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(event) => updateParam('verified', event.target.checked ? '1' : null)}
              />
              <span>Source verified only</span>
            </label>
            <label className="os-checkbox-row">
              <input
                type="checkbox"
                checked={enabledOnly}
                onChange={(event) => updateParam('scope', event.target.checked ? null : 'all')}
              />
              <span>Only enabled sources</span>
            </label>
          </div>

          <div className="os-filter-panel__note">
            <DynamicIcon name="info" size={16} />
            <p>
              Version numbers in the preview catalog are sample metadata. Use an app’s live
              verification for upstream facts.
            </p>
          </div>
        </aside>

        <section className="os-results">
          <div className="os-results__toolbar">
            <div>
              <strong>{apps.length}</strong> {apps.length === 1 ? 'app' : 'apps'}
              {query.length > 0 ? <span> for “{query}”</span> : null}
            </div>
            <div className="os-results__toolbar-actions">
              <label className="os-select">
                <span className="os-visually-hidden">Sort results</span>
                <DynamicIcon name="filter" size={15} />
                <select value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <DynamicIcon name="chevronDown" size={14} />
              </label>
              <button
                type="button"
                className={`os-view-toggle ${selected.length > 0 ? 'is-active' : ''}`}
                onClick={() => setCompareOpen(true)}
                disabled={selected.length < 2}
              >
                <DynamicIcon name="layout" size={16} /> Compare{' '}
                {selected.length > 0 ? `(${selected.length})` : ''}
              </button>
            </div>
          </div>

          {activeFilterCount > 0 ? (
            <div className="os-active-filters">
              {query.length > 0 ? (
                <button type="button" onClick={() => updateParam('q', null)}>
                  “{query}” <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              {category !== 'all' ? (
                <button type="button" onClick={() => updateParam('category', 'all')}>
                  {category} <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              {platform !== 'all' ? (
                <button type="button" onClick={() => updateParam('platform', 'all')}>
                  {platform} <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              {source !== 'all' ? (
                <button type="button" onClick={() => updateParam('source', 'all')}>
                  {BRIDGES.find((bridge) => bridge.id === source)?.lineage[0]}{' '}
                  <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              {openSourceOnly ? (
                <button type="button" onClick={() => updateParam('open', null)}>
                  Open source <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              {verifiedOnly ? (
                <button type="button" onClick={() => updateParam('verified', null)}>
                  Verified <DynamicIcon name="x" size={13} />
                </button>
              ) : null}
              <button type="button" className="os-active-filters__clear" onClick={clearFilters}>
                Clear all
              </button>
            </div>
          ) : null}

          {apps.length === 0 ? (
            <EmptyState
              icon="search"
              title="No apps matched those filters"
              message="Try a broader source lens, another platform, or add a custom source that carries the app you need."
              action={
                <div className="os-empty__actions">
                  <button
                    type="button"
                    className="os-button os-button--primary"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                  <Link to="/sources" className="os-button os-button--outline">
                    Add a source
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="os-app-grid os-app-grid--results">
              {apps.map((app) => (
                <div className="os-result-item" key={app.id}>
                  <AppCard app={app} />
                  <button
                    type="button"
                    className={
                      selected.includes(app.id)
                        ? 'os-compare-toggle is-selected'
                        : 'os-compare-toggle'
                    }
                    onClick={() => toggleCompare(app.id)}
                    aria-label={`${selected.includes(app.id) ? 'Remove' : 'Add'} ${app.name} ${selected.includes(app.id) ? 'from' : 'to'} comparison`}
                  >
                    {selected.includes(app.id) ? (
                      <DynamicIcon name="check" size={14} />
                    ) : (
                      <DynamicIcon name="plus" size={14} />
                    )}
                    {selected.includes(app.id) ? 'Selected' : 'Compare'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="os-results__footer">
            <span>
              <DynamicIcon name="shield" size={15} /> No invented download counts or ratings
            </span>
            <span>
              <DynamicIcon name="git" size={15} /> Every listing has a visible source reference
            </span>
          </div>
        </section>
      </div>

      {selected.length > 0 ? (
        <div className="os-compare-tray">
          <div className="os-compare-tray__items">
            {selected.map((id) => {
              const app = getApp(id);
              return app === undefined ? null : (
                <button
                  type="button"
                  key={id}
                  onClick={() => toggleCompare(id)}
                  title={`Remove ${app.name}`}
                >
                  <AppIcon app={app} size={28} rounded={9} />
                  <span>{app.name}</span>
                  <DynamicIcon name="x" size={13} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="os-button os-button--primary"
            disabled={selected.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            Compare {selected.length} apps <DynamicIcon name="arrow" size={16} />
          </button>
        </div>
      ) : null}

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} ids={selected} />
    </div>
  );
}

function CompareModal({
  open,
  onClose,
  ids,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly ids: readonly string[];
}): ReactNode {
  const apps = ids.map((id) => getApp(id)).filter((app): app is StoreApp => app !== undefined);
  if (apps.length === 0) return null;
  const rows: readonly { label: string; render: (app: StoreApp) => ReactNode }[] = [
    { label: 'Source', render: (app) => <SourcePill id={app.sourceIds[0] ?? 'forge'} short /> },
    { label: 'Platforms', render: (app) => app.platforms.join(', ') },
    { label: 'Formats', render: (app) => app.formats.join(' · ') },
    { label: 'License', render: (app) => (app.openSource ? app.license : 'Proprietary') },
    { label: 'Verification', render: (app) => app.verification },
    { label: 'Update channel', render: () => 'Stable' },
    { label: 'Preview size', render: (app) => app.demoSize },
    { label: 'Source paths', render: (app) => `${app.sourceIds.length} bridges` },
  ];
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="os-compare-modal">
        <SectionHeading
          eyebrow="Side by side"
          title="Compare apps"
          description="Editorial preview metadata — verify each live source before installing."
        />
        <div
          className="os-compare-table"
          style={{ '--compare-columns': apps.length } as CSSProperties}
        >
          <div className="os-compare-table__head">
            <span />
            {apps.map((app) => (
              <div key={app.id}>
                <AppIcon app={app} size={46} rounded={14} />
                <strong>{app.name}</strong>
                <small>{app.developer}</small>
              </div>
            ))}
          </div>
          {rows.map((row) => (
            <div className="os-compare-table__row" key={row.label}>
              <span>{row.label}</span>
              {apps.map((app) => (
                <div key={app.id}>{row.render(app)}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
