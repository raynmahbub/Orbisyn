import type { ResolveResponse } from '@orbisyn/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppCardFromRecord } from '../components/AppCard.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { ShieldIcon } from '../components/icons.js';
import { CardSkeletons, Chip, EmptyState, SectionHeader } from '../components/primitives.js';
import { ResolverForm } from '../components/ResolverForm.js';
import { useCatalog, useResolve } from '../lib/api.js';

/**
 * Home.
 *
 * Two jobs: let someone paste a source reference and see it resolved, and show
 * the curated catalogue. The catalogue resolves *on demand* — clicking a
 * collection resolves the visible entries through the real provider engine, so
 * what is displayed is always live upstream data rather than stale seed text.
 */
export function HomeScreen() {
  const catalog = useCatalog();
  const [collection, setCollection] = useState<string>('featured');
  const [resolved, setResolved] = useState<ResolveResponse[]>([]);

  const entries = useMemo(
    () => (catalog.data?.entries ?? []).filter((entry) => entry.collections.includes(collection)),
    [catalog.data, collection],
  );

  return (
    <div className="stack stack--loose">
      <section className="stack">
        <div className="stack stack--tight">
          <h1>Every source. One orbit.</h1>
          <p className="text-muted" style={{ maxWidth: '62ch' }}>
            Paste a repository, a package or a download link. Orbisyn reads the upstream source
            itself — releases, artifacts, licences, maintenance signals — and gives you one record
            you can verify.
          </p>
        </div>
        <ResolverForm
          onResolved={(result) => setResolved((current) => [result, ...current].slice(0, 5))}
        />
      </section>

      {resolved.length > 0 && (
        <section className="stack">
          <SectionHeader
            title="Just resolved"
            description="Fetched from the upstream source moments ago."
          />
          <div className="grid">
            {resolved.map((result) => (
              <AppCardFromRecord key={result.app.id} app={result.app} />
            ))}
          </div>
          {resolved[0] !== undefined && <DiagnosticsPanel diagnostics={resolved[0].diagnostics} />}
        </section>
      )}

      <section className="stack">
        <SectionHeader
          title="Explore"
          description="Curated references that resolve against the real upstream sources."
        />
        <div className="row row--tight">
          {(catalog.data?.collections ?? []).map((entry) => (
            <Chip
              key={entry.id}
              active={entry.id === collection}
              onClick={() => setCollection(entry.id)}
              title={entry.description}
            >
              {entry.title}
            </Chip>
          ))}
        </div>

        {catalog.isPending && <CardSkeletons count={3} />}

        {catalog.isError && (
          <EmptyState
            title="Catalogue unavailable"
            description="The gateway could not be reached. The resolver above still works when you are offline with a warm cache."
          />
        )}

        {entries.length > 0 && (
          <div className="grid">
            {entries.map((entry) => (
              <CatalogEntryCard
                key={entry.reference}
                reference={entry.reference}
                rationale={entry.rationale}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row row--tight">
          <ShieldIcon />
          <h2>Why this is different</h2>
        </div>
        <div className="grid">
          <div className="stack stack--tight">
            <strong>Source of truth is upstream</strong>
            <p className="text-sm text-muted">
              Records are resolved live from GitHub, GitLab, Codeberg, Forgejo and F-Droid indexes.
              Nothing is scraped into a private database and served back as fact.
            </p>
          </div>
          <div className="stack stack--tight">
            <strong>Verifiable artifacts</strong>
            <p className="text-sm text-muted">
              Where the upstream publishes a hash or a signature, Orbisyn carries it through to the
              download row.
            </p>
          </div>
          <div className="stack stack--tight">
            <strong>Explainable assessments</strong>
            <p className="text-sm text-muted">
              Health grades are computed from stated inputs with published weights, and the
              diagnostics of every resolution are visible.
            </p>
          </div>
        </div>
        <Link to="/protocol" className="button button--sm" style={{ justifySelf: 'start' }}>
          Read the OSP protocol
        </Link>
      </section>
    </div>
  );
}

/**
 * A catalogue entry resolves lazily: the button turns a reference into a record
 * only when asked, so opening the app never spends the operator's API quota on
 * a wall of cards nobody looked at.
 */
function CatalogEntryCard({ reference, rationale }: { reference: string; rationale: string }) {
  const resolve = useResolve();

  if (resolve.data !== undefined) {
    return <AppCardFromRecord app={resolve.data.app} rationale={rationale} />;
  }

  return (
    <article className="card app-card">
      <div className="stack stack--tight">
        <span className="mono truncate">{reference}</span>
        <span className="text-xs text-subtle">{rationale}</span>
      </div>
      <button
        type="button"
        className="button button--sm"
        onClick={() => resolve.mutate({ reference, releases: 3, refresh: false })}
        disabled={resolve.isPending}
      >
        {resolve.isPending ? 'Resolving…' : 'Resolve live'}
      </button>
      {resolve.isError && (
        <span className="text-xs" style={{ color: 'var(--color-error)' }}>
          Could not resolve this reference.
        </span>
      )}
    </article>
  );
}
