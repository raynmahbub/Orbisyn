import type { AppSummary } from '@orbisyn/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppCard } from './AppCard.js';

/**
 * The card is the most reused component in the interface, so its contract is
 * pinned here: identity, version, licence, platforms and the link target.
 */
const summary: AppSummary = {
  id: 'florisboard',
  ospUri: 'osp://florisboard',
  name: 'FlorisBoard',
  summary: 'An open-source keyboard for Android with privacy as a default.',
  iconUrl: 'https://example.org/icon.png',
  license: 'Apache-2.0',
  platforms: ['android'],
  categories: ['keyboard'],
  archived: false,
  fetchedAt: '2024-06-01T00:00:00.000Z',
  latestVersion: '0.4.0',
  latestPublishedAt: '2024-05-20T00:00:00.000Z',
  healthGrade: 'B',
  sourceKind: 'github',
  stars: 3_400,
};

function renderCard(props: Parameters<typeof AppCard>[0]) {
  return render(
    <MemoryRouter>
      <AppCard {...props} />
    </MemoryRouter>,
  );
}

describe('AppCard', () => {
  it('renders identity, version, licence, platform and grade', () => {
    renderCard({ summary });

    expect(screen.getByText('FlorisBoard')).toBeInTheDocument();
    expect(screen.getByText('0.4.0')).toBeInTheDocument();
    expect(screen.getByText('Apache-2.0')).toBeInTheDocument();
    // The chip carries the platform label as a title; the summary text also
    // mentions Android, so the assertion targets the chip specifically.
    expect(screen.getByTitle('Android')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText(/github/)).toBeInTheDocument();
  });

  it('links to the detail route for the canonical id', () => {
    renderCard({ summary });
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/apps/florisboard');
  });

  it('shows an editor rationale when a curated entry provides one', () => {
    renderCard({ summary, rationale: 'No network permission by default.' });
    expect(screen.getByText('No network permission by default.')).toBeInTheDocument();
  });

  it('falls back to an initial when the upstream publishes no icon', () => {
    const { iconUrl: _icon, ...withoutIcon } = summary;
    renderCard({ summary: withoutIcon });
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('flags archived projects', () => {
    renderCard({ summary: { ...summary, archived: true } });
    expect(screen.getByText('archived')).toBeInTheDocument();
  });
});
