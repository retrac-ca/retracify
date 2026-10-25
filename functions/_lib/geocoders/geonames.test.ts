import { describe, expect, it } from 'vitest';
import {
  buildNearbyUrl,
  buildPlaceUrl,
  buildSearchUrl,
  normalizeGeonamesResults,
  normalizeNearbyPlace,
  normalizePlaceRecord,
} from './geonames.ts';
import {
  makeGeonamesNearbyPayload,
  makeGeonamesPayload,
  makeGeonamesPlacePayload,
} from '../__fixtures__/providers.ts';
import { ApiError } from '../errors.ts';

function expectApiError(
  action: () => unknown,
  status: number,
  code: string,
): void {
  try {
    action();
    throw new Error('Expected an ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).code).toBe(code);
  }
}

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

describe('buildPlaceUrl', () => {
  it('requests one place by ID with medium detail', () => {
    const url = new URL(buildPlaceUrl('6621033', 'tester'));

    expect(url.pathname).toBe('/getJSON');
    expect(url.searchParams.get('geonameId')).toBe('6621033');
    expect(url.searchParams.get('style')).toBe('MEDIUM');
    expect(url.searchParams.get('username')).toBe('tester');
  });
});

describe('buildNearbyUrl', () => {
  it('requests the nearest populated place', () => {
    const url = new URL(buildNearbyUrl(47.0461, -67.7418, 'tester'));

    expect(url.pathname).toBe('/findNearbyPlaceNameJSON');
    expect(url.searchParams.get('lat')).toBe('47.0461');
    expect(url.searchParams.get('lng')).toBe('-67.7418');
    expect(url.searchParams.get('maxRows')).toBe('1');
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

describe('normalizePlaceRecord', () => {
  it('maps a single place record', () => {
    expect(normalizePlaceRecord(makeGeonamesPlacePayload())).toMatchObject({
      id: '6621033',
      name: 'Grand Falls',
      country: 'Canada',
      timezone: 'America/Moncton',
    });
  });

  it('returns 404 for a missing or incomplete record', () => {
    expectApiError(
      () =>
        normalizePlaceRecord({
          status: { message: 'not found', value: 12 },
        }),
      404,
      'NOT_FOUND',
    );
    expectApiError(
      () => normalizePlaceRecord({ geonameId: 1, name: 'Nowhere' }),
      404,
      'NOT_FOUND',
    );
  });

  it('still maps quota failures', () => {
    expectApiError(
      () =>
        normalizePlaceRecord({
          status: { message: 'hourly limit exceeded', value: 19 },
        }),
      429,
      'RATE_LIMITED',
    );
  });
});

describe('normalizeNearbyPlace', () => {
  it('returns the first populated place', () => {
    expect(normalizeNearbyPlace(makeGeonamesNearbyPayload())).toMatchObject({
      id: '6621033',
      name: 'Grand Falls',
    });
  });

  it('returns 404 when no nearby place is available', () => {
    expectApiError(
      () => normalizeNearbyPlace({ geonames: [] }),
      404,
      'NOT_FOUND',
    );
  });

  it('rejects an unreadable response', () => {
    expectApiError(() => normalizeNearbyPlace(null), 502, 'INVALID_RESPONSE');
  });
});
