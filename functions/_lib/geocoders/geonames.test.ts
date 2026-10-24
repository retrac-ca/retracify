import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  normalizeGeonamesResults,
} from './geonames.ts';
import { makeGeonamesPayload } from '../__fixtures__/providers.ts';
import { ApiError } from '../errors.ts';

describe('buildSearchUrl', () => {
  it('includes the query, limit, population ordering, and username', () => {
    const url = new URL(buildSearchUrl('Grand Falls', 'tester'));

    expect(url.searchParams.get('q')).toBe('Grand Falls');
    expect(url.searchParams.get('maxRows')).toBe('8');
    expect(url.searchParams.get('featureClass')).toBe('P');
    expect(url.searchParams.get('orderby')).toBe('population');
    expect(url.searchParams.get('username')).toBe('tester');
  });
});

describe('normalizeGeonamesResults', () => {
  it('maps and deduplicates populated places', () => {
    const places = normalizeGeonamesResults(makeGeonamesPayload());

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({
      id: '6621033',
      name: 'Grand Falls',
      admin1: 'New Brunswick',
      country: 'Canada',
      countryCode: 'CA',
      latitude: 47.04609,
      longitude: -67.74179,
      timezone: 'America/Moncton',
      population: 5220,
    });
    expect(places[1].id).toBe('5028491');
  });

  it('returns an empty list when there are no matches', () => {
    expect(normalizeGeonamesResults({ geonames: [] })).toEqual([]);
    expect(normalizeGeonamesResults({ totalResultsCount: 0 })).toEqual([]);
  });

  it('maps daily and hourly limits to a retryable 429', () => {
    try {
      normalizeGeonamesResults({
        status: { message: 'daily limit exceeded', value: 18 },
      });
      throw new Error('Expected an ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(429);
      expect((error as ApiError).code).toBe('RATE_LIMITED');
      expect((error as ApiError).retryable).toBe(true);
    }
  });

  it('rejects an unreadable response', () => {
    expect(() => normalizeGeonamesResults(null)).toThrow(ApiError);
    expect(() => normalizeGeonamesResults('nope')).toThrow(ApiError);
  });
});
