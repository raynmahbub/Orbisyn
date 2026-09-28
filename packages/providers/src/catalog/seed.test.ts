import { describe, expect, it } from 'vitest';
import {
  CATALOG_COLLECTIONS,
  type CatalogEntry,
  entriesForCollection,
  getCollection,
  SEED_CATALOG,
} from './seed.js';

/**
 * The seed catalogue is editorial data, so the tests police *shape* and
 * *honesty* rather than content: every entry must resolve, every entry must
 * explain itself, and every collection must actually contain something.
 */
describe('CATALOG_COLLECTIONS', () => {
  it('has a unique id and a human readable title for every collection', () => {
    const ids = CATALOG_COLLECTIONS.map((collection) => collection.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const collection of CATALOG_COLLECTIONS) {
      expect(collection.title.length).toBeGreaterThan(0);
      expect(collection.description.length).toBeGreaterThan(0);
    }
  });

  it('never ships an empty collection', () => {
    for (const collection of CATALOG_COLLECTIONS) {
      expect(entriesForCollection(collection.id).length).toBeGreaterThan(0);
    }
  });

  it('looks a collection up by id and refuses an unknown one', () => {
    expect(getCollection('featured').title).toBe('Featured');
    // The type system narrows the id, so this guards a value that arrived at
    // runtime — a query string, a stale client, a hand-edited JSON file.
    expect(() => getCollection('nope' as never)).toThrow(/unknown catalogue collection/);
  });
});

describe('SEED_CATALOG', () => {
  it('lists each reference once', () => {
    const references = SEED_CATALOG.map((entry) => entry.reference);
    expect(new Set(references).size).toBe(references.length);
  });

  it('states a source reference a user could paste into the resolver', () => {
    for (const entry of SEED_CATALOG) {
      // A URL, a `host/path` shorthand, or an F-Droid style package id.
      expect(entry.reference).toMatch(
        /^(https?:\/\/\S+|[a-z0-9.-]+\/[^/]+|[a-z0-9]+(?:\.[a-z0-9]+){2,})$/,
      );
      expect(entry.reference).not.toContain(' ');
    }
  });

  it('explains why each entry was curated, without inventing metrics', () => {
    for (const entry of SEED_CATALOG) {
      expect(entry.rationale.length).toBeGreaterThan(20);
      // Editorial copy, not statistics: no fabricated star counts or scores.
      expect(entry.rationale).not.toMatch(/\d+\s*(stars|forks|users|downloads)/i);
    }
  });

  it('files every entry under at least one known collection', () => {
    const known = new Set<string>(CATALOG_COLLECTIONS.map((collection) => collection.id));
    for (const entry of SEED_CATALOG) {
      expect(entry.collections.length).toBeGreaterThan(0);
      for (const collection of entry.collections) {
        expect(known.has(collection)).toBe(true);
      }
    }
  });

  it('filters by collection against a supplied catalogue', () => {
    const custom: CatalogEntry[] = [
      {
        reference: 'https://github.com/a/b',
        collections: ['featured'],
        rationale: 'kept for a test fixture',
      },
      {
        reference: 'https://gitlab.com/c/d',
        collections: ['media'],
        rationale: 'kept for a test fixture',
      },
    ];

    expect(entriesForCollection('featured', custom)).toHaveLength(1);
    expect(entriesForCollection('media', custom)[0]?.reference).toBe('https://gitlab.com/c/d');
    expect(entriesForCollection('hidden-gems', custom)).toEqual([]);
  });
});
