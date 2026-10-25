import type { Place } from '../../../shared/types.ts';
import { FORECAST_DAYS } from '../../../shared/config.ts';

export const TEST_NOW = new Date('2026-10-23T20:30:00Z');

export const TEST_PLACE: Place = {
  id: '6621033',
  name: 'Grand Falls',
  admin1: 'New Brunswick',
  country: 'Canada',
  countryCode: 'CA',
  latitude: 47.0461,
  longitude: -67.7418,
  population: 5220,
  timezone: 'America/Moncton',
};

const CURRENT_EPOCH = Math.floor(
  Date.parse('2026-10-23T20:30:00Z') / 1000,
);
const FIRST_HOUR_EPOCH = Math.floor(
  Date.parse('2026-10-23T20:00:00Z') / 1000,
);
const DATES = Array.from({ length: FORECAST_DAYS }, (_, index) =>
  addDays('2026-10-23', index),
);

function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset))
    .toISOString()
    .slice(0, 10);
}

export function makeVisualCrossingPayload(): Record<string, unknown> {
  const hours = Array.from({ length: 24 }, (_, index) => {
    const epoch = FIRST_HOUR_EPOCH + index * 3600;

    return {
      datetime: new Date(epoch * 1000).toISOString().slice(11, 19),
      datetimeEpoch: epoch,
      temp: 8.4 + index * 0.1,
      feelslike: 6.1 + index * 0.1,
      conditions: index === 0 ? 'Light rain' : 'Partly cloudy',
      icon: index === 0 ? 'rain' : 'partly-cloudy-day',
      precip: index === 0 ? 0.4 : 0,
      precipprob: index === 0 ? 70 : 10,
      windspeed: 14.2,
      winddir: 220,
      humidity: 72,
    };
  });

  return {
    queryCost: 1,
    latitude: 47.0461,
    longitude: -67.7418,
    resolvedAddress: 'Grand Falls, NB, Canada',
    address: '47.0461,-67.7418',
    timezone: 'America/Moncton',
    tzoffset: -3,
    currentConditions: {
      datetime: '17:30:00',
      datetimeEpoch: CURRENT_EPOCH,
      temp: 8.4,
      feelslike: 6.1,
      conditions: 'Partly cloudy',
      icon: 'partly-cloudy-day',
      precip: 0,
      precipprob: 20,
      windspeed: 14.2,
      winddir: 220,
      humidity: 72,
    },
    days: DATES.map((date, index) => ({
      datetime: date,
      datetimeEpoch: Math.floor(Date.parse(`${date}T04:00:00Z`) / 1000),
      tempmax: 12.4 + index,
      tempmin: 3.2 + index,
      temp: 8.1,
      feelslike: 6.4,
      conditions: index === 0 ? 'Partly cloudy' : 'Rain',
      icon: index === 0 ? 'partly-cloudy-day' : 'rain',
      precip: index === 0 ? 0.4 : 2.1,
      precipprob: index === 0 ? 20 : 80,
      windspeed: 14.2,
      winddir: 220,
      humidity: 72,
      hours: index === 0 ? hours : [],
    })),
  };
}

export function makeGeonamesPayload(): Record<string, unknown> {
  return {
    totalResultsCount: 3,
    geonames: [
      {
        geonameId: 6621033,
        name: 'Grand Falls',
        toponymName: 'Grand Falls',
        adminName1: 'New Brunswick',
        countryName: 'Canada',
        countryCode: 'CA',
        lat: '47.04609',
        lng: '-67.74179',
        population: 5220,
        timezone: { timeZoneId: 'America/Moncton' },
      },
      {
        geonameId: 6621033,
        name: 'Grand Falls duplicate',
        toponymName: 'Grand Falls',
        adminName1: 'New Brunswick',
        countryName: 'Canada',
        countryCode: 'CA',
        lat: '47.04609',
        lng: '-67.74179',
        population: 5220,
        timezone: { timeZoneId: 'America/Moncton' },
      },
      {
        geonameId: 5028491,
        name: 'Grand Falls',
        toponymName: 'Grand Falls',
        adminName1: 'Minnesota',
        countryName: 'United States',
        countryCode: 'US',
        lat: '48.19856',
        lng: '-93.79268',
        population: 115,
        timezone: { timeZoneId: 'America/Chicago' },
      },
      {
        geonameId: 999,
        name: 'Invalid place',
        countryName: 'Nowhere',
        countryCode: 'XX',
        lat: 'not-a-number',
        lng: '0',
      },
    ],
  };
}

export function makeGeonamesPlacePayload(): Record<string, unknown> {
  return {
    geonameId: 6621033,
    name: 'Grand Falls',
    toponymName: 'Grand Falls',
    adminName1: 'New Brunswick',
    countryName: 'Canada',
    countryCode: 'CA',
    lat: 47.0461,
    lng: -67.7418,
    population: 5220,
    timezone: { timeZoneId: 'America/Moncton' },
  };
}

export function makeGeonamesNearbyPayload(): Record<string, unknown> {
  return {
    geonames: [makeGeonamesPlacePayload()],
  };
}
