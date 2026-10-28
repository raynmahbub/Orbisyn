import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreProvider, useStore } from './StoreProvider.jsx';
import { STORE_STORAGE_KEY } from './state.js';

function StoreControls() {
  const { state, exportState, importState, updateSettings, toggleWishlist } = useStore();
  const [backup, setBackup] = useState('');
  const [restoreResult, setRestoreResult] = useState<boolean | null>(null);

  return (
    <div>
      <output data-testid="theme">{state.settings.theme}</output>
      <output data-testid="wishlist">{state.wishlist.join(',')}</output>
      <output data-testid="restore-result">
        {restoreResult === null ? 'unset' : String(restoreResult)}
      </output>
      <output data-testid="backup">{backup}</output>
      <button type="button" onClick={() => updateSettings({ theme: 'light' })}>
        Use light theme
      </button>
      <button type="button" onClick={() => toggleWishlist('localsend')}>
        Save LocalSend
      </button>
      <button type="button" onClick={() => setBackup(exportState())}>
        Export backup
      </button>
      <button
        type="button"
        onClick={() => {
          updateSettings({ theme: 'dark' });
          toggleWishlist('localsend');
          setRestoreResult(importState(JSON.parse(backup) as unknown));
        }}
      >
        Restore backup
      </button>
      <button type="button" onClick={() => setRestoreResult(importState({ nope: true }))}>
        Reject invalid backup
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('StoreProvider', () => {
  it('exports a versioned backup and restores its own exported format', async () => {
    const user = userEvent.setup();
    render(
      <StoreProvider>
        <StoreControls />
      </StoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Use light theme' }));
    await user.click(screen.getByRole('button', { name: 'Save LocalSend' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('wishlist')).toHaveTextContent('localsend');
    expect(window.localStorage.getItem(STORE_STORAGE_KEY)).toContain('"theme":"light"');

    await user.click(screen.getByRole('button', { name: 'Export backup' }));
    const exported = JSON.parse(screen.getByTestId('backup').textContent ?? '{}') as {
      format: string;
      version: number;
      data: { settings: { theme: string }; wishlist: string[] };
    };
    expect(exported.format).toBe('orbisyn-store-backup');
    expect(exported.version).toBe(1);
    expect(exported.data.settings.theme).toBe('light');
    expect(exported.data.wishlist).toContain('localsend');

    await user.click(screen.getByRole('button', { name: 'Restore backup' }));
    expect(screen.getByTestId('restore-result')).toHaveTextContent('true');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('wishlist')).toHaveTextContent('localsend');
  });

  it('rejects an unknown backup format without changing state', async () => {
    const user = userEvent.setup();
    render(
      <StoreProvider>
        <StoreControls />
      </StoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Reject invalid backup' }));

    expect(screen.getByTestId('restore-result')).toHaveTextContent('false');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });
});
