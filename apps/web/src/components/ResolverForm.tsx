import type { ResolveResponse } from '@orbisyn/core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeError, useResolve } from '../lib/api.js';
import { referenceLink } from '../lib/format.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';
import { SearchIcon } from './icons.js';
import { ErrorState } from './primitives.js';

/**
 * The resolver — Orbisyn's front door.
 *
 * Paste anything: a repository URL, an `owner/repo` pair, an F-Droid package id,
 * a release file URL or an `osp://` identity. The pipeline runs server-side and
 * the *diagnostics* come back with the record, so the user can see exactly which
 * provider handled it and how long each stage took.
 */
export function ResolverForm({
  initialReference = '',
  onResolved,
  navigateOnSuccess = false,
  compact = false,
}: {
  initialReference?: string;
  onResolved?: (result: ResolveResponse) => void;
  navigateOnSuccess?: boolean;
  compact?: boolean;
}) {
  const [reference, setReference] = useState(initialReference);
  const resolve = useResolve();
  const navigate = useNavigate();

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const value = reference.trim();
    if (value.length < 3) return;

    resolve.mutate(
      { reference: value, releases: 10, refresh: false },
      {
        onSuccess: (result) => {
          if (navigateOnSuccess) navigate(`/apps/${result.app.id}`);
          else onResolved?.(result);
        },
      },
    );
  };

  return (
    <div className="stack">
      <form
        className={`search${compact ? '' : ' search--hero'}`}
        onSubmit={submit}
        aria-label="Resolve a source reference"
      >
        <SearchIcon size={20} />
        <input
          className="search__input"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="github.com/bitwarden/android · codeberg.org/forgejo/forgejo · org.fdroid.fdroid"
          aria-label="Source reference"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="button button--primary button--sm"
          disabled={resolve.isPending}
        >
          {resolve.isPending ? 'Resolving…' : 'Resolve'}
        </button>
      </form>

      {!compact && (
        <p className="text-xs text-subtle">
          Works with GitHub, GitLab, Codeberg, self-hosted Forgejo, F-Droid packages, direct
          download URLs and <span className="code">osp://</span> identities.
        </p>
      )}

      {resolve.isError && <ErrorState {...describeError(resolve.error)} />}

      {resolve.data !== undefined && (
        <div className="stack">
          <div className="row row--between">
            <div className="stack stack--tight">
              <strong>{resolve.data.app.name}</strong>
              <span className="text-xs text-subtle">
                {resolve.data.app.id} · {resolve.data.releases.length} release(s) ·{' '}
                {resolve.data.diagnostics.cache} cache
              </span>
            </div>
            <a
              className="button button--sm"
              href={referenceLink(resolve.data.app.id ? `osp://${resolve.data.app.id}` : '')}
            >
              Permalink
            </a>
          </div>
          <DiagnosticsPanel diagnostics={resolve.data.diagnostics} />
        </div>
      )}
    </div>
  );
}
