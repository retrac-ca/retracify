import type { Place } from '../../shared/types.ts';
import { ApiError } from './errors.ts';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function parseSearchQuery(request: Request): string {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();

  if (query.length < 2) {
    throw new ApiError(
      400,
      'INVALID_QUERY',
      'Enter at least two characters to search for a place.',
      { retryable: false },
    );
  }

  if (query.length > 80) {
    throw new ApiError(
      400,
      'INVALID_QUERY',
      'That search is too long. Try a shorter place name.',
      { retryable: false },
    );
  }

  if (
    Array.from(query).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new ApiError(
      400,
      'INVALID_QUERY',
      'That search contains unsupported characters.',
      { retryable: false },
    );
  }

  return query;
}

export function parseCoordinates(request: Request): Coordinates {
  const url = new URL(request.url);
  const latParam = url.searchParams.get('lat');
  const lonParam = url.searchParams.get('lon');

  if (!latParam || !lonParam) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      'Latitude and longitude are required.',
      { retryable: false },
    );
  }

  const latitude = Number(latParam);
  const longitude = Number(lonParam);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      'The latitude is not valid.',
      { retryable: false },
    );
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      'The longitude is not valid.',
      { retryable: false },
    );
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

export function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function toEpochOrNull(value: unknown): number | null {
  const number = toNumberOrNull(value);

  if (number === null || number < 0 || number > 4_102_444_800) {
    return null;
  }

  return Math.floor(number);
}

export function toPercentageOrNull(value: unknown): number | null {
  const number = toNumberOrNull(value);

  if (number === null) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(number)));
}

export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedParam(
  url: URL,
  name: string,
  maxLength: number,
): string | undefined {
  const value = url.searchParams.get(name)?.trim();

  if (!value || value.length > maxLength) {
    return undefined;
  }

  return value;
}

export function parseForecastPlace(request: Request): Place {
  const coordinates = parseCoordinates(request);
  const url = new URL(request.url);
  const name = boundedParam(url, 'name', 120) ?? 'Selected location';
  const country = boundedParam(url, 'country', 80) ?? '';
  const countryCode = boundedParam(url, 'countryCode', 3) ?? '';
  const id =
    boundedParam(url, 'id', 80) ??
    `${coordinates.latitude},${coordinates.longitude}`;
  const admin1 = boundedParam(url, 'admin1', 120);
  const timezoneParam = boundedParam(url, 'timezone', 80);

  let timezone: string | undefined = timezoneParam;

  if (timezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    } catch {
      timezone = undefined;
    }
  }

  return {
    id,
    name,
    ...(admin1 ? { admin1 } : {}),
    country,
    countryCode,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ...(timezone ? { timezone } : {}),
  };
}
