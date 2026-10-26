import { describe, expect, it } from 'vitest';
import { radarBaseEpoch, radarOffsets } from './radar.ts';

describe('radarOffsets', () => {
  it('builds an evenly spaced six-hour timeline that includes now', () => {
    const offsets = radarOffsets('6h');

    expect(offsets[0]).toBe(-120);
    expect(offsets.at(-1)).toBe(360);
    expect(offsets).toContain(0);
    expect(offsets).toHaveLength(17);
  });

  it('builds an hourly twelve-hour timeline', () => {
    const offsets = radarOffsets('12h');

    expect(offsets[0]).toBe(-120);
    expect(offsets.at(-1)).toBe(720);
    expect(offsets).toContain(0);
    expect(offsets).toHaveLength(15);
  });
});

describe('radarBaseEpoch', () => {
  it('quantises now to the mode step', () => {
    const now = Date.parse('2026-10-23T20:47:31Z');

    expect(new Date(radarBaseEpoch(now, '6h')).toISOString()).toBe(
      '2026-10-23T20:30:00.000Z',
    );
    expect(new Date(radarBaseEpoch(now, '12h')).toISOString()).toBe(
      '2026-10-23T20:00:00.000Z',
    );
  });
});
