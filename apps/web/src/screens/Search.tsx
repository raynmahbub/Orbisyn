import { useEffect, useState } from 'react';
import { AppCard } from '../components/AppCard.js';
import { SearchIcon } from '../components/icons.js';
import {
  CardSkeletons,
  Chip,
  EmptyState,
  ErrorState,
  SectionHeader,
} from '../components/primitives.js';
import { useSearchDebounced } from '../hooks/useSearchDebounced.js';
import { asPlatform, asSourceKind, describeError, useSearch } from '../lib/api.js';

const PLATFORMS = ['android', 'ios', 'macos', 'windows', 'linux'] as const;
const SOURCES = ['github', 'gitlab', 'codeberg', 'fdroid', 'direct-url'] as const;

/**
 * Search.
 *
 * Free text searches the records this instance has already resolved; a URL or an
 * `owner/repo` pair is resolved on the spot. Both paths report which sources were
 * queried, so an empty result is honest rather than ambiguous: "nothing matched
 * in the records we hold" is a different message from "that upstream has no such
 * project".
 */
export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const debounced = useSearchDebounced(query, 350);

  const platformFilter = asPlatform(platform);
  const sourceFilter = asSourceKind(source);
  const search = useSearch(
    debounced,
    {
      ...(platformFilter === undefined ? {} : { platform: platformFilter }),
      ...(sourceFilter === undefined ? {} : { source: sourceFilter }),
    },
    debounced.trim().length > 1,
  );

  useEffect(() => {
    // Keep the page title meaningful when a link is shared.
    document.title = query.trim().length > 0 ? `${query} — Orbisyn` : 'Search — Orbisyn';
  }, [query]);

  return (
    <div className="stack stack--loose">
      <section className="stack">
        <SectionHeader
          title="Search"
          description="Paste a source reference to resolve it live, or search the records this instance already holds."
        />
        <div className="search">
          <SearchIcon />
          <input
            className="search__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="florisboard · https://codeberg.org/forgejo/forgejo · org.fdroid.fdroid"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {query.length > 0 && (
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => setQuery('')}
            >
              Clear
            </button>
          )}
        </div>

        <div className="row row--tight">
          {PLATFORMS.map((entry) => (
            <Chip
              key={entry}
              active={platform === entry}
              onClick={() => setPlatform(platform === entry ? null : entry)}
            >
              {entry}
            </Chip>
          ))}
          <span className="text-subtle">·</span>
          {SOURCES.map((entry) => (
            <Chip
              key={entry}
              active={source === entry}
              onClick={() => setSource(source === entry ? null : entry)}
            >
              {entry}
            </Chip>
          ))}
        </div>
      </section>

      {search.isFetching && <CardSkeletons count={3} />}

      {search.isError && (
        <ErrorState {...describeError(search.error)} onRetry={() => void search.refetch()} />
      )}

      {search.data !== undefined && search.data.items.length === 0 && (
        <EmptyState
          title="No records matched"
          description={
            search.data.queriedSources.length === 0
              ? 'This instance has no record matching that text yet. Paste a repository URL to resolve it from upstream.'
              : `Queried ${search.data.queriedSources.join(', ')} and found nothing matching.`
          }
        />
      )}

      {search.data !== undefined && search.data.items.length > 0 && (
        <section className="stack">
          <div className="row row--between">
            <h2>{search.data.items.length} result(s)</h2>
            <span className="text-xs text-subtle">
              {search.data.tookMs} ms · {search.data.queriedSources.join(', ') || 'local records'}
            </span>
          </div>
          <div className="grid">
            {search.data.items.map((item) => (
              <AppCard key={item.id} summary={item} />
            ))}
          </div>
          {search.data.nextCursor !== null && (
            <button type="button" className="button" onClick={() => void search.refetch()}>
              Load more
            </button>
          )}
        </section>
      )}
    </div>
  );
}
