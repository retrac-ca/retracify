import { describe, expect, it } from 'vitest';
import {
  parseCoordinates,
  parseForecastPlace,
  parseSearchQuery,
} from './validate.ts';
import { ApiError } from './errors.ts';

function expectApiError(
  action: () => unknown,
  code: string,
): void {
  try {
    action();
    throw new Error('Expected an ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}

describe('parseSearchQuery', () => {
  it('trims a valid query', () => {
    const request = new Request(
      'https://example.com/api/search?q=%20Grand%20Falls%20',
    );
    expect(parseSearchQuery(request)).toBe('Grand Falls');
  });

  it('rejects short, long, and control-character queries', () => {
    expectApiError(
      () => parseSearchQuery(new Request('https://example.com/api/search?q=a')),
      'INVALID_QUERY',
    );
    expectApiError(
      () =>
        parseSearchQuery(
          new Request(
            `https://example.com/api/search?q=${'a'.repeat(81)}`,
          ),
        ),
      'INVALID_QUERY',
    );
    expectApiError(
      () =>
        parseSearchQuery(
          new Request('https://example.com/api/search?q=Grand%00Falls'),
        ),
      'INVALID_QUERY',
    );
  });
});

describe('parseCoordinates', () => {
  it('rounds coordinates to four decimals', () => {
    const request = new Request(
      'https://example.com/api/forecast?lat=47.04609&lon=-67.74179',
    );
    expect(parseCoordinates(request)).toEqual({
      latitude: 47.0461,
      longitude: -67.7418,
    });
  });

  it('rejects missing and out-of-range coordinates', () => {
    expectApiError(
      () =>
        parseCoordinates(new Request('https://example.com/api/forecast')),
      'INVALID_COORDINATES',
    );
    expectApiError(
      () =>
        parseCoordinates(
          new Request('https://example.com/api/forecast?lat=91&lon=0'),
        ),
      'INVALID_COORDINATES',
    );
    expectApiError(
      () =>
        parseCoordinates(
          new Request('https://example.com/api/forecast?lat=0&lon=181'),
        ),
      'INVALID_COORDINATES',
    );
  });
});

describe('parseForecastPlace', () => {
  it('builds a place from validated request metadata', () => {
    const request = new Request(
      'https://example.com/api/forecast?lat=47.04609&lon=-67.74179&id=6621033&name=Grand%20Falls&admin1=New%20Brunswick&country=Canada&countryCode=CA&timezone=America%2FMoncton',
    );

    expect(parseForecastPlace(request)).toEqual({
      id: '6621033',
      name: 'Grand Falls',
      admin1: 'New Brunswick',
      country: 'Canada',
      countryCode: 'CA',
      latitude: 47.0461,
      longitude: -67.7418,
      timezone: 'America/Moncton',
    });
  });

  it('omits an invalid timezone rather than failing the forecast', () => {
    const request = new Request(
      'https://example.com/api/forecast?lat=47.0461&lon=-67.7418&timezone=Not%2FAZone',
    );
    const place = parseForecastPlace(request);

    expect(place.timezone).toBeUndefined();
    expect(place.name).toBe('Selected location');
  });
});
