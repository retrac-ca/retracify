import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForecastResponse, SearchResponse } from '../../shared/types.ts';
import { handleForecast, handleSearch } from './handlers.ts';
import { MemoryCache } from './cache.ts';
import {
  makeGeonamesPayload,
  makeVisualCrossingPayload,
} from './__fixtures__/providers.ts';

const SEARCH_URL =
  'https://example.com/api/search?q=Grand%20Falls';
const FORECAST_URL =
  'https://example.com/api/forecast?lat=47.04609&lon=-67.74179&id=6621033&name=Grand%20Falls&admin1=New%20Brunswick&country=Canada&countryCode=CA&timezone=America%2FMoncton';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleSearch', () => {
  it('returns normalized places and caches repeated queries', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(makeGeonamesPayload()));
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
  it('returns a normalized forecast and caches repeated requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(makeVisualCrossingPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const cache = new MemoryCache();

    const first = await handleForecast(
      new Request(FORECAST_URL),
      { VISUAL_CROSSING_API_KEY: 'test-key' },
      cache,
    );
    expect(first.status).toBe(200);

    const firstBody = (await first.json()) as ForecastResponse;
    expect(firstBody.forecast.daily).toHaveLength(5);
    expect(firstBody.forecast.hourly).toHaveLength(24);
    expect(firstBody.forecast.current?.temperatureC).toBe(8.4);

    const second = await handleForecast(
      new Request(FORECAST_URL),
      { VISUAL_CROSSING_API_KEY: 'test-key' },
      cache,
    );
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a configuration error when the key is missing', async () => {
    const response = await handleForecast(
      new Request(FORECAST_URL),
      {},
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
      vi.fn(async () => new Response('{}', { status: 401 })),
    );

    const response = await handleForecast(
      new Request(FORECAST_URL),
      { VISUAL_CROSSING_API_KEY: 'bad-key' },
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
      vi.fn(async () => new Response('not json', { status: 200 })),
    );

    const response = await handleForecast(
      new Request(FORECAST_URL),
      { VISUAL_CROSSING_API_KEY: 'test-key' },
      new MemoryCache(),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_RESPONSE' },
    });
  });
});
