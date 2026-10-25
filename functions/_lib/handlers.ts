import type {
  Forecast,
  ForecastResponse,
  Place,
  ReverseResponse,
  SearchResponse,
} from '../../shared/types.ts';
import { FORECAST_DAYS } from '../../shared/config.ts';
import { cachedJson, type CacheLike } from './cache.ts';
import {
  asApiError,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
} from './errors.ts';
import { requireEnv, type Env } from './env.ts';
import { fetchVisualCrossingForecast } from './providers/visualCrossing.ts';
import { getLocalDateRange } from './dates.ts';
import {
  fetchGeonamesSearch,
  fetchNearbyPlace,
  fetchPlaceById,
} from './geocoders/geonames.ts';
import { parseCoordinates, parsePlaceId, parseSearchQuery } from './validate.ts';
import {
  createBudget,
  enforceRateLimit,
  MemoryBudgetStore,
  MemoryRateLimiter,
  type Budget,
  type RateLimiter,
} from './limits.ts';

const FORECAST_TTL_SECONDS = 600;
const SEARCH_TTL_SECONDS = 86_400;
const PLACE_TTL_SECONDS = 604_800;
const NEARBY_TTL_SECONDS = 86_400;
const FORECAST_STALE_SECONDS = 86_400;
const SEARCH_STALE_SECONDS = 604_800;

const defaultRateLimiter = new MemoryRateLimiter();
const defaultBudgetStore = new MemoryBudgetStore();

export interface HandlerDeps {
  now?: Date;
  limiter?: RateLimiter;
  budget?: Budget;
}

interface ResolvedDeps {
  now: Date;
  limiter: RateLimiter;
  budget: Budget;
}

function resolveDeps(env: Env, deps: HandlerDeps): ResolvedDeps {
  return {
    now: deps.now ?? new Date(),
    limiter: deps.limiter ?? defaultRateLimiter,
    budget: deps.budget ?? createBudget(env, defaultBudgetStore),
  };
}

export async function handleSearch(
  request: Request,
  env: Env,
  cache?: CacheLike,
  deps: HandlerDeps = {},
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      throw methodNotAllowed();
    }

    const { now, limiter, budget } = resolveDeps(env, deps);
    enforceRateLimit(limiter, request, 'search', now);

    const query = parseSearchQuery(request);
    const cacheKey = `geonames:v1:search:${query.toLowerCase()}`;
    const result = await cachedJson<Place[]>(
      cache,
      cacheKey,
      SEARCH_TTL_SECONDS,
      async () => {
        const username = requireEnv(env, 'GEONAMES_USERNAME');
        await budget.reserve('search', now);
        return fetchGeonamesSearch(query, username);
      },
      { staleSeconds: SEARCH_STALE_SECONDS },
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
  deps: HandlerDeps = {},
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      throw methodNotAllowed();
    }

    const { now, limiter, budget } = resolveDeps(env, deps);
    enforceRateLimit(limiter, request, 'forecast', now);

    const placeId = parsePlaceId(request);

    // The provider forecast body contains only server-resolved place metadata,
    // so it is safe to cache and reuse across requests for the same place.
    const placeResult = await cachedJson<Place>(
      cache,
      `geonames:v1:place:${placeId}`,
      PLACE_TTL_SECONDS,
      async () => {
        const username = requireEnv(env, 'GEONAMES_USERNAME');
        await budget.reserve('search', now);
        return fetchPlaceById(placeId, username);
      },
      { staleSeconds: SEARCH_STALE_SECONDS },
    );
    const place = placeResult.value;
    const localRange = getLocalDateRange(
      place.timezone,
      now,
      FORECAST_DAYS,
    );
    // Include the local start date so the forecast window rolls over at local
    // midnight. The place ID replaces coordinates, so arbitrary coordinate
    // pairs cannot create cache misses that consume provider records.
    const cacheKey = [
      'visualcrossing:v4:forecast',
      FORECAST_DAYS,
      placeId,
      localRange?.start ?? 'default',
    ].join(':');
    const result = await cachedJson<Forecast>(
      cache,
      cacheKey,
      FORECAST_TTL_SECONDS,
      async () => {
        await budget.reserve('forecast', now);
        return fetchVisualCrossingForecast(place, env, now);
      },
      { staleSeconds: FORECAST_STALE_SECONDS },
    );
    const body: ForecastResponse = {
      forecast: result.value,
      ...(result.stale ? { stale: true } : {}),
    };

    return jsonResponse(body);
  } catch (error) {
    return errorResponse(asApiError(error));
  }
}

export async function handleReverse(
  request: Request,
  env: Env,
  cache?: CacheLike,
  deps: HandlerDeps = {},
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      throw methodNotAllowed();
    }

    const { now, limiter, budget } = resolveDeps(env, deps);
    enforceRateLimit(limiter, request, 'reverse', now);

    const coordinates = parseCoordinates(request);
    const cacheKey = [
      'geonames:v1:nearby',
      coordinates.latitude.toFixed(4),
      coordinates.longitude.toFixed(4),
    ].join(':');
    const result = await cachedJson<Place>(
      cache,
      cacheKey,
      NEARBY_TTL_SECONDS,
      async () => {
        const username = requireEnv(env, 'GEONAMES_USERNAME');
        await budget.reserve('search', now);
        return fetchNearbyPlace(
          coordinates.latitude,
          coordinates.longitude,
          username,
        );
      },
      { staleSeconds: SEARCH_STALE_SECONDS },
    );
    const body: ReverseResponse = { place: result.value };

    return jsonResponse(body);
  } catch (error) {
    return errorResponse(asApiError(error));
  }
}

export function handleHealth(request: Request): Response {
  if (request.method !== 'GET') {
    return errorResponse(methodNotAllowed());
  }

  return jsonResponse({
    status: 'ok',
    time: new Date().toISOString(),
  });
}
