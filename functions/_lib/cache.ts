export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const CACHE_ORIGIN = 'https://cache.retracify.internal';

export function getDefaultCache(): CacheLike | undefined {
  const runtime = globalThis as typeof globalThis & {
    caches?: { default?: CacheLike };
  };

  return runtime.caches?.default;
}

export class MemoryCache implements CacheLike {
  private readonly entries = new Map<
    string,
    { expiresAt: number; response: Response }
  >();

  async match(request: Request): Promise<Response | undefined> {
    const entry = this.entries.get(request.url);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(request.url);
      return undefined;
    }

    return entry.response.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    const maxAge = parseMaxAge(response.headers.get('cache-control'));
    const clone = response.clone();
    this.entries.set(request.url, {
      expiresAt: Date.now() + maxAge * 1000,
      response: clone,
    });
  }
}

function parseMaxAge(cacheControl: string | null): number {
  if (!cacheControl) {
    return 600;
  }

  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
  return match ? Number(match[1]) : 600;
}

function cacheRequest(key: string): Request {
  return new Request(`${CACHE_ORIGIN}/${encodeURIComponent(key)}`);
}

/**
 * Caches a binary response such as a radar image. The loader is responsible for
 * setting `cache-control`, which determines how long the entry is retained in
 * the in-memory cache used by local development.
 */
export async function cachedImage(
  cache: CacheLike | undefined,
  key: string,
  loader: () => Promise<Response>,
): Promise<Response> {
  if (!cache) {
    return loader();
  }

  const request = cacheRequest(key);

  try {
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }
  } catch {
    // A cache read failure must never prevent a live response.
  }

  const response = await loader();

  try {
    await cache.put(request, response.clone());
  } catch {
    // Best-effort cache write only.
  }

  return response;
}

/**
 * In-flight loads are shared per cache instance so concurrent requests for the
 * same key make a single upstream call. This matters because the free weather
 * plan permits only one concurrent upstream request.
 */
const inflightByCache = new WeakMap<
  CacheLike,
  Map<string, Promise<unknown>>
>();

export interface CachedValue<T> {
  value: T;
  hit: boolean;
  /**
   * True when a cached value was served after the loader failed. The value may
   * be older than the normal freshness window but is still within retention.
   */
  stale: boolean;
}

export interface CacheOptions {
  /** How long a value may be served after its freshness window, on failure. */
  staleSeconds?: number;
}

interface CacheEnvelope<T> {
  version: 1;
  freshUntil: number;
  value: T;
}

/**
 * Caches normalized JSON responses. The cache key must include a version and
 * every input that affects the response. On a loader failure an expired but
 * retained entry is served with `stale: true`.
 */
export async function cachedJson<T>(
  cache: CacheLike | undefined,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  options: CacheOptions = {},
): Promise<CachedValue<T>> {
  if (!cache) {
    return { value: await loader(), hit: false, stale: false };
  }

  let inflight = inflightByCache.get(cache);

  if (!inflight) {
    inflight = new Map();
    inflightByCache.set(cache, inflight);
  }

  const existing = inflight.get(key);

  if (existing) {
    return existing as Promise<CachedValue<T>>;
  }

  const promise = loadThrough(
    cache,
    key,
    ttlSeconds,
    loader,
    options.staleSeconds ?? ttlSeconds,
  );

  inflight.set(key, promise as Promise<unknown>);

  try {
    return await promise;
  } finally {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  }
}

async function loadThrough<T>(
  cache: CacheLike,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  staleSeconds: number,
): Promise<CachedValue<T>> {
  const request = cacheRequest(key);
  const retentionSeconds = Math.max(1, ttlSeconds + staleSeconds);
  let staleValue: T | undefined;

  try {
    const cached = await cache.match(request);

    if (cached) {
      try {
        const envelope = (await cached.json()) as CacheEnvelope<T>;

        if (
          envelope &&
          typeof envelope.freshUntil === 'number' &&
          typeof envelope.version === 'number' &&
          'value' in envelope
        ) {
          if (Date.now() < envelope.freshUntil) {
            return { value: envelope.value, hit: true, stale: false };
          }

          staleValue = envelope.value;
        }
      } catch {
        // An unreadable cache entry is treated as a miss.
      }
    }
  } catch {
    // A cache read failure must never prevent a live response.
  }

  try {
    const value = await loader();
    const envelope: CacheEnvelope<T> = {
      version: 1,
      freshUntil: Date.now() + ttlSeconds * 1000,
      value,
    };
    const response = new Response(JSON.stringify(envelope), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `max-age=${retentionSeconds}`,
      },
    });

    try {
      await cache.put(request, response.clone());
    } catch {
      // Best-effort cache write only.
    }

    return { value, hit: false, stale: false };
  } catch (error) {
    if (staleValue !== undefined) {
      return { value: staleValue, hit: true, stale: true };
    }

    throw error;
  }
}
