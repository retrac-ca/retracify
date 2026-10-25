import { describe, expect, it } from 'vitest';
import { getLocalDateRange } from './dates.ts';

describe('getLocalDateRange', () => {
  it('returns the requested multi-day window in the location timezone', () => {
    expect(
      getLocalDateRange(
        'America/Moncton',
        new Date('2026-03-08T04:30:00Z'),
        7,
      ),
    ).toEqual({ start: '2026-03-08', end: '2026-03-14' });
  });

  it('handles the fall daylight-saving transition', () => {
    expect(
      getLocalDateRange(
        'America/Moncton',
        new Date('2026-11-01T03:30:00Z'),
        7,
      ),
    ).toEqual({ start: '2026-11-01', end: '2026-11-07' });
  });

  it('uses the location-local date near UTC midnight', () => {
    // 02:30 UTC is still the previous evening in Moncton (UTC-3 in October).
    expect(
      getLocalDateRange(
        'America/Moncton',
        new Date('2026-10-24T02:30:00Z'),
        7,
      ),
    ).toEqual({ start: '2026-10-23', end: '2026-10-29' });
  });

  it('rolls across a year boundary', () => {
    expect(
      getLocalDateRange(
        'America/Moncton',
        new Date('2026-12-30T16:00:00Z'),
        7,
      ),
    ).toEqual({ start: '2026-12-30', end: '2027-01-05' });
  });

  it('rolls across a leap day', () => {
    expect(
      getLocalDateRange('UTC', new Date('2028-02-28T12:00:00Z'), 3),
    ).toEqual({ start: '2028-02-28', end: '2028-03-01' });
  });

  it('returns null for a missing timezone or non-positive window', () => {
    expect(getLocalDateRange(undefined, new Date(), 7)).toBeNull();
    expect(getLocalDateRange('Not/AZone', new Date(), 7)).toBeNull();
    expect(getLocalDateRange('UTC', new Date(), 0)).toBeNull();
  });
});
