import { describe, expect, it } from 'vitest';
import {
  buildRadarImageUrl,
  mercatorBounds,
} from './visualCrossingMap.ts';
import { TEST_PLACE } from '../__fixtures__/providers.ts';

describe('mercatorBounds', () => {
  it('covers the whole world at zoom zero', () => {
    expect(mercatorBounds(0, 0, 0, 256, 256)).toEqual({
      south: -85.051129,
      west: -180,
      north: 85.051129,
      east: 180,
    });
  });

  it('returns ordered bounds around the place', () => {
    const bounds = mercatorBounds(TEST_PLACE.latitude, TEST_PLACE.longitude);

    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
    expect(bounds.north).toBeLessThanOrEqual(90);
    expect(bounds.south).toBeGreaterThanOrEqual(-90);
  });
});

describe('buildRadarImageUrl', () => {
  it('targets the precipitation composite at the requested time', () => {
    const url = new URL(
      buildRadarImageUrl(
        TEST_PLACE,
        'test-key',
        new Date('2026-10-23T20:30:00Z'),
      ),
    );

    expect(url.pathname).toContain('/image/precipcomposite/8.png');
    expect(url.searchParams.get('time')).toBe('2026-10-23T20:30:00.000Z');
    expect(url.searchParams.get('centerLat')).toBe('47.0461');
    expect(url.searchParams.get('centerLon')).toBe('-67.7418');
    expect(url.searchParams.get('width')).toBe('1280');
    expect(url.searchParams.get('height')).toBe('720');
    expect(url.searchParams.get('unitGroup')).toBe('metric');
    expect(url.searchParams.get('apikey')).toBe('test-key');
  });
});
