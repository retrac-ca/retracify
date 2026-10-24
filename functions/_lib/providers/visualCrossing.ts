import type {
  DailyForecast,
  Forecast,
  HourlyForecast,
  Place,
  WeatherCondition,
  WeatherIconKey,
} from '../../../shared/types.ts';
import { fetchJson } from '../http.ts';
import { ApiError } from '../errors.ts';
import { requireEnv, type Env } from '../env.ts';
import { getLocalDateRange } from '../dates.ts';
import { FORECAST_DAYS } from '../../../shared/config.ts';
import {
  isRecord,
  roundCoordinate,
  toEpochOrNull,
  toNonEmptyString,
  toNumberOrNull,
  toPercentageOrNull,
} from '../validate.ts';

const VISUAL_CROSSING_BASE =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const FORECAST_ELEMENTS = [
  'datetime',
  'datetimeEpoch',
  'tempmax',
  'tempmin',
  'temp',
  'feelslike',
  'conditions',
  'icon',
  'precip',
  'precipprob',
  'windspeed',
  'winddir',
  'humidity',
  'pressure',
].join(',');

const ICON_TO_KEY: Record<string, WeatherIconKey> = {
  'clear-day': 'clear',
  'clear-night': 'clear',
  'partly-cloudy-day': 'partly-cloudy',
  'partly-cloudy-night': 'partly-cloudy',
  cloudy: 'cloudy',
  fog: 'fog',
  wind: 'wind',
  rain: 'rain',
  'showers-day': 'rain',
  'showers-night': 'rain',
  drizzle: 'drizzle',
  snow: 'snow',
  sleet: 'sleet',
  hail: 'sleet',
  'thunder-rain': 'thunderstorm',
  'thunder-showers-day': 'thunderstorm',
  'thunder-showers-night': 'thunderstorm',
};

const DEFAULT_LABELS: Record<WeatherIconKey, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  'heavy-rain': 'Heavy rain',
  sleet: 'Sleet',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  wind: 'Windy',
  unknown: 'Conditions unavailable',
};

export function buildForecastUrl(
  place: Place,
  apiKey: string,
  now = new Date(),
): string {
  const latitude = roundCoordinate(place.latitude).toFixed(4);
  const longitude = roundCoordinate(place.longitude).toFixed(4);
  const range = getLocalDateRange(place.timezone, now, FORECAST_DAYS);
  const path = range
    ? `${VISUAL_CROSSING_BASE}/${latitude},${longitude}/${range.start}/${range.end}`
    : `${VISUAL_CROSSING_BASE}/${latitude},${longitude}`;

  const params = new URLSearchParams({
    unitGroup: 'metric',
    include: 'current,days,hours',
    elements: FORECAST_ELEMENTS,
    lang: 'en',
    contentType: 'json',
    key: apiKey,
  });

  return `${path}?${params.toString()}`;
}

function inferConditionFromLabel(label: string | null): WeatherIconKey | null {
  if (!label) {
    return null;
  }

  const value = label.toLowerCase();

  if (value.includes('thunder')) return 'thunderstorm';
  if (value.includes('freezing') || value.includes('sleet') || value.includes('hail')) {
    return 'sleet';
  }
  if (value.includes('snow')) return 'snow';
  if (value.includes('heavy rain') || value.includes('heavy shower')) {
    return 'heavy-rain';
  }
  if (value.includes('drizzle')) return 'drizzle';
  if (value.includes('rain') || value.includes('shower')) return 'rain';
  if (value.includes('fog')) return 'fog';
  if (value.includes('wind')) return 'wind';
  if (value.includes('partly')) return 'partly-cloudy';
  if (
    value.includes('cloud') ||
    value.includes('overcast') ||
    value.includes('mostly cloudy')
  ) {
    return 'cloudy';
  }
  if (
    value.includes('clear') ||
    value.includes('sunny') ||
    value.includes('fair')
  ) {
    return 'clear';
  }

  return null;
}

export function mapWeatherCondition(
  icon: unknown,
  label: unknown,
): WeatherCondition {
  const iconValue =
    typeof icon === 'string' ? icon.trim().toLowerCase() : '';
  const text = toNonEmptyString(label);
  const key =
    ICON_TO_KEY[iconValue] ?? inferConditionFromLabel(text) ?? 'unknown';

  return {
    key,
    label: text ?? DEFAULT_LABELS[key],
  };
}

interface RawHour {
  datetime?: unknown;
  datetimeEpoch?: unknown;
  temp?: unknown;
  feelslike?: unknown;
  conditions?: unknown;
  icon?: unknown;
  precip?: unknown;
  precipprob?: unknown;
  windspeed?: unknown;
  winddir?: unknown;
  humidity?: unknown;
}

interface RawDay extends RawHour {
  tempmax?: unknown;
  tempmin?: unknown;
  hours?: unknown;
}

interface RawResponse {
  timezone?: unknown;
  tzoffset?: unknown;
  currentConditions?: unknown;
  days?: unknown;
  queryCost?: unknown;
}

function normalizeHour(
  raw: RawHour,
  startEpoch: number | null,
  currentHourEpoch: number | null,
): HourlyForecast | null {
  const epoch = toEpochOrNull(raw.datetimeEpoch);

  if (epoch === null) {
    return null;
  }

  if (startEpoch !== null && epoch < startEpoch) {
    return null;
  }

  return {
    epoch,
    time: toNonEmptyString(raw.datetime),
    isNow: currentHourEpoch !== null && epoch === currentHourEpoch,
    temperatureC: toNumberOrNull(raw.temp),
    feelsLikeC: toNumberOrNull(raw.feelslike),
    condition: mapWeatherCondition(raw.icon, raw.conditions),
    precipitationProbability: toPercentageOrNull(raw.precipprob),
    precipitationMm: toNumberOrNull(raw.precip),
    windKph: toNumberOrNull(raw.windspeed),
  };
}

function normalizeDay(raw: RawDay): DailyForecast | null {
  const date = toNonEmptyString(raw.datetime);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const parsedEpoch = Math.floor(
    Date.parse(`${date}T00:00:00Z`) / 1000,
  );
  const epoch =
    toEpochOrNull(raw.datetimeEpoch) ??
    (Number.isFinite(parsedEpoch) ? parsedEpoch : null);

  if (epoch === null || epoch < 0 || epoch > 4_102_444_800) {
    return null;
  }

  return {
    date,
    epoch,
    condition: mapWeatherCondition(raw.icon, raw.conditions),
    highC: toNumberOrNull(raw.tempmax),
    lowC: toNumberOrNull(raw.tempmin),
    precipitationProbability: toPercentageOrNull(raw.precipprob),
    precipitationMm: toNumberOrNull(raw.precip),
  };
}

export interface NormalizeOptions {
  fetchedAt?: Date;
  now?: Date;
}

export function normalizeVisualCrossing(
  payload: unknown,
  place: Place,
  options: NormalizeOptions = {},
): Forecast {
  if (!isRecord(payload)) {
    throw invalidResponse();
  }

  const response = payload as RawResponse;
  const rawDays = Array.isArray(response.days)
    ? response.days.filter(isRecord).slice(0, FORECAST_DAYS)
    : [];

  if (rawDays.length === 0) {
    throw invalidResponse();
  }

  const days = rawDays
    .map((day) => normalizeDay(day as RawDay))
    .filter((day): day is DailyForecast => day !== null);

  if (days.length === 0) {
    throw invalidResponse();
  }

  const timezone = safeTimezone(
    toNonEmptyString(response.timezone),
    place.timezone,
  );
  const timezoneOffset = toNumberOrNull(response.tzoffset);
  const rawCurrent = isRecord(response.currentConditions)
    ? (response.currentConditions as RawHour)
    : null;
  const currentEpoch = rawCurrent
    ? toEpochOrNull(rawCurrent.datetimeEpoch)
    : null;
  const currentHourEpoch =
    currentEpoch === null ? null : Math.floor(currentEpoch / 3600) * 3600;
  const startEpoch =
    currentHourEpoch ??
    Math.floor((options.now ?? new Date()).getTime() / 1000 / 3600) * 3600;
  const today = days[0];

  const current = rawCurrent
    ? {
        epoch: currentEpoch,
        time: toNonEmptyString(rawCurrent.datetime),
        temperatureC: toNumberOrNull(rawCurrent.temp),
        feelsLikeC: toNumberOrNull(rawCurrent.feelslike),
        condition: mapWeatherCondition(
          rawCurrent.icon,
          rawCurrent.conditions,
        ),
        highC: today.highC,
        lowC: today.lowC,
        windKph: toNumberOrNull(rawCurrent.windspeed),
        windDirectionDeg: toNumberOrNull(rawCurrent.winddir),
        precipitationProbability: toPercentageOrNull(
          rawCurrent.precipprob,
        ),
        humidity: toNumberOrNull(rawCurrent.humidity),
      }
    : null;

  const hourly: HourlyForecast[] = [];

  for (const rawDay of rawDays) {
    const day = rawDay as RawDay;

    if (!Array.isArray(day.hours)) {
      continue;
    }

    for (const rawHour of day.hours) {
      if (!isRecord(rawHour)) {
        continue;
      }

      const hour = normalizeHour(
        rawHour as RawHour,
        startEpoch,
        currentHourEpoch,
      );

      if (hour) {
        hourly.push(hour);
      }

      if (hourly.length >= 24) {
        break;
      }
    }

    if (hourly.length >= 24) {
      break;
    }
  }

  return {
    place: { ...place, timezone },
    timezone,
    timezoneOffsetSeconds:
      timezoneOffset === null ? null : Math.round(timezoneOffset * 3600),
    fetchedAt: (options.fetchedAt ?? new Date()).toISOString(),
    current,
    hourly,
    daily: days,
    units: {
      temperature: '°C',
      windSpeed: 'km/h',
      precipitation: 'mm',
    },
    attribution: {
      name: 'Visual Crossing',
      url: 'https://www.visualcrossing.com/',
      licenseName: 'Visual Crossing Weather licence',
      licenseUrl:
        'https://www.visualcrossing.com/weather-service-terms/',
    },
  };
}

export async function fetchVisualCrossingForecast(
  place: Place,
  env: Env,
  now = new Date(),
): Promise<Forecast> {
  const apiKey = requireEnv(env, 'VISUAL_CROSSING_API_KEY');
  const url = buildForecastUrl(place, apiKey, now);
  const payload = await fetchJson<unknown>(url, {
    timeoutMs: 8_000,
    retries: 1,
    retryDelayMs: 400,
  });

  if (isRecord(payload) && toNumberOrNull(payload.queryCost) !== null) {
    const cost = toNumberOrNull(payload.queryCost);

    if (cost !== null && cost > 1) {
      // Forecast requests should cost one record. Keep a signal in logs without
      // exposing the request URL or credentials.
      console.warn(`Visual Crossing query cost was ${cost}, expected 1.`);
    }
  }

  return normalizeVisualCrossing(payload, place, { now });
}

function safeTimezone(
  candidate: string | null,
  fallback: string | undefined,
): string {
  for (const timezone of [candidate, fallback]) {
    if (!timezone) {
      continue;
    }

    try {
      new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
      return timezone;
    } catch {
      // Try the next candidate.
    }
  }

  return 'UTC';
}

function invalidResponse(): ApiError {
  return new ApiError(
    502,
    'INVALID_RESPONSE',
    'The weather service returned incomplete data. Please try again.',
    { retryable: false },
  );
}
