import type {
  Forecast,
  ForecastResponse,
  Place,
  SearchResponse,
} from '../../shared/types';
import { ClientApiError, isApiErrorBody } from './errors';

const REQUEST_TIMEOUT_MS = 20_000;

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (isApiErrorBody(payload)) {
        throw new ClientApiError(
          response.status,
          payload.error.code,
          payload.error.message,
          {
            retryable: payload.error.retryable,
            retryAfterSeconds: payload.error.retryAfterSeconds,
          },
        );
      }

      throw new ClientApiError(
        response.status,
        'INTERNAL',
        'The weather service could not complete this request. Please try again.',
        { retryable: true },
      );
    }

    if (payload === null) {
      throw new ClientApiError(
        502,
        'INVALID_RESPONSE',
        'The weather service returned an unreadable response.',
      );
    }

    return payload as T;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (timedOut) {
      throw new ClientApiError(
        504,
        'TIMEOUT',
        'The request took too long. Check your connection and try again.',
        { retryable: true },
      );
    }

    if (error instanceof ClientApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ClientApiError(
      0,
      'NETWORK',
      'Could not reach the weather service. Check your connection and try again.',
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const params = new URLSearchParams({ q: query });
  const response = await requestJson<SearchResponse>(
    `/api/search?${params.toString()}`,
    signal,
  );
  return response.results;
}

export async function getForecast(
  place: Place,
  signal?: AbortSignal,
): Promise<Forecast> {
  const params = new URLSearchParams({
    lat: String(place.latitude),
    lon: String(place.longitude),
    id: place.id,
    name: place.name,
    country: place.country,
    countryCode: place.countryCode,
  });

  if (place.admin1) params.set('admin1', place.admin1);
  if (place.timezone) params.set('timezone', place.timezone);

  const response = await requestJson<ForecastResponse>(
    `/api/forecast?${params.toString()}`,
    signal,
  );
  return response.forecast;
}
