import type { Diagnostics } from '@orbisyn/core';
import { formatDuration } from '../lib/format.js';
import { CheckIcon } from './icons.js';

/**
 * Resolution diagnostics.
 *
 * A metadata tool that shows a wrong version is worse than one that shows
 * nothing, so Orbisyn always shows *how* a record was produced: which provider,
 * which stages, how long they took, whether the answer came from cache, and
 * every warning collected along the way.
 */
export function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostics }) {
  return (
    <details className="panel" open={diagnostics.warnings.length > 0}>
      <summary className="row row--tight" style={{ cursor: 'pointer' }}>
        <CheckIcon size={16} />
        <span style={{ fontWeight: 600 }}>Resolution trace</span>
        <span className="spacer" />
        <span className="text-xs text-subtle">
          {diagnostics.cache} · {formatDuration(diagnostics.durationMs)}
        </span>
      </summary>

      <div className="steps" style={{ marginTop: 'var(--space-3)' }}>
        {diagnostics.steps.map((step) => (
          <div key={step.id} className={`step step--${step.status}`}>
            <span className="step__dot">
              {step.status === 'ok' ? '●' : step.status === 'failed' ? '●' : '○'}
            </span>
            <span className="text-sm">
              <span className="mono">{step.id}</span>
              {step.detail !== undefined && <span className="text-subtle"> — {step.detail}</span>}
            </span>
            <span className="text-xs text-subtle">{formatDuration(step.durationMs)}</span>
          </div>
        ))}
      </div>

      {diagnostics.warnings.length > 0 && (
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
          {diagnostics.warnings.map((warning) => (
            <p key={warning} className="text-xs" style={{ color: 'var(--color-warning)' }}>
              ⚠ {warning}
            </p>
          ))}
        </div>
      )}

      {diagnostics.providerErrors.length > 0 && (
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
          {diagnostics.providerErrors.map((error) => (
            <p key={`${error.provider}-${error.code}`} className="text-xs text-subtle">
              {error.provider}: {error.code} — {error.message}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}
