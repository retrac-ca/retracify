import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatDayDate,
  formatDayLabel,
  formatHour,
  formatPercent,
  formatPlaceMeta,
  formatPopulation,
  formatPrecipitation,
  formatTemperature,
  formatTemperatureShort,
  formatTime,
  formatTimezone,
  formatWind,
  formatWindShort,
} from './format';

const EPOCH = Math.floor(Date.parse('2026-10-23T20:00:00Z') / 1000);

describe('temperature and measurement formatting', () => {
  it('rounds temperatures and labels the unit', () => {
    expect(formatTemperature(7.6)).toBe('8°C');
    expect(formatTemperature(null)).toBe('Unavailable');
    expect(formatTemperatureShort(7.6)).toBe('8°');
    expect(formatTemperatureShort(null)).toBe('—');
  });

  it('formats wind, probability, and precipitation', () => {
    expect(formatWind(12.6)).toBe('13 km/h');
    expect(formatWind(null)).toBe('Unavailable');
    expect(formatWindShort(12.6)).toBe('13 km/h');
    expect(formatWindShort(null)).toBe('—');
    expect(formatPercent(29.6)).toBe('30%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPrecipitation(0.24)).toBe('0.2 mm');
    expect(formatPrecipitation(null)).toBe('Unavailable');
  });

  it('formats compact populations when available', () => {
    expect(formatPopulation(5220)).toBe('5.2K');
    expect(formatPopulation(undefined)).toBeNull();
  });
});

describe('time and date formatting', () => {
  it('formats local hour and time in the selected timezone', () => {
    expect(formatHour(EPOCH, 'America/Moncton')).toBe('5 p.m.');
    expect(formatTime(EPOCH, 'America/Moncton')).toBe('5:00 p.m.');
    expect(formatDateTime(EPOCH, 'America/Moncton')).toBe(
      'Oct 23, 5:00 p.m.',
    );
    expect(formatHour(EPOCH, 'Not/AZone')).toBe('Unavailable');
  });

  it('formats daily labels and dates', () => {
    expect(formatDayLabel('2026-10-23', 0)).toBe('Today');
    expect(formatDayLabel('2026-10-24', 1)).toBe('Tomorrow');
    expect(formatDayLabel('2026-10-25', 2)).toBe('Sun');
    expect(formatDayDate('2026-10-23')).toBe('Oct 23');
    expect(formatDayDate('not-a-date')).toBe('not-a-date');
  });

  it('formats timezone and place metadata', () => {
    expect(formatTimezone('America/Moncton')).toBe('America/Moncton');
    expect(
      formatPlaceMeta({
        admin1: 'New Brunswick',
        country: 'Canada',
      }),
    ).toBe('New Brunswick, Canada');
    expect(formatPlaceMeta({ country: 'Canada' })).toBe('Canada');
  });
});
