import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ForecastResponse,
  SearchResponse,
} from '../../shared/types.ts';
import { FORECAST_DAYS } from '../../shared/config.ts';
import {
  handleForecast,
  handleHealth,
  handleRadar,
  handleReverse,
  handleSearch,
} from './handlers.ts';
import { MemoryCache } from './cache.ts';
import {
  MemoryBudgetStore,
  MemoryRateLimiter,
  ProviderBudget,
} from './limits.ts';
import { mercatorBounds } from './providers/visualCrossingMap.ts';
import {
  makeGeonamesNearbyPayload,
  makeGeonamesPayload,
  makeGeonamesPlacePayload,
  makeVisualCrossingPayload,
  TEST_PLACE,
} from './__fixtures__/providers.ts';

const SEARCH_URL = 'https://example.com/api/search?q=Grand%20Falls';
const FORECAST_URL = 'https://example.com/api/forecast?placeId=6621033';
const RADAR_URL =
  'https://example.com/api/radar?placeId=6621033&mode=6h&offset=0';
const REVERSE_URL =
  'https://example.com/api/reverse?lat=47.0461&lon=-67.7418';
const ENV = {
  VISUAL_CROSSING_API_KEY: 'test-key',
  GEONAMES_USERNAME: 'tester',
};

type Responder = () => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function providerRouter(
  responders: {
    search?: Responder;
    place?: Responder;
    nearby?: Responder;
    forecast?: Responder;
    radar?: Responder;
  } = {},
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('/searchJSON')) {
      return (responders.search ??
        (() => jsonResponse(makeGeonamesPayload())))();
    }

    if (url.includes('/getJSON')) {
      return (responders.place ??
        (() => jsonResponse(makeGeonamesPlacePayload())))();
    }

    if (url.includes('/findNearbyPlaceNameJSON')) {
      return (responders.nearby ??
        (() => jsonResponse(makeGeonamesNearbyPayload())))();
    }

    if (url.includes('/map/image/precipcomposite/')) {
      return (
        responders.radar ??
        (() =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'content-type': 'image/png' },
          }))()
      );
    }

    return (responders.forecast ??
      (() => jsonResponse(makeVisualCrossingPayload())))();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('handleSearch', () => {
  it('returns normalized places and caches repeated queries', async () => {
    const fetchMock = providerRouter({
      search: () => jsonResponse(makeGeonamesPayload()),
    });
    vi.stubGlobal('fetch', fetchMock);
    const cache = new MemoryCache();

    const first = await handleSearch(
      new Request(SEARCH_URL),
      { GEONAMES_USERNAME: 'tester' },
      cache,
    );
    expect(first.status).toBe(200);

    const firstBody = (await first.json()) as SearchResponse;
    expect(firstBody.results).toHaveLength(2);
    expect(firstBody.results[0].name).toBe('Grand Falls');

    const second = await handleSearch(
      new Request(SEARCH_URL),
      { GEONAMES_USERNAME: 'tester' },
      cache,
    );
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a configuration error when the username is missing', async () => {
    const response = await handleSearch(
      new Request(SEARCH_URL),
      {},
      new MemoryCache(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFIGURATION' },
    });
  });

  it('returns 429 when GeoNames reports a limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ status: { message: 'limit', value: 18 } }),
      ),
    );

    const response = await handleSearch(
      new Request(SEARCH_URL),
      { GEONAMES_USERNAME: 'tester' },
      new MemoryCache(),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });
});

describe('handleForecast', () => {
  it('resolves the place by ID and caches repeated requests', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);
    const cache = new MemoryCache();

    const first = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      cache,
    );
    expect(first.status).toBe(200);

    const firstBody = (await first.json()) as ForecastResponse;
    expect(firstBody.forecast.daily).toHaveLength(FORECAST_DAYS);
    expect(firstBody.forecast.hourly).toHaveLength(24);
    expect(firstBody.forecast.current?.temperatureC).toBe(8.4);
    expect(firstBody.forecast.place).toMatchObject({
      id: '6621033',
      name: 'Grand Falls',
    });
    expect(firstBody.stale).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      cache,
    );
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects legacy coordinate requests without calling providers', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleForecast(
      new Request(
        'https://example.com/api/forecast?lat=47.0461&lon=-67.7418&name=Grand%20Falls',
      ),
      ENV,
      new MemoryCache(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_PLACE' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown place ID without a forecast request', async () => {
    const fetchMock = providerRouter({
      place: () =>
        jsonResponse({ status: { message: 'not found', value: 12 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleForecast(
      new Request('https://example.com/api/forecast?placeId=999999'),
      ENV,
      new MemoryCache(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a configuration error when the key is missing', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleForecast(
      new Request(FORECAST_URL),
      { GEONAMES_USERNAME: 'tester' },
      new MemoryCache(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFIGURATION' },
    });
  });

  it('maps provider authentication errors to a non-retryable 502', async () => {
    vi.stubGlobal(
      'fetch',
      providerRouter({
        forecast: () => new Response('{}', { status: 401 }),
      }),
    );

    const response = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      new MemoryCache(),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UPSTREAM_AUTH', retryable: false },
    });
  });

  it('maps unreadable provider responses to 502', async () => {
    vi.stubGlobal(
      'fetch',
      providerRouter({
        forecast: () => new Response('not json', { status: 200 }),
      }),
    );

    const response = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      new MemoryCache(),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_RESPONSE' },
    });
  });

  it('serves a stale cached forecast when the provider fails', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-23T20:30:00Z');
    vi.setSystemTime(now);
    const cache = new MemoryCache();

    vi.stubGlobal('fetch', providerRouter());
    const first = await handleForecast(new Request(FORECAST_URL), ENV, cache, {
      now,
    });
    expect(first.status).toBe(200);

    const later = new Date(now.getTime() + 11 * 60_000);
    vi.setSystemTime(later);
    vi.stubGlobal(
      'fetch',
      providerRouter({
        forecast: () => new Response('{}', { status: 401 }),
      }),
    );

    const second = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      cache,
      { now: later },
    );

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      stale: true,
    });
  });

  it('returns 429 after the per-IP forecast limit', async () => {
    vi.stubGlobal('fetch', providerRouter());
    const limiter = new MemoryRateLimiter();
    const cache = new MemoryCache();
    const request = () =>
      new Request(FORECAST_URL, {
        headers: { 'cf-connecting-ip': '203.0.113.9' },
      });

    for (let index = 0; index < 30; index += 1) {
      const response = await handleForecast(request(), ENV, cache, {
        limiter,
      });
      expect(response.status).toBe(200);
    }

    const limited = await handleForecast(request(), ENV, cache, { limiter });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });

  it('stops calling the provider when the daily budget is exhausted', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2026-10-23T20:30:00Z');
    const budget = new ProviderBudget(new MemoryBudgetStore(), {
      forecast: { daily: 1 },
      search: { daily: 100 },
      map: { daily: 100 },
    });
    const cache = new MemoryCache();

    const first = await handleForecast(
      new Request(FORECAST_URL),
      ENV,
      cache,
      { now, budget },
    );
    expect(first.status).toBe(200);

    const second = await handleForecast(
      new Request('https://example.com/api/forecast?placeId=5028491'),
      ENV,
      cache,
      { now, budget },
    );

    expect(second.status).toBe(503);
    await expect(second.json()).resolves.toMatchObject({
      error: { code: 'BUDGET_EXHAUSTED', retryable: true },
    });
  });
});

describe('handleRadar', () => {
  const RADAR_NOW = new Date('2026-10-23T20:30:00Z');

  function radarBudget() {
    return new ProviderBudget(new MemoryBudgetStore(), {
      forecast: { daily: 100 },
      search: { daily: 100 },
      map: { daily: 100 },
    });
  }

  it('returns an image frame with bounds and caches repeated requests', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);
    const cache = new MemoryCache();
    const deps = { now: RADAR_NOW, budget: radarBudget() };

    const first = await handleRadar(
      new Request(RADAR_URL),
      ENV,
      cache,
      deps,
    );
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/png');

    const expected = mercatorBounds(
      TEST_PLACE.latitude,
      TEST_PLACE.longitude,
    );
    expect(first.headers.get('x-radar-bounds')).toBe(
      [expected.south, expected.west, expected.north, expected.east].join(','),
    );
    expect(first.headers.get('x-radar-time')).toBe(
      '2026-10-23T20:30:00.000Z',
    );
    expect(first.headers.get('cache-control')).toContain('max-age=86400');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await handleRadar(
      new Request(RADAR_URL),
      ENV,
      cache,
      deps,
    );
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the shorter cache window for forecast frames', async () => {
    vi.stubGlobal('fetch', providerRouter());

    const response = await handleRadar(
      new Request(
        'https://example.com/api/radar?placeId=6621033&mode=6h&offset=360',
      ),
      ENV,
      new MemoryCache(),
      { now: RADAR_NOW, budget: radarBudget() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('rejects an invalid timeframe without calling a provider', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleRadar(
      new Request(
        'https://example.com/api/radar?placeId=6621033&mode=24h&offset=0',
      ),
      ENV,
      new MemoryCache(),
      { now: RADAR_NOW, budget: radarBudget() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_QUERY' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a frame offset that is not on the timeline', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleRadar(
      new Request(
        'https://example.com/api/radar?placeId=6621033&mode=6h&offset=15',
      ),
      ENV,
      new MemoryCache(),
      { now: RADAR_NOW, budget: radarBudget() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_QUERY' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('handleReverse', () => {
  it('returns the nearest place and caches repeated coordinates', async () => {
    const fetchMock = providerRouter();
    vi.stubGlobal('fetch', fetchMock);
    const cache = new MemoryCache();

    const first = await handleReverse(
      new Request(REVERSE_URL),
      { GEONAMES_USERNAME: 'tester' },
      cache,
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      place: { id: '6621033', name: 'Grand Falls' },
    });

    const second = await handleReverse(
      new Request(REVERSE_URL),
      { GEONAMES_USERNAME: 'tester' },
      cache,
    );
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when no nearby place is found', async () => {
    vi.stubGlobal(
      'fetch',
      providerRouter({ nearby: () => jsonResponse({ geonames: [] }) }),
    );

    const response = await handleReverse(
      new Request(REVERSE_URL),
      { GEONAMES_USERNAME: 'tester' },
      new MemoryCache(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects invalid coordinates', async () => {
    const response = await handleReverse(
      new Request('https://example.com/api/reverse?lat=999&lon=0'),
      { GEONAMES_USERNAME: 'tester' },
      new MemoryCache(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_COORDINATES' },
    });
  });
});

describe('handleHealth', () => {
  it('returns a no-store health response', async () => {
    const response = handleHealth(
      new Request('https://example.com/api/health'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects non-GET requests', () => {
    const response = handleHealth(
      new Request('https://example.com/api/health', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
  });
});
