import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, DynamicIcon, EmptyState } from '../components/ui.js';

export function StoreNotFoundScreen(): ReactNode {
  return (
    <div className="os-page os-not-found">
      <div className="os-not-found__mark">
        <BrandMark size={92} />
      </div>
      <span className="os-eyebrow">404 · Lost in orbit</span>
      <h1>That page drifted out of range.</h1>
      <p>The link may be old, or the app or collection may have moved to another source.</p>
      <div className="os-not-found__actions">
        <Link to="/" className="os-button os-button--primary os-button--lg">
          <DynamicIcon name="home" size={18} /> Back to Discover
        </Link>
        <Link to="/explore" className="os-button os-button--outline os-button--lg">
          Explore catalog
        </Link>
      </div>
      <EmptyState
        icon="help"
        title="Looking for a specific app?"
        message="Use the global search or command palette to find an app, source or action."
      />
    </div>
  );
}
