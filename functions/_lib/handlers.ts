import type { ForecastResponse, Place, SearchResponse } from '../../shared/types.ts';
import { FORECAST_DAYS } from '../../shared/config.ts';
import { cachedJson, type CacheLike } from './cache.ts';
import { asApiError, errorResponse, jsonResponse, methodNotAllowed } from './errors.ts';
import { requireEnv, type Env } from './env.ts';
import { fetchVisualCrossingForecast } from './providers/visualCrossing.ts';
import { getLocalDateRange } from './dates.ts';
import { fetchGeonamesSearch } from './geocoders/geonames.ts';
import {
  parseForecastPlace,
  parseSearchQuery,
  roundCoordinate,
} from './validate.ts';

const FORECAST_TTL_SECONDS = 600;
const SEARCH_TTL_SECONDS = 86_400;

export async function handleSearch(
  request: Request,
  env: Env,
  cache?: CacheLike,
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      throw methodNotAllowed();
    }

    const query = parseSearchQuery(request);
    const username = requireEnv(env, 'GEONAMES_USERNAME');
    const cacheKey = `geonames:v1:search:${query.toLowerCase()}`;
    const result = await cachedJson<Place[]>(
      cache,
      cacheKey,
      SEARCH_TTL_SECONDS,
      () => fetchGeonamesSearch(query, username),
    );
    const body: SearchResponse = { results: result.value };

    return jsonResponse(body);
  } catch (error) {
    return errorResponse(asApiError(error));
  }
}

export async function handleForecast(
  request: Request,
  env: Env,
  cache?: CacheLike,
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      throw methodNotAllowed();
    }

    const place = parseForecastPlace(request);
    const now = new Date();
    const localRange = getLocalDateRange(
      place.timezone,
      now,
      FORECAST_DAYS,
    );
    // Exclude user-supplied names and IDs so trivial query changes cannot
    // bypass the cache and consume additional provider records. Include the
    // local start date so the forecast window rolls over at local midnight.
    const cacheKey = [
      'visualcrossing:v3:forecast',
      FORECAST_DAYS,
      roundCoordinate(place.latitude).toFixed(4),
      roundCoordinate(place.longitude).toFixed(4),
      place.timezone ?? 'unknown',
      localRange?.start ?? 'default',
    ].join(':');
    const result = await cachedJson(
      cache,
      cacheKey,
      FORECAST_TTL_SECONDS,
      () => fetchVisualCrossingForecast(place, env, now),
    );
    const body: ForecastResponse = { forecast: result.value };

    return jsonResponse(body);
  } catch (error) {
    return errorResponse(asApiError(error));
  }
}
