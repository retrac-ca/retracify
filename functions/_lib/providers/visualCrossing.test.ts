import { describe, expect, it } from 'vitest';
import type { Place } from '../../../shared/types.ts';
import {
  buildForecastUrl,
  mapWeatherCondition,
  normalizeVisualCrossing,
} from './visualCrossing.ts';
import { getLocalDateRange } from '../dates.ts';
import { FORECAST_DAYS } from '../../../shared/config.ts';
import {
  makeVisualCrossingPayload,
  TEST_NOW,
  TEST_PLACE,
} from '../__fixtures__/providers.ts';
import { ApiError } from '../errors.ts';

describe('getLocalDateRange', () => {
  it('uses the selected location local date', () => {
    const range = getLocalDateRange(
      'America/Moncton',
      new Date('2026-10-23T02:00:00Z'),
      FORECAST_DAYS,
    );

    expect(range).toEqual({
      start: '2026-10-22',
      end: '2026-10-28',
    });
  });

  it('returns null for a missing or invalid timezone', () => {
    expect(getLocalDateRange(undefined, TEST_NOW)).toBeNull();
    expect(getLocalDateRange('Not/AZone', TEST_NOW)).toBeNull();
  });
});

describe('buildForecastUrl', () => {
  it('requests seven local days in metric units', () => {
    const url = new URL(
      buildForecastUrl(TEST_PLACE, 'test-key', TEST_NOW),
    );

    expect(url.pathname).toContain(
      '/47.0461,-67.7418/2026-10-23/2026-10-29',
    );
    expect(url.searchParams.get('unitGroup')).toBe('metric');
    expect(url.searchParams.get('include')).toBe('current,days,hours');
    expect(url.searchParams.get('contentType')).toBe('json');
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(url.searchParams.get('elements')).toContain('precipprob');
  });
});

describe('mapWeatherCondition', () => {
  it('maps known provider icons to neutral icons', () => {
    expect(mapWeatherCondition('partly-cloudy-day', 'Partly cloudy')).toEqual({
      key: 'partly-cloudy',
      label: 'Partly cloudy',
    });
    expect(mapWeatherCondition('thunder-rain', 'Thunderstorm')).toEqual({
      key: 'thunderstorm',
      label: 'Thunderstorm',
    });
  });

  it('falls back to the condition text and then a safe default', () => {
    expect(mapWeatherCondition('not-an-icon', 'Heavy rain')).toEqual({
      key: 'heavy-rain',
      label: 'Heavy rain',
    });
    expect(mapWeatherCondition(undefined, undefined)).toEqual({
      key: 'unknown',
      label: 'Conditions unavailable',
    });
  });
});

describe('normalizeVisualCrossing', () => {
  it('normalizes current, 24 hourly, and seven daily periods', () => {
    const forecast = normalizeVisualCrossing(
      makeVisualCrossingPayload(),
      TEST_PLACE,
      { now: TEST_NOW, fetchedAt: TEST_NOW },
    );

    expect(forecast.timezone).toBe('America/Moncton');
    expect(forecast.timezoneOffsetSeconds).toBe(-10800);
    expect(forecast.fetchedAt).toBe('2026-10-23T20:30:00.000Z');
    expect(forecast.daily).toHaveLength(FORECAST_DAYS);
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.units).toEqual({
      temperature: '°C',
      windSpeed: 'km/h',
      precipitation: 'mm',
    });

    const current = forecast.current;

    expect(current).not.toBeNull();

    if (!current) {
      return;
    }

    expect(current.temperatureC).toBe(8.4);
    expect(current.feelsLikeC).toBe(6.1);
    expect(current.highC).toBe(12.4);
    expect(current.lowC).toBe(3.2);
    expect(current.condition.key).toBe('partly-cloudy');
    expect(current.precipitationProbability).toBe(20);
    expect(current.humidity).toBe(72);

    const firstHour = forecast.hourly[0];
    expect(firstHour.isNow).toBe(true);
    expect(firstHour.epoch).toBe(
      Math.floor(Date.parse('2026-10-23T20:00:00Z') / 1000),
    );
    expect(firstHour.condition.key).toBe('rain');
    expect(firstHour.precipitationProbability).toBe(70);
    expect(firstHour.precipitationMm).toBe(0.4);
  });

  it('keeps missing optional fields as null', () => {
    const payload = makeVisualCrossingPayload();
    const current = payload.currentConditions as Record<string, unknown>;
    const days = payload.days as Array<Record<string, unknown>>;
    const firstDay = days[0];

    delete current.temp;
    delete current.feelslike;
    delete current.precipprob;
    delete firstDay.tempmax;
    delete firstDay.tempmin;

    const forecast = normalizeVisualCrossing(payload, TEST_PLACE, {
      now: TEST_NOW,
      fetchedAt: TEST_NOW,
    });

    expect(forecast.current?.temperatureC).toBeNull();
    expect(forecast.current?.feelsLikeC).toBeNull();
    expect(forecast.current?.precipitationProbability).toBeNull();
    expect(forecast.current?.highC).toBeNull();
    expect(forecast.current?.lowC).toBeNull();
    expect(forecast.daily[0].highC).toBeNull();
    expect(forecast.daily[0].lowC).toBeNull();
  });

  it('still produces hourly values when current conditions are absent', () => {
    const payload = makeVisualCrossingPayload();
    delete payload.currentConditions;

    const forecast = normalizeVisualCrossing(payload, TEST_PLACE, {
      now: TEST_NOW,
      fetchedAt: TEST_NOW,
    });

    expect(forecast.current).toBeNull();
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.hourly[0].isNow).toBe(false);
  });

  it('rejects a response without daily data', () => {
    expect(() =>
      normalizeVisualCrossing(
        { days: [], timezone: 'America/Moncton' },
        TEST_PLACE,
      ),
    ).toThrow(ApiError);
  });

  it('preserves the selected place but uses the provider timezone', () => {
    const place: Place = { ...TEST_PLACE, timezone: undefined };
    const forecast = normalizeVisualCrossing(
      makeVisualCrossingPayload(),
      place,
      { now: TEST_NOW },
    );

    expect(forecast.place.id).toBe(TEST_PLACE.id);
    expect(forecast.place.timezone).toBe('America/Moncton');
  });
});
