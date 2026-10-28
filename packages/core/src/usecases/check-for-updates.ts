import type { UpdateCandidate } from '../model.js';
import type { AppStorePort, ClockPort, LoggerPort } from '../ports.js';
import { isNewer, sortByVersionDesc } from '../version.js';

/**
 * CheckForUpdates.
 *
 * The client owns the truth about what is installed (it is the only party that
 * can read the device), the store owns the truth about what exists upstream.
 * This use case joins the two and returns only genuine advances — version
 * comparison is tolerant of CalVer and pre-release suffixes.
 */

export interface InstalledApp {
  readonly appId: string;
  readonly version: string | null;
  /** Release channel the user opted into; nightly users see nightly updates. */
  readonly channel?: 'stable' | 'beta' | 'rc' | 'nightly';
}

export interface CheckForUpdatesDeps {
  readonly store: AppStorePort;
  readonly clock: ClockPort;
  readonly logger: LoggerPort;
  /** Releases fetched per app when the store holds nothing usable. */
  readonly releaseWindow: number;
}

export class CheckForUpdatesUseCase {
  constructor(private readonly deps: CheckForUpdatesDeps) {}

  async execute(installed: readonly InstalledApp[]): Promise<{
    checkedAt: string;
    updates: readonly UpdateCandidate[];
    unchecked: readonly { appId: string; reason: string }[];
  }> {
    const updates: UpdateCandidate[] = [];
    const unchecked: { appId: string; reason: string }[] = [];

    for (const entry of installed) {
      const releases = await this.deps.store.listReleases(entry.appId, this.deps.releaseWindow);
      if (releases.length === 0) {
        unchecked.push({ appId: entry.appId, reason: 'no release history stored yet' });
        continue;
      }

      const eligible = releases.filter((release) =>
        isChannelEligible(release.channel, entry.channel ?? 'stable'),
      );
      const ordered = sortByVersionDesc(eligible, (release) => release.version);
      const candidate = ordered[0];
      if (candidate === undefined) {
        unchecked.push({ appId: entry.appId, reason: 'no release matches the selected channel' });
        continue;
      }

      if (isNewer(candidate.version, entry.version)) {
        updates.push({
          appId: entry.appId,
          installedVersion: entry.version,
          latestVersion: candidate.version,
          release: candidate,
        });
      }
    }

    this.deps.logger.debug('update check completed', {
      installed: installed.length,
      updates: updates.length,
      unchecked: unchecked.length,
    });

    return { checkedAt: this.deps.clock.isoNow(), updates, unchecked };
  }
}

/**
 * Nightly users accept everything; beta users accept beta, rc and stable;
 * everyone else only sees stable releases.
 */
export function isChannelEligible(
  releaseChannel: 'stable' | 'beta' | 'rc' | 'nightly' | 'unknown',
  requested: 'stable' | 'beta' | 'rc' | 'nightly',
): boolean {
  if (requested === 'nightly') return true;
  if (requested === 'beta')
    return releaseChannel === 'stable' || releaseChannel === 'beta' || releaseChannel === 'rc';
  if (requested === 'rc') return releaseChannel === 'stable' || releaseChannel === 'rc';
  return releaseChannel === 'stable';
}
