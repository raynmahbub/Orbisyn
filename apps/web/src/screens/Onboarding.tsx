import { useState } from 'react';
import { OrbitIcon } from '../components/icons.js';
import { ResolverForm } from '../components/ResolverForm.js';
import { localStore } from '../lib/local-store.js';

/**
 * First-run onboarding.
 *
 * Two steps, skippable, and it ends by *doing* the thing the app is for: it asks
 * for a source reference and resolves it. No account, no permission request, no
 * tour of features the user has not needed yet.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  const finish = async (): Promise<void> => {
    await localStore.markOnboardingSeen();
    onDone();
  };

  return (
    <div
      className="stack stack--loose"
      style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}
    >
      <div className="row row--tight">
        <OrbitIcon size={28} />
        <strong>Orbisyn</strong>
      </div>

      {step === 0 && (
        <section className="card card--padded stack">
          <h1 style={{ fontSize: 'var(--text-2xl)' }}>Every source. One orbit.</h1>
          <p className="text-muted">
            Orbisyn reads open-source projects straight from the place they are published — GitHub,
            GitLab, Codeberg, Forgejo, F-Droid and plain download links — and turns them into one
            record you can verify.
          </p>
          <ul className="list">
            {[
              'No account, no tracking, nothing stored on a server about you.',
              'Artifacts link straight to the upstream host; checksums are carried through when published.',
              'The library, the update queue and the cache live on this device.',
            ].map((line) => (
              <li key={line} className="list-item text-sm">
                {line}
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="button button--primary" onClick={() => setStep(1)}>
              Continue
            </button>
            <button type="button" className="button button--ghost" onClick={() => void finish()}>
              Skip
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card card--padded stack">
          <h2>Try it with something you already use</h2>
          <p className="text-sm text-muted">
            Paste a repository URL or a package name. Orbisyn resolves it from the upstream source
            and shows the full trace of how the record was produced.
          </p>
          <ResolverForm compact />
          <div className="row">
            <button type="button" className="button button--primary" onClick={() => void finish()}>
              Start using Orbisyn
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
