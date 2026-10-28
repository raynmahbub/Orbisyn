import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AppCard,
  AppIcon,
  BrandMark,
  DynamicIcon,
  InstallButton,
  SectionHeading,
  SourcePill,
  VerificationBadge,
  WishlistButton,
} from '../components/ui.js';
import {
  CATEGORIES,
  catalogStats,
  featuredApps,
  freshApps,
  trendingApps,
} from '../data/catalog.js';
import { BRIDGES, sourceModeLabel } from '../data/sources.js';
import { useGatewayStatus } from '../hooks.js';
import { useStore } from '../StoreProvider.jsx';

export function DiscoverScreen(): ReactNode {
  const stats = catalogStats();
  const featuredList = featuredApps();
  const trending = trendingApps();
  const fresh = freshApps();
  const status = useGatewayStatus();
  const { state } = useStore();
  const spotlight = featuredList[0] ?? trending[0];
  const editorPicks = [
    ...new Map(featuredList.concat(fresh).map((entry) => [entry.id, entry])).values(),
  ].slice(0, 8);

  return (
    <div className="os-page os-discover">
      <section className="os-hero">
        <div className="os-hero__copy">
          <span className="os-hero__eyebrow">
            <span className={`os-status-dot ${status.state === 'online' ? 'is-live' : ''}`} />
            Orbisyn 1.0 · Universal app layer
          </span>
          <h1>
            Every app. Every source.
            <span> One beautiful orbit.</span>
          </h1>
          <p>
            Stop juggling five store clients. Orbisyn brings developer releases, F-Droid
            repositories, Obtainium links, catalog bridges and community registries into one clear,
            verifiable, cross-platform home.
          </p>
          <div className="os-hero__actions">
            <Link to="/explore" className="os-button os-button--primary os-button--lg">
              Explore the catalog <DynamicIcon name="arrow" size={18} />
            </Link>
            <Link to="/sources" className="os-button os-button--outline os-button--lg">
              <DynamicIcon name="layers" size={18} /> How sources work
            </Link>
          </div>
          <div className="os-hero__trust">
            <span>
              <DynamicIcon name="shield" size={15} /> No account required
            </span>
            <span>
              <DynamicIcon name="fingerprint" size={15} /> Local-first library
            </span>
            <span>
              <DynamicIcon name="git" size={15} /> Source visible
            </span>
          </div>
        </div>
        <div className="os-hero__visual" aria-hidden="true">
          <div className="os-orbit os-orbit--outer" />
          <div className="os-orbit os-orbit--middle" />
          <div className="os-orbit os-orbit--inner" />
          <span className="os-orbit__core">
            <BrandMark size={94} />
          </span>
          {BRIDGES.slice(0, 7).map((bridge, index) => (
            <span
              key={bridge.id}
              className="os-orbit__node"
              style={
                {
                  '--node-index': index,
                  '--node-color': bridge.accent,
                } as CSSProperties
              }
              title={bridge.name}
            >
              <DynamicIcon name={bridge.icon} size={19} />
            </span>
          ))}
          {trending.slice(0, 3).map((app, index) => (
            <span key={app.id} className={`os-orbit__app os-orbit__app--${index + 1}`}>
              <AppIcon app={app} size={42} rounded={13} />
            </span>
          ))}
        </div>
        <div className="os-hero__stats">
          <div>
            <strong>{stats.apps}</strong>
            <span>curated apps</span>
          </div>
          <div>
            <strong>{stats.bridges}</strong>
            <span>store bridges</span>
          </div>
          <div>
            <strong>{stats.platforms}</strong>
            <span>platforms</span>
          </div>
          <div>
            <strong>{stats.liveSources}</strong>
            <span>live engines</span>
          </div>
        </div>
      </section>

      {spotlight !== undefined ? (
        <section
          className="os-spotlight"
          style={
            {
              '--spotlight-a': spotlight.color,
              '--spotlight-b': spotlight.colorAlt,
            } as CSSProperties
          }
        >
          <div className="os-spotlight__glow" />
          <div className="os-spotlight__copy">
            <span className="os-eyebrow">Featured this week</span>
            <h2>{spotlight.name}</h2>
            <p>{spotlight.description}</p>
            <div className="os-spotlight__badges">
              <VerificationBadge app={spotlight} />
              <span className="os-badge os-badge--muted">{spotlight.formats.join(' · ')}</span>
            </div>
            <div className="os-spotlight__sources">
              {spotlight.sourceIds.map((source) => (
                <SourcePill key={source} id={source} />
              ))}
            </div>
            <div className="os-spotlight__actions">
              <InstallButton app={spotlight} size="lg" />
              <WishlistButton app={spotlight} />
              <Link to={`/app/${spotlight.id}`} className="os-button os-button--ghost">
                View details <DynamicIcon name="chevronRight" size={16} />
              </Link>
            </div>
          </div>
          <div className="os-spotlight__art">
            <div className="os-spotlight__rings">
              <span />
              <span />
              <span />
            </div>
            <AppIcon app={spotlight} size={164} rounded={40} />
            <div className="os-spotlight__mini-card">
              <DynamicIcon name="shield" size={16} />
              <span>Source pinned</span>
              <strong>{spotlight.sourceIds[0]}</strong>
            </div>
            <div className="os-spotlight__mini-card os-spotlight__mini-card--lower">
              <DynamicIcon name="packageCheck" size={16} />
              <span>Latest channel</span>
              <strong>Stable</strong>
            </div>
          </div>
        </section>
      ) : null}

      <section className="os-section">
        <SectionHeading
          eyebrow="Moving fast"
          title="Trending across sources"
          description="Popular projects surfaced from multiple independent distribution paths."
          action={
            <Link to="/explore?sort=fresh" className="os-text-link">
              See fresh releases <DynamicIcon name="arrow" size={15} />
            </Link>
          }
        />
        <div className="os-card-rail">
          {trending.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Find your next favourite"
          title="Browse by what matters"
          description="A single catalog, organized around real needs rather than store boundaries."
        />
        <div className="os-category-grid">
          {CATEGORIES.map((category) => (
            <Link
              key={category.id}
              to={`/explore?category=${encodeURIComponent(category.id)}`}
              className="os-category-card"
              style={{ '--category-color': category.color } as CSSProperties}
            >
              <span className="os-category-card__icon">
                <DynamicIcon name={category.icon} size={22} />
              </span>
              <strong>{category.id}</strong>
              <p>{category.description}</p>
              <DynamicIcon name="arrow" size={17} className="os-category-card__arrow" />
            </Link>
          ))}
        </div>
      </section>

      <section className="os-section os-source-section">
        <SectionHeading
          eyebrow="The Orbisyn difference"
          title="One store. Every source. Honest about how."
          description="Live APIs, companion handoffs and custom registries are clearly separated — no fake “integrations.”"
          action={
            <Link to="/sources" className="os-text-link">
              Manage source mesh <DynamicIcon name="arrow" size={15} />
            </Link>
          }
        />
        <div className="os-source-grid">
          {BRIDGES.map((bridge) => (
            <article
              key={bridge.id}
              className="os-source-card"
              style={{ '--source-color': bridge.accent } as CSSProperties}
            >
              <div className="os-source-card__top">
                <span className="os-source-card__icon">
                  <DynamicIcon name={bridge.icon} size={21} />
                </span>
                <span className="os-source-card__mode">{sourceModeLabel(bridge.mode)}</span>
              </div>
              <h3>{bridge.name}</h3>
              <p>{bridge.description}</p>
              <div className="os-source-card__lineage">
                {bridge.lineage.slice(0, 3).map((name) => (
                  <span key={name}>{name}</span>
                ))}
                {bridge.lineage.length > 3 ? <span>+{bridge.lineage.length - 3}</span> : null}
              </div>
              <div className="os-source-card__footer">
                <span className={state.sourceEnabled[bridge.id] === true ? 'is-on' : ''}>
                  <i /> {state.sourceEnabled[bridge.id] === true ? 'Enabled' : 'Optional'}
                </span>
                <DynamicIcon name="arrow" size={16} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Hand-picked"
          title="Editors’ choices"
          description="Thoughtful tools with strong sources, sustainable licensing and real cross-platform value."
          action={
            <Link to="/explore" className="os-text-link">
              Browse all apps <DynamicIcon name="arrow" size={15} />
            </Link>
          }
        />
        <div className="os-app-grid">
          {editorPicks.map((app, index) => (
            <AppCard key={app.id} app={app} variant={index < 2 ? 'feature' : 'default'} />
          ))}
        </div>
      </section>

      <section className="os-section os-two-column">
        <div className="os-updates-panel">
          <SectionHeading eyebrow="Just landed" title="Fresh from the source" />
          <div className="os-update-list">
            {fresh.slice(0, 6).map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className="os-update-row">
                <AppIcon app={app} size={42} rounded={13} />
                <div>
                  <strong>{app.name}</strong>
                  <span>
                    {app.demoVersion} · {app.demoUpdated}
                  </span>
                </div>
                <SourcePill id={app.sourceIds[0] ?? 'forge'} short />
                <DynamicIcon name="chevronRight" size={17} />
              </Link>
            ))}
          </div>
        </div>
        <div className="os-security-panel">
          <span className="os-eyebrow">Trust is a feature</span>
          <h2>Know exactly what you are installing.</h2>
          <p>
            Orbisyn keeps upstream references, licenses, channels, hashes and signer evidence
            attached to every app. When a fact is missing, it says “missing” instead of inventing
            it.
          </p>
          <div className="os-security-panel__checks">
            <span>
              <DynamicIcon name="checkCircle" size={18} /> Source reference visible
            </span>
            <span>
              <DynamicIcon name="checkCircle" size={18} /> Channel and artifact separated
            </span>
            <span>
              <DynamicIcon name="checkCircle" size={18} /> Signature policy under your control
            </span>
            <span>
              <DynamicIcon name="checkCircle" size={18} /> No required account or telemetry
            </span>
          </div>
          <Link to="/about" className="os-button os-button--outline">
            Read the product principles <DynamicIcon name="arrow" size={16} />
          </Link>
        </div>
      </section>

      <section className="os-cta">
        <div>
          <span className="os-eyebrow">Ready when you are</span>
          <h2>Bring your stores into orbit.</h2>
          <p>
            Connect a source, import an Obtainium file, or simply start with the curated catalog.
          </p>
        </div>
        <div className="os-cta__actions">
          <Link to="/sources" className="os-button os-button--primary os-button--lg">
            <DynamicIcon name="plus" size={18} /> Connect a source
          </Link>
          <Link to="/library" className="os-button os-button--outline os-button--lg">
            Open my library
          </Link>
        </div>
      </section>
    </div>
  );
}
