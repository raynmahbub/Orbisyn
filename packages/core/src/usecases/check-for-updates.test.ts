import { describe, expect, it } from 'vitest';
import { createFakeStore, createRelease, silentLogger, testClock } from '../testing/fakes.js';
import { CheckForUpdatesUseCase, isChannelEligible } from './check-for-updates.js';

function build() {
  const store = createFakeStore();
  const useCase = new CheckForUpdatesUseCase({
    store,
    clock: testClock('2024-06-01T00:00:00.000Z'),
    logger: silentLogger(),
    releaseWindow: 10,
  });
  return { store, useCase };
}

describe('CheckForUpdatesUseCase', () => {
  it('reports an update when a newer version exists', async () => {
    const { store, useCase } = build();
    await store.saveApp(
      {
        id: 'app',
        ospUri: 'osp://app',
        name: 'App',
        screenshots: [],
        license: 'MIT',
        categories: [],
        tags: [],
        platforms: ['android'],
        source: {
          kind: 'github',
          id: '1',
          host: 'github.com',
          path: 'a/b',
          webUrl: 'https://github.com/a/b',
        },
        alternateSources: [],
        archived: false,
        fetchedAt: '2024-01-01T00:00:00.000Z',
      },
      [createRelease({ version: '1.5.0' }), createRelease({ id: 'r2', version: '1.4.0' })],
    );

    const result = await useCase.execute([{ appId: 'app', version: '1.4.0' }]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]?.latestVersion).toBe('1.5.0');
    expect(result.checkedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('does not report a downgrade or the same version', async () => {
    const { store, useCase } = build();
    await store.saveApp(
      {
        id: 'app',
        ospUri: 'osp://app',
        name: 'App',
        screenshots: [],
        license: 'MIT',
        categories: [],
        tags: [],
        platforms: ['android'],
        source: {
          kind: 'github',
          id: '1',
          host: 'github.com',
          path: 'a/b',
          webUrl: 'https://github.com/a/b',
        },
        alternateSources: [],
        archived: false,
        fetchedAt: '2024-01-01T00:00:00.000Z',
      },
      [createRelease({ version: '1.5.0' })],
    );
    const result = await useCase.execute([{ appId: 'app', version: '1.5.0' }]);
    expect(result.updates).toHaveLength(0);
  });

  it('hides pre-releases from stable users and shows them to beta users', async () => {
    const { store, useCase } = build();
    await store.saveApp(
      {
        id: 'app',
        ospUri: 'osp://app',
        name: 'App',
        screenshots: [],
        license: 'MIT',
        categories: [],
        tags: [],
        platforms: ['android'],
        source: {
          kind: 'github',
          id: '1',
          host: 'github.com',
          path: 'a/b',
          webUrl: 'https://github.com/a/b',
        },
        alternateSources: [],
        archived: false,
        fetchedAt: '2024-01-01T00:00:00.000Z',
      },
      [
        createRelease({ id: 'r2', version: '2.0.0-beta.1', channel: 'beta', isPrerelease: true }),
        createRelease({ version: '1.9.0' }),
      ],
    );

    const stable = await useCase.execute([{ appId: 'app', version: '1.9.0', channel: 'stable' }]);
    const beta = await useCase.execute([{ appId: 'app', version: '1.9.0', channel: 'beta' }]);
    expect(stable.updates).toHaveLength(0);
    expect(beta.updates[0]?.latestVersion).toBe('2.0.0-beta.1');
  });

  it('reports what it could not check', async () => {
    const { useCase } = build();
    const result = await useCase.execute([{ appId: 'unknown', version: '1.0.0' }]);
    expect(result.unchecked[0]?.reason).toContain('no release history');
  });
});

describe('isChannelEligible', () => {
  it('follows the documented channel matrix', () => {
    expect(isChannelEligible('stable', 'stable')).toBe(true);
    expect(isChannelEligible('beta', 'stable')).toBe(false);
    expect(isChannelEligible('unknown', 'stable')).toBe(false);
    expect(isChannelEligible('beta', 'beta')).toBe(true);
    expect(isChannelEligible('rc', 'beta')).toBe(true);
    expect(isChannelEligible('unknown', 'nightly')).toBe(true);
  });
});
