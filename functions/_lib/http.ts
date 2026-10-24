import { ApiError } from './errors.ts';
import { USER_AGENT } from './env.ts';

export interface FetchJsonOptions {
  timeoutMs: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_RETRY_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');

  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds), 300);
  }

  const date = Date.parse(value);

  if (Number.isFinite(date)) {
    return Math.min(Math.max(Math.round((date - Date.now()) / 1000), 0), 300);
  }

  return undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (error instanceof Error && error.name === 'AbortError');
}

/**
 * Fetches JSON from an upstream provider with a timeout and limited retries.
 * Error messages deliberately avoid including the full URL because provider
 * keys may be present in a query string.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions,
): Promise<T> {
  const attempts = (options.retries ?? 0) + 1;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new ApiError(
            502,
            'INVALID_RESPONSE',
            'The weather service returned an unreadable response.',
            { retryable: false },
          );
        }
      }

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfter(response);
        const shortWait =
          retryAfterSeconds === undefined || retryAfterSeconds <= 2;

        if (attempt + 1 < attempts && shortWait) {
          await sleep(
            retryAfterSeconds ? retryAfterSeconds * 1000 : retryDelayMs,
          );
          continue;
        }

        throw new ApiError(
          429,
          'RATE_LIMITED',
          'The weather service is temporarily busy. Please wait a moment and try again.',
          { retryable: true, retryAfterSeconds },
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          502,
          'UPSTREAM_AUTH',
          'A weather service is temporarily unavailable. Please try again later.',
          { retryable: false },
        );
      }

      if (response.status >= 500) {
        if (attempt + 1 < attempts) {
          await sleep(retryDelayMs);
          continue;
        }

        throw new ApiError(
          502,
          'UPSTREAM_UNAVAILABLE',
          'The weather service is temporarily unavailable.',
          { retryable: true },
        );
      }

      throw new ApiError(
        502,
        'UPSTREAM_UNAVAILABLE',
        'The weather service could not complete this request.',
        { retryable: false },
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new ApiError(
          504,
          'TIMEOUT',
          'The weather service took too long to respond. Please try again.',
          { retryable: true },
        );
      }

      if (attempt + 1 < attempts) {
        await sleep(retryDelayMs);
        continue;
      }

      throw new ApiError(
        502,
        'NETWORK',
        'Could not reach the weather service. Check your connection and try again.',
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ApiError(
    502,
    'UPSTREAM_UNAVAILABLE',
    'The weather service is temporarily unavailable.',
    { retryable: true },
  );
}
