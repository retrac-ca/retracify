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

export interface CachedValue<T> {
  value: T;
  hit: boolean;
}

/**
 * Caches normalized JSON responses. The cache key must include a version and
 * every input that affects the response.
 */
export async function cachedJson<T>(
  cache: CacheLike | undefined,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CachedValue<T>> {
  if (!cache) {
    return { value: await loader(), hit: false };
  }

  const request = cacheRequest(key);

  try {
    const cached = await cache.match(request);

    if (cached) {
      try {
        return { value: (await cached.json()) as T, hit: true };
      } catch {
        // Fall through to a fresh load if the cached body is unreadable.
      }
    }
  } catch {
    // A cache failure must never prevent a live response.
  }

  const value = await loader();
  const response = new Response(JSON.stringify(value), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `max-age=${ttlSeconds}`,
    },
  });

  try {
    await cache.put(request, response.clone());
  } catch {
    // Best-effort cache write only.
  }

  return { value, hit: false };
}
