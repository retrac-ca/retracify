import { describe, expect, it } from 'vitest';
import {
  parseCoordinates,
  parsePlaceId,
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
      'https://example.com/api/reverse?lat=47.04609&lon=-67.74179',
    );
    expect(parseCoordinates(request)).toEqual({
      latitude: 47.0461,
      longitude: -67.7418,
    });
  });

  it('rejects missing and out-of-range coordinates', () => {
    expectApiError(
      () =>
        parseCoordinates(new Request('https://example.com/api/reverse')),
      'INVALID_COORDINATES',
    );
    expectApiError(
      () =>
        parseCoordinates(
          new Request('https://example.com/api/reverse?lat=91&lon=0'),
        ),
      'INVALID_COORDINATES',
    );
    expectApiError(
      () =>
        parseCoordinates(
          new Request('https://example.com/api/reverse?lat=0&lon=181'),
        ),
      'INVALID_COORDINATES',
    );
  });
});

describe('parsePlaceId', () => {
  it('returns a numeric place ID', () => {
    const request = new Request(
      'https://example.com/api/forecast?placeId=6621033',
    );

    expect(parsePlaceId(request)).toBe('6621033');
  });

  it('rejects missing, non-numeric, and overlong IDs', () => {
    expectApiError(
      () => parsePlaceId(new Request('https://example.com/api/forecast')),
      'INVALID_PLACE',
    );
    expectApiError(
      () =>
        parsePlaceId(
          new Request('https://example.com/api/forecast?placeId=Grand%20Falls'),
        ),
      'INVALID_PLACE',
    );
    expectApiError(
      () =>
        parsePlaceId(
          new Request('https://example.com/api/forecast?placeId=12.3'),
        ),
      'INVALID_PLACE',
    );
    expectApiError(
      () =>
        parsePlaceId(
          new Request(
            `https://example.com/api/forecast?placeId=${'1'.repeat(11)}`,
          ),
        ),
      'INVALID_PLACE',
    );
  });

  it('ignores legacy coordinate parameters', () => {
    expectApiError(
      () =>
        parsePlaceId(
          new Request(
            'https://example.com/api/forecast?lat=47.0461&lon=-67.7418',
          ),
        ),
      'INVALID_PLACE',
    );
  });
});
