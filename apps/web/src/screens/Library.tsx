import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppCard } from '../components/AppCard.js';
import { CardSkeletons, Chip, EmptyState, SectionHeader } from '../components/primitives.js';
import { useAsyncList } from '../hooks/useAsyncList.js';
import { useCollections } from '../lib/api.js';
import { localStore } from '../lib/local-store.js';

/**
 * Library.
 *
 * Everything here is device-local: favourites and collections work with the
 * network off and survive a gateway outage. Collections come from the gateway
 * when it is reachable and from IndexedDB when it is not.
 */
export function LibraryScreen() {
  const favourites = useAsyncList<string[]>(() => localStore.favourites(), []);
  const [tab, setTab] = useState<'favourites' | 'collections'>(`favourites`);
  const collections = useCollections();

  const [summaries, setSummaries] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  if (!loaded && favourites.isSuccess) {
    setLoaded(true);
    setSummaries(favourites.data ?? []);
  }

  return (
    <div className="stack stack--loose">
      <SectionHeader
        title="Library"
        description="Saved on this device. Favourites and collections are yours — they never leave the browser unless you sync them."
      />

      <div className="row row--tight">
        <Chip active={tab === 'favourites'} onClick={() => setTab('favourites')}>
          Favourites ({summaries.length})
        </Chip>
        <Chip active={tab === 'collections'} onClick={() => setTab('collections')}>
          Collections ({collections.data?.length ?? 0})
        </Chip>
      </div>

      {tab === 'favourites' && (
        <>
          {summaries.length === 0 && (
            <EmptyState
              title="No favourites yet"
              description="Open any app and press Favourite. Saved apps appear here instantly and work offline."
              action={
                <Link className="button button--primary button--sm" to="/search">
                  Browse sources
                </Link>
              }
            />
          )}
          {summaries.length > 0 && <FavouriteList appIds={summaries} />}
        </>
      )}

      {tab === 'collections' && (
        <>
          {collections.isPending && <CardSkeletons count={2} />}
          {(collections.data ?? []).length === 0 && (
            <EmptyState
              title="No collections"
              description="Collections group apps for a purpose — a phone setup, a self-hosted stack, a research list."
            />
          )}
          <div className="grid">
            {(collections.data ?? []).map((collection) => (
              <article key={collection.id} className="card stack">
                <strong>{collection.name}</strong>
                <span className="text-xs text-subtle">
                  {collection.appIds.length} app(s) · {collection.visibility}
                </span>
                <div className="row row--tight">
                  {collection.appIds.slice(0, 4).map((appId) => (
                    <Link key={appId} to={`/apps/${appId}`} className="chip chip--static">
                      {appId}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Favourites render through the same card component as search results, so a
 * favourite and a fresh result can never look different.
 */
function FavouriteList({ appIds }: { appIds: readonly string[] }) {
  const [items, setItems] = useState<Parameters<typeof AppCard>[0]['summary'][] | null>(null);

  if (items === null) {
    void Promise.all(
      appIds.map(async (appId) => {
        const cached = await localStore.readResolution(`resolve:${appId}`);
        return cached;
      }),
    ).then((entries) => {
      setItems(
        entries
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .map(({ app }) => ({
            id: app.id,
            ospUri: app.ospUri,
            name: app.name,
            ...(app.summary === undefined ? {} : { summary: app.summary }),
            ...(app.iconUrl === undefined ? {} : { iconUrl: app.iconUrl }),
            license: app.license,
            platforms: app.platforms,
            categories: app.categories,
            archived: app.archived,
            fetchedAt: app.fetchedAt,
            latestVersion: app.latestVersion ?? app.latestRelease?.version ?? null,
            latestPublishedAt: app.latestRelease?.publishedAt ?? null,
            healthGrade: app.health?.grade ?? null,
            sourceKind: app.source.kind,
            stars: app.health?.inputs.stars ?? null,
          })),
      );
    });
    return <CardSkeletons count={2} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Favourites are not cached on this device"
        description="Favourites store identities, and the app record is fetched on demand. Open one of them once to cache it for offline use."
        action={
          <Link className="button button--sm" to="/search">
            Open by reference
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid">
      {items.map((summary) => (
        <AppCard key={summary.id} summary={summary} />
      ))}
    </div>
  );
}
