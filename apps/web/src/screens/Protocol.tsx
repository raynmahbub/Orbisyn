import { ShieldIcon } from '../components/icons.js';
import { SectionHeader } from '../components/primitives.js';

/**
 * The protocol page.
 *
 * Documentation *inside* the product: a user who wants to publish an
 * `orbisyn.json` should not have to leave the app to learn how. It is also the
 * page that explains the design constraints honestly — what OSP deliberately
 * does not do.
 */
export function ProtocolScreen() {
  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Open Source Presence"
        description="A small, portable way for a project to describe itself once and be discoverable everywhere."
      />

      <section className="card stack">
        <div className="row row--tight">
          <ShieldIcon />
          <h2>The idea</h2>
        </div>
        <p className="text-sm text-muted">
          A project publishes a single file, <span className="code">orbisyn.json</span>, in the root
          of its repository. Any client — Orbisyn, a package manager, a corporate inventory tool —
          can read it and know how to resolve, verify and display the project without crawling the
          forge first.
        </p>
        <p className="text-sm text-muted">
          OSP is deliberately not a registry. There is no central authority, no upload step and no
          lock-in: the document lives in the publisher's own repository, under their own release
          process.
        </p>
      </section>

      <section className="card stack">
        <h2>Identity</h2>
        <p className="text-sm text-muted">
          Every project gets a canonical identity that is stable across providers. Two spellings of
          the same project resolve to the same id — which is what makes favourites, update tracking
          and collections portable.
        </p>
        <table className="stack" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr className="text-xs text-subtle">
              <th align="left">Source</th>
              <th align="left">Canonical identity</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {[
              ['https://github.com/bitwarden/android', 'osp://bitwarden-android'],
              ['https://codeberg.org/forgejo/forgejo', 'osp://forgejo-forgejo'],
              ['org.fdroid.fdroid', 'osp://fdroid-org-fdroid-fdroid'],
              ['https://github.com/a/b/tree/main/app.apk', 'osp://b-app'],
            ].map(([source, identity]) => (
              <tr key={source}>
                <td>
                  <span className="code">{source}</span>
                </td>
                <td>
                  <span className="code">{identity}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h2>Minimal document</h2>
        <pre className="code" style={{ padding: 'var(--space-4)', overflowX: 'auto' }}>
          {`{
  "spec": "1.0",
  "id": "example-app",
  "name": "Example App",
  "summary": "One sentence a stranger can understand.",
  "license": "MIT",
  "platforms": ["android", "linux"],
  "categories": ["utilities"],
  "sources": [
    { "kind": "github", "url": "https://github.com/example/app" }
  ],
  "maintainers": [{ "name": "Example Team" }],
  "updatedAt": "2026-01-01T00:00:00Z"
}`}
        </pre>
        <p className="text-xs text-subtle">
          Discovery tries the documented raw-content paths of the provider, following the default
          branch. If the file is absent or invalid, resolution continues from the provider API — a
          stale document must never break a client.
        </p>
      </section>

      <section className="card stack">
        <h2>What the client does with it</h2>
        <ul className="list">
          {[
            'Cross-checks the published document against the provider-resolved record.',
            'Reports conflicts (identity, licence, platforms) instead of silently preferring one.',
            'Shows which claims were confirmed by the publisher.',
            'Carries checksums and signatures through to the download row when present.',
          ].map((item) => (
            <li key={item} className="list-item text-sm">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
