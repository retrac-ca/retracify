import type { Place } from '../../../shared/types.ts';
import { fetchJson } from '../http.ts';
import { ApiError } from '../errors.ts';
import {
  isRecord,
  toNonEmptyString,
  toNumberOrNull,
} from '../validate.ts';

const GEONAMES_BASE = 'https://secure.geonames.org';
const GEONAMES_SEARCH_URL = `${GEONAMES_BASE}/searchJSON`;

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

export function buildPlaceUrl(placeId: string, username: string): string {
  const params = new URLSearchParams({
    geonameId: placeId,
    style: 'MEDIUM',
    lang: 'en',
    username,
  });

  return `${GEONAMES_BASE}/getJSON?${params.toString()}`;
}

export function buildNearbyUrl(
  latitude: number,
  longitude: number,
  username: string,
): string {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    style: 'MEDIUM',
    maxRows: '1',
    lang: 'en',
    username,
  });

  return `${GEONAMES_BASE}/findNearbyPlaceNameJSON?${params.toString()}`;
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

/**
 * Maps GeoNames status codes that indicate an account or quota problem.
 * Other status values are handled by each caller because their meaning is
 * endpoint-specific (for example, a missing place record).
 */
function throwGeonamesError(status: unknown): void {
  if (!isRecord(status)) {
    return;
  }

  const value = toNumberOrNull(status.value);

  if (value === 18 || value === 19 || value === 20) {
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Location search is temporarily busy. Please wait a moment and try again.',
      { retryable: true, retryAfterSeconds: 60 },
    );
  }

  if (value === 10) {
    throw new ApiError(
      502,
      'UPSTREAM_AUTH',
      'Location search is not configured correctly.',
      { retryable: false },
    );
  }
}

function unreadableResponse(): ApiError {
  return new ApiError(
    502,
    'INVALID_RESPONSE',
    'The location service returned an unreadable response.',
    { retryable: false },
  );
}

function placeNotFound(): ApiError {
  return new ApiError(
    404,
    'NOT_FOUND',
    'That location could not be found. Search for a city or town and try again.',
    { retryable: false },
  );
}

export function normalizeGeonamesResults(payload: unknown): Place[] {
  if (!isRecord(payload)) {
    throw unreadableResponse();
  }

  if (isRecord(payload.status)) {
    throwGeonamesError(payload.status);

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

export function normalizePlaceRecord(payload: unknown): Place {
  if (!isRecord(payload)) {
    throw unreadableResponse();
  }

  if (isRecord(payload.status)) {
    throwGeonamesError(payload.status);
    // A status without a quota/auth meaning is treated as a missing record.
    throw placeNotFound();
  }

  const place = normalizePlace(payload);

  if (!place) {
    throw placeNotFound();
  }

  return place;
}

export function normalizeNearbyPlace(payload: unknown): Place {
  if (!isRecord(payload)) {
    throw unreadableResponse();
  }

  if (isRecord(payload.status)) {
    throwGeonamesError(payload.status);

    throw new ApiError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'Location lookup is temporarily unavailable.',
      { retryable: true },
    );
  }

  if (Array.isArray(payload.geonames)) {
    for (const item of payload.geonames) {
      const place = normalizePlace(item);

      if (place) {
        return place;
      }
    }
  }

  throw new ApiError(
    404,
    'NOT_FOUND',
    "We couldn't find a nearby city or town. Try searching for your location instead.",
    { retryable: false },
  );
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

export async function fetchPlaceById(
  placeId: string,
  username: string,
): Promise<Place> {
  const payload = await fetchJson<unknown>(buildPlaceUrl(placeId, username), {
    timeoutMs: 8_000,
    retries: 0,
    notFoundMessage:
      'That location could not be found. Search for a city or town and try again.',
  });

  return normalizePlaceRecord(payload);
}

export async function fetchNearbyPlace(
  latitude: number,
  longitude: number,
  username: string,
): Promise<Place> {
  const payload = await fetchJson<unknown>(
    buildNearbyUrl(latitude, longitude, username),
    {
      timeoutMs: 8_000,
      retries: 0,
      notFoundMessage:
        "We couldn't find a nearby city or town. Try searching for your location instead.",
    },
  );

  return normalizeNearbyPlace(payload);
}
