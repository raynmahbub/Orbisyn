import type { ResolveResponse } from '@orbisyn/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppCardFromRecord } from '../components/AppCard.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.js';
import { SectionHeader } from '../components/primitives.js';
import { ResolverForm } from '../components/ResolverForm.js';
import { useApp, useReleases } from '../lib/api.js';

/**
 * Resolver screen.
 *
 * Linkable: `/resolve?ref=…` re-runs the pipeline for a shared reference, and
 * `/resolve?app=…` renders an already-stored record. The distinction matters —
 * one spends upstream quota, the other does not.
 */
export function ResolveScreen() {
  const [params] = useSearchParams();
  const reference = params.get('ref') ?? '';
  const appId = params.get('app') ?? undefined;
  const stored = useApp(appId);
  const releases = useReleases(appId);
  const [result, setResult] = useState<ResolveResponse | null>(null);

  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Resolver"
        description="Paste any source reference. The trace below shows which provider handled it and what each stage returned."
      />

      <ResolverForm
        initialReference={reference}
        compact
        onResolved={(response) => setResult(response)}
      />

      {result !== null && (
        <section className="stack">
          <AppCardFromRecord app={result.app} />
          <DiagnosticsPanel diagnostics={result.diagnostics} />
        </section>
      )}

      {appId !== undefined && result === null && (
        <section className="stack">
          {stored.data !== undefined && stored.data !== null && (
            <AppCardFromRecord app={stored.data} />
          )}
          {releases.data !== undefined && releases.data.length > 0 && (
            <p className="text-sm text-muted">
              {releases.data.length} release(s) stored for this identity.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
