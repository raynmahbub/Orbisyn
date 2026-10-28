import { Link } from 'react-router-dom';
import { EmptyState } from '../components/primitives.js';

export function NotFoundScreen() {
  return (
    <EmptyState
      title="Nothing in this orbit"
      description="That route does not exist. Try resolving a source reference from the home screen instead."
      action={
        <Link className="button button--primary button--sm" to="/">
          Back home
        </Link>
      }
    />
  );
}
