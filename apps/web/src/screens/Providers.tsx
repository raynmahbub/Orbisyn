import { CheckIcon } from '../components/icons.js';
import { Badge, CardSkeletons, Chip, EmptyState, SectionHeader } from '../components/primitives.js';
import { useProviders } from '../lib/api.js';

/**
 * Providers.
 *
 * The capability matrix is data, not marketing copy: it is exactly what each
 * adapter reports, which is why the interface never has to special-case a
 * provider by name. A `false` here is a promise the UI keeps — for example no
 * artifact verification claim is made where the upstream publishes no hashes.
 */
const CAPABILITY_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['resolveApp', 'Resolve project'],
  ['listReleases', 'List releases'],
  ['listArtifacts', 'List artifacts'],
  ['verifyArtifacts', 'Verify checksums'],
  ['repositoryStats', 'Repository statistics'],
  ['projectGovernance', 'Governance signals'],
  ['authenticated', 'Supports authentication'],
];

export function ProvidersScreen() {
  const providers = useProviders();

  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Source providers"
        description="One engine, six ecosystems. Adding a provider is an adapter, not a rewrite — the interface above it does not change."
      />

      {providers.isPending && <CardSkeletons count={4} />}
      {providers.isError && (
        <EmptyState
          title="Provider list unavailable"
          description="Start the gateway to enumerate providers."
        />
      )}

      <div className="grid grid--wide">
        {(providers.data ?? []).map((provider) => (
          <article key={provider.kind} className="card stack">
            <div className="row row--between">
              <div className="stack stack--tight">
                <strong>{provider.label}</strong>
                <a
                  className="text-xs text-subtle"
                  href={provider.homepage}
                  target="_blank"
                  rel="noreferrer"
                >
                  {provider.homepage}
                </a>
              </div>
              <Badge tone={provider.status === 'stable' ? 'success' : 'warning'}>
                {provider.status}
              </Badge>
            </div>

            <div className="stack stack--tight">
              {CAPABILITY_LABELS.map(([key, label]) => {
                const enabled = provider.capabilities[key as keyof typeof provider.capabilities];
                return (
                  <span key={key} className="row row--tight text-sm">
                    <span
                      style={{
                        color: enabled ? 'var(--color-success)' : 'var(--color-text-subtle)',
                      }}
                    >
                      {enabled ? <CheckIcon size={14} /> : '—'}
                    </span>
                    <span className={enabled ? '' : 'text-subtle'}>{label}</span>
                  </span>
                );
              })}
            </div>

            {provider.examples.length > 0 && (
              <div className="stack stack--tight">
                <span className="text-xs text-subtle">Accepts</span>
                <div className="row row--tight">
                  {provider.examples.slice(0, 3).map((example) => (
                    <Chip key={example} title={example}>
                      <span className="mono">{shorten(example)}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function shorten(value: string): string {
  return value.replace(/^https?:\/\//, '').slice(0, 42);
}
