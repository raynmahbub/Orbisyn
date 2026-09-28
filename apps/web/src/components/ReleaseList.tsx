import type { Release } from '@orbisyn/core';
import { channelTone, downloadName, fileSize, platformGlyph, relativeTime } from '../lib/format.js';
import { DownloadIcon, LinkIcon } from './icons.js';
import type { BadgeTone } from './primitives.js';
import { Badge, Chip } from './primitives.js';

/**
 * Release history.
 *
 * Artifacts are grouped by platform because that is the question a user actually
 * has ("which file do I install?"), and every download links straight to the
 * upstream URL — Orbisyn is a discovery and trust layer, not a file host.
 */
export function ReleaseList({
  releases,
  onInstall,
}: {
  releases: readonly Release[];
  onInstall?: (release: Release) => void;
}) {
  if (releases.length === 0) {
    return <p className="text-sm text-muted">No releases are published by this source.</p>;
  }

  return (
    <ul className="list">
      {releases.map((release) => (
        <li key={release.id} className="list-item list-item--stacked">
          <div className="row row--between" style={{ width: '100%' }}>
            <div className="stack stack--tight">
              <span className="row row--tight">
                <strong>{release.title ?? release.version}</strong>
                <Badge tone={channelTone(release.channel) as BadgeTone}>{release.channel}</Badge>
              </span>
              <span className="text-xs text-subtle">
                {release.version} · published {relativeTime(release.publishedAt)}
              </span>
            </div>
            <div className="row row--tight">
              {onInstall !== undefined && (
                <button
                  type="button"
                  className="button button--sm"
                  onClick={() => onInstall(release)}
                >
                  Track
                </button>
              )}
              <a
                className="button button--ghost button--sm"
                href={release.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <LinkIcon size={16} /> Source
              </a>
            </div>
          </div>

          {release.notes !== undefined && release.notes.length > 0 && (
            <details>
              <summary className="text-xs text-subtle" style={{ cursor: 'pointer' }}>
                Release notes
              </summary>
              <pre
                className="text-xs text-muted"
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                  margin: 'var(--space-2) 0 0',
                }}
              >
                {release.notes}
              </pre>
            </details>
          )}

          <div className="stack stack--tight" style={{ width: '100%' }}>
            {release.artifacts.map((artifact) => (
              <div key={`${release.id}-${artifact.url}`} className="row row--between panel">
                <span className="row row--tight" style={{ minWidth: 0 }}>
                  <Chip title={artifact.platform}>
                    {platformGlyph(artifact.platform)} {artifact.platform}
                  </Chip>
                  <span className="text-sm truncate" title={downloadName(artifact)}>
                    {downloadName(artifact)}
                  </span>
                  {artifact.listingOnly && (
                    <Chip title="Source archive, not an installer">source</Chip>
                  )}
                </span>
                <span className="row row--tight">
                  <span className="text-xs text-subtle">{fileSize(artifact.sizeBytes)}</span>
                  {artifact.checksum !== undefined && (
                    <Chip title={`${artifact.checksum.algorithm}: ${artifact.checksum.value}`}>
                      {artifact.checksum.algorithm}
                    </Chip>
                  )}
                  {artifact.signature !== undefined && (
                    <Chip title={artifact.signature.keyId ?? 'signed'}>signed</Chip>
                  )}
                  <a
                    className="button button--sm"
                    href={artifact.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Download ${downloadName(artifact)}`}
                  >
                    <DownloadIcon size={16} /> Download
                  </a>
                </span>
              </div>
            ))}
            {release.artifacts.length === 0 && (
              <p className="text-xs text-subtle">This release has no downloadable artifacts.</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
