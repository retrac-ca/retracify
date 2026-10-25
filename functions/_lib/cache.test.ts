import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedJson, MemoryCache, type CacheLike } from './cache.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('cachedJson', () => {
  it('serves a fresh hit without calling the loader again', async () => {
    const cache = new MemoryCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { count: calls };
    };

    const first = await cachedJson(cache, 'fresh', 60, loader);
    expect(first).toMatchObject({
      value: { count: 1 },
      hit: false,
      stale: false,
    });

    const second = await cachedJson(cache, 'fresh', 60, loader);
    expect(second).toMatchObject({
      value: { count: 1 },
      hit: true,
      stale: false,
    });
    expect(calls).toBe(1);
  });

  it('shares one in-flight load across concurrent requests', async () => {
    const cache = new MemoryCache();
    let calls = 0;
    let release: (value: number) => void = () => {};
    const gate = new Promise<number>((resolve) => {
      release = resolve;
    });
    const loader = () => {
      calls += 1;
      return gate;
    };

    const first = cachedJson(cache, 'shared', 60, loader);
    const second = cachedJson(cache, 'shared', 60, loader);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);

    release(42);
    await expect(first).resolves.toMatchObject({ value: 42 });
    await expect(second).resolves.toMatchObject({ value: 42 });
    expect(calls).toBe(1);
  });

  it('serves a stale value when a refresh fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T20:30:00Z'));
    const cache = new MemoryCache();

    await cachedJson(
      cache,
      'stale',
      60,
      async () => 'first',
      { staleSeconds: 3_600 },
    );
    vi.setSystemTime(new Date('2026-10-23T20:32:00Z'));

    const result = await cachedJson(
      cache,
      'stale',
      60,
      async () => {
        throw new Error('provider down');
      },
      { staleSeconds: 3_600 },
    );

    expect(result).toMatchObject({ value: 'first', hit: true, stale: true });
  });

  it('throws once the stale retention window has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T20:30:00Z'));
    const cache = new MemoryCache();

    await cachedJson(
      cache,
      'expired',
      60,
      async () => 'first',
      { staleSeconds: 3_600 },
    );
    vi.setSystemTime(new Date('2026-10-23T22:30:00Z'));

    await expect(
      cachedJson(
        cache,
        'expired',
        60,
        async () => {
          throw new Error('provider down');
        },
        { staleSeconds: 3_600 },
      ),
    ).rejects.toThrow('provider down');
  });

  it('treats an unreadable cache entry as a miss', async () => {
    const cache = new MemoryCache();
    await cache.put(
      new Request('https://cache.retracify.internal/unreadable'),
      new Response('not-json', {
        headers: { 'cache-control': 'max-age=60' },
      }),
    );

    const result = await cachedJson(
      cache,
      'unreadable',
      60,
      async () => 'fresh',
    );

    expect(result).toMatchObject({ value: 'fresh', stale: false });
  });

  it('still returns a live value when the cache is broken', async () => {
    const broken: CacheLike = {
      match: async () => {
        throw new Error('cache down');
      },
      put: async () => {
        throw new Error('cache down');
      },
    };

    const result = await cachedJson(
      broken,
      'broken',
      60,
      async () => 'live',
    );

    expect(result).toMatchObject({ value: 'live', stale: false });
  });
});
