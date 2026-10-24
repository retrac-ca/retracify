import type { Place } from '../../../shared/types.ts';
import { fetchJson } from '../http.ts';
import { ApiError } from '../errors.ts';
import {
  isRecord,
  toNonEmptyString,
  toNumberOrNull,
} from '../validate.ts';

const GEONAMES_SEARCH_URL = 'https://secure.geonames.org/searchJSON';

export function buildSearchUrl(query: string, username: string): string {
  const params = new URLSearchParams({
    q: query,
    maxRows: '8',
    featureClass: 'P',
    orderby: 'population',
    style: 'MEDIUM',
    lang: 'en',
    username,
  });

  return `${GEONAMES_SEARCH_URL}?${params.toString()}`;
}

function getId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return toNonEmptyString(value);
}

function normalizePlace(value: unknown): Place | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getId(value.geonameId);
  const name = toNonEmptyString(value.name) ?? toNonEmptyString(value.toponymName);
  const country = toNonEmptyString(value.countryName);
  const countryCode = toNonEmptyString(value.countryCode);
  const latitude = toNumberOrNull(
    typeof value.lat === 'string' || typeof value.lat === 'number'
      ? Number(value.lat)
      : null,
  );
  const longitude = toNumberOrNull(
    typeof value.lng === 'string' || typeof value.lng === 'number'
      ? Number(value.lng)
      : null,
  );

  if (
    !id ||
    !name ||
    !country ||
    !countryCode ||
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const timezoneRecord = isRecord(value.timezone) ? value.timezone : null;
  const timezone = timezoneRecord
    ? toNonEmptyString(timezoneRecord.timeZoneId)
    : null;
  const population = toNumberOrNull(value.population);

  return {
    id,
    name,
    ...(toNonEmptyString(value.adminName1)
      ? { admin1: toNonEmptyString(value.adminName1) as string }
      : {}),
    country,
    countryCode,
    latitude,
    longitude,
    ...(population !== null ? { population } : {}),
    ...(timezone ? { timezone } : {}),
  };
}

export function normalizeGeonamesResults(payload: unknown): Place[] {
  if (!isRecord(payload)) {
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'The location service returned an unreadable response.',
      { retryable: false },
    );
  }

  if (isRecord(payload.status)) {
    const value = toNumberOrNull(payload.status.value);

    if (value === 18 || value === 19 || value === 20) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Location search is temporarily busy. Please wait a moment and try again.',
        { retryable: true, retryAfterSeconds: 60 },
      );
    }

    if (value === 10 || value === 11) {
      throw new ApiError(
        502,
        'UPSTREAM_AUTH',
        'Location search is not configured correctly.',
        { retryable: false },
      );
    }

    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'Location search is temporarily unavailable.',
      { retryable: true },
    );
  }

  if (!Array.isArray(payload.geonames)) {
    return [];
  }

  const seen = new Set<string>();
  const places: Place[] = [];

  for (const item of payload.geonames) {
    const place = normalizePlace(item);

    if (!place || seen.has(place.id)) {
      continue;
    }

    seen.add(place.id);
    places.push(place);

    if (places.length >= 8) {
      break;
    }
  }

  return places;
}

export async function fetchGeonamesSearch(
  query: string,
  username: string,
): Promise<Place[]> {
  const payload = await fetchJson<unknown>(
    buildSearchUrl(query, username),
    {
      timeoutMs: 8_000,
      retries: 0,
    },
  );

  return normalizeGeonamesResults(payload);
}
