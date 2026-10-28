import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, DynamicIcon, SectionHeading } from '../components/ui.js';
import { BRIDGES } from '../data/sources.js';

const PILLARS = [
  {
    icon: 'orbit',
    title: 'One catalog, many paths',
    body: 'A canonical app record can carry several sources. The user sees one app, then chooses the release path that fits their device.',
  },
  {
    icon: 'shield',
    title: 'Evidence over decoration',
    body: 'No invented ratings, download counts or checksums. Sources, licenses, channels and gaps remain visible.',
  },
  {
    icon: 'users',
    title: 'Choice without punishment',
    body: 'Open-source repositories, developer binaries and proprietary companion handoffs can coexist without hiding their differences.',
  },
  {
    icon: 'sparkles',
    title: 'Consumer-grade by default',
    body: 'Power-user controls are available when wanted, but discovery, install and updates stay simple enough for anyone.',
  },
] as const;

const NAME_CANDIDATES = [
  {
    name: 'Orbisyn',
    verdict: 'Chosen',
    reason: 'Orbit + synthesis + sync: memorable, ownable and directly explains the product idea.',
  },
  {
    name: 'OmniStore',
    verdict: 'Too generic',
    reason: 'Describes the category but is hard to distinguish and likely crowded.',
  },
  {
    name: 'Nexus Apps',
    verdict: 'Conflicting',
    reason: 'Strong word, but heavily associated with existing products and brands.',
  },
  {
    name: 'PolyGet',
    verdict: 'Too technical',
    reason: 'Clear to package-manager users, cold for mainstream app-store users.',
  },
] as const;

export function AboutScreen(): ReactNode {
  return (
    <div className="os-page os-about">
      <section className="os-about-hero">
        <div className="os-about-hero__mark">
          <BrandMark size={116} />
        </div>
        <span className="os-eyebrow">The name and the idea</span>
        <h1>Orbisyn</h1>
        <p className="os-about-hero__tagline">Every app. Every source. One beautiful orbit.</p>
        <p className="os-about-hero__body">
          Orbisyn is the universal app-store layer for people who use more than one platform and
          more than one store. It does not ask you to abandon the sources you trust — it puts them
          into one clear, verifiable home.
        </p>
        <div className="os-about-hero__actions">
          <Link to="/explore" className="os-button os-button--primary os-button--lg">
            Explore Orbisyn <DynamicIcon name="arrow" size={18} />
          </Link>
          <Link to="/sources" className="os-button os-button--outline os-button--lg">
            See source compatibility
          </Link>
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Naming decision"
          title="Why this is the right name"
          description="A product name should be short, meaningful, easy to say and distinct from the stores it unites."
        />
        <div className="os-name-grid">
          {NAME_CANDIDATES.map((candidate) => (
            <article
              key={candidate.name}
              className={candidate.verdict === 'Chosen' ? 'is-chosen' : ''}
            >
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.verdict}</span>
              </div>
              <p>{candidate.reason}</p>
              {candidate.verdict === 'Chosen' ? <DynamicIcon name="checkCircle" size={20} /> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Product principles"
          title="Built to be chosen for its features"
          description="The differentiators are not just a longer source list — they are clear rules for trust and control."
        />
        <div className="os-pillar-grid">
          {PILLARS.map((pillar) => (
            <article key={pillar.title}>
              <span>
                <DynamicIcon name={pillar.icon} size={23} />
              </span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="os-section os-about-split">
        <div className="os-panel">
          <span className="os-eyebrow">Working today</span>
          <h2>Complete interactive product</h2>
          <ul className="os-feature-list">
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Responsive storefront across desktop,
              tablet and phone
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Curated catalog with {BRIDGES.length}{' '}
              source families
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Search, filters, comparison, detail pages
              and collections
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Local library, wishlist, tracking and
              install queue
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Obtainium / OSP JSON import and backup
              export
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Real gateway adapters for GitHub, GitLab,
              Codeberg, Forgejo, F-Droid and direct URLs
            </li>
            <li>
              <DynamicIcon name="checkCircle" size={17} /> Live “Verify source” against upstream
              release APIs
            </li>
          </ul>
        </div>
        <div className="os-panel os-panel--muted">
          <span className="os-eyebrow">Native shell roadmap</span>
          <h2>What production deployment adds</h2>
          <ul className="os-feature-list">
            <li>
              <DynamicIcon name="arrow" size={17} /> Android package-manager, session, Shizuku,
              Dhizuku and root installers
            </li>
            <li>
              <DynamicIcon name="arrow" size={17} /> Desktop package handlers for EXE, MSI, DMG,
              PKG, AppImage, DEB and RPM
            </li>
            <li>
              <DynamicIcon name="arrow" size={17} /> Encrypted credential storage and per-host API
              tokens
            </li>
            <li>
              <DynamicIcon name="arrow" size={17} /> Background update workers and OS notifications
            </li>
            <li>
              <DynamicIcon name="arrow" size={17} /> Signed community registry manifests and
              publisher verification
            </li>
            <li>
              <DynamicIcon name="arrow" size={17} /> End-to-end encrypted cross-device library sync
            </li>
          </ul>
          <div className="os-inline-warning">
            <DynamicIcon name="info" size={16} /> The web preview simulates installation and never
            downloads or executes an installer.
          </div>
        </div>
      </section>

      <section className="os-section">
        <SectionHeading
          eyebrow="Source lineage"
          title="How the stores fit together"
          description="Different distribution models remain distinct inside one user experience."
        />
        <div className="os-lineage-table">
          {BRIDGES.map((bridge) => (
            <article key={bridge.id}>
              <span>
                <DynamicIcon name={bridge.icon} size={19} />
              </span>
              <div>
                <strong>{bridge.name}</strong>
                <small>{bridge.lineage.join(' · ')}</small>
              </div>
              <p>{bridge.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="os-section">
        <SectionHeading eyebrow="Questions" title="Straight answers" />
        <div className="os-faq-grid">
          <details open>
            <summary>Is this just another F-Droid client?</summary>
            <p>
              No. F-Droid-compatible repositories are one source family. Orbisyn also reads forge
              releases, direct URLs, catalog exports and community registries, while clearly marking
              companion handoffs such as Aurora/Play.
            </p>
          </details>
          <details>
            <summary>Does it combine Komi Store and GitHub Store twice?</summary>
            <p>
              No. Komi Store is the successor to GitHub Store. Orbisyn treats them as one lineage
              and deduplicates references to the same upstream release.
            </p>
          </details>
          <details>
            <summary>Can a web app really install APKs?</summary>
            <p>
              Not directly. The web build is a complete interactive preview and PWA. Real
              installation requires the planned native Android and desktop shells, which will use
              platform package managers.
            </p>
          </details>
          <details>
            <summary>Does Orbisyn bypass Google Play?</summary>
            <p>
              No. The Aurora/Play bridge is a local companion handoff that respects each service’s
              terms. Orbisyn does not scrape Play, share accounts or bypass paid apps.
            </p>
          </details>
          <details>
            <summary>What happens to my data?</summary>
            <p>
              The preview stores your library and preferences in this browser. Export and import are
              plain JSON. There is no required account and no telemetry.
            </p>
          </details>
          <details>
            <summary>Why is some metadata labeled “preview”?</summary>
            <p>
              Curated presentation data is static so the app works without external APIs. Live
              verification calls the real upstream provider engine; unknown facts are never
              fabricated.
            </p>
          </details>
        </div>
      </section>

      <section className="os-cta os-cta--about">
        <div>
          <span className="os-eyebrow">The one-store idea</span>
          <h2>Choice should feel simple.</h2>
          <p>
            Orbisyn gives every source a place, every app a clear identity and every user the final
            decision.
          </p>
        </div>
        <div className="os-cta__actions">
          <Link to="/sources" className="os-button os-button--primary os-button--lg">
            <DynamicIcon name="layers" size={18} /> Explore sources
          </Link>
          <Link to="/console" className="os-button os-button--outline os-button--lg">
            Inspect the engine
          </Link>
        </div>
      </section>
    </div>
  );
}
