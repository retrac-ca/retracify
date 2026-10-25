import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './http.ts';
import { ApiError } from './errors.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('returns parsed JSON from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      fetchJson<{ ok: boolean }>('https://example.com/data', {
        timeoutMs: 1000,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '0' },
        }),
      ),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('maps authentication failures to a configuration-style error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_AUTH',
      retryable: false,
    });
  });

  it('maps 404 to NOT_FOUND when a message is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
        notFoundMessage: 'That location could not be found.',
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      retryable: false,
    });
  });

  it('maps 404 to an upstream failure without a NOT_FOUND message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: false,
    });
  });

  it('maps upstream 5xx responses to a retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
  });

  it('maps unreadable JSON to an invalid-response error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 })),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
    });
  });

  it('maps an aborted request to a timeout error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
    );

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      fetchJson('https://example.com/data', {
        timeoutMs: 1000,
        retries: 0,
      }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
