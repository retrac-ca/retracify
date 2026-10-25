import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors.ts';
import {
  enforceRateLimit,
  KvBudgetStore,
  MemoryBudgetStore,
  MemoryRateLimiter,
  ProviderBudget,
  RATE_LIMITS,
} from './limits.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

function expectRateLimited(action: () => unknown): void {
  try {
    action();
    throw new Error('Expected an ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).code).toBe('RATE_LIMITED');
  }
}

describe('MemoryRateLimiter', () => {
  it('allows requests up to the limit and resets after the window', () => {
    const limiter = new MemoryRateLimiter();
    const rule = { limit: 2, windowMs: 60_000 };
    const now = Date.parse('2026-10-23T20:30:00Z');

    expect(limiter.check('ip', rule, now).allowed).toBe(true);
    expect(limiter.check('ip', rule, now).allowed).toBe(true);
    expect(limiter.check('ip', rule, now).allowed).toBe(false);
    expect(limiter.check('ip', rule, now + 60_000).allowed).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const limiter = new MemoryRateLimiter();
    const rule = { limit: 1, windowMs: 60_000 };
    const now = Date.parse('2026-10-23T20:30:00Z');

    expect(limiter.check('a', rule, now).allowed).toBe(true);
    expect(limiter.check('b', rule, now).allowed).toBe(true);
    expect(limiter.check('a', rule, now).allowed).toBe(false);
  });
});

describe('enforceRateLimit', () => {
  it('ignores requests without a proxy address', () => {
    const limiter = new MemoryRateLimiter();
    const now = new Date('2026-10-23T20:30:00Z');

    for (let index = 0; index < 100; index += 1) {
      enforceRateLimit(
        limiter,
        new Request('https://example.com/api/forecast'),
        'forecast',
        now,
      );
    }
  });

  it('limits a single client address', () => {
    const limiter = new MemoryRateLimiter();
    const now = new Date('2026-10-23T20:30:00Z');
    const request = () =>
      new Request('https://example.com/api/forecast', {
        headers: { 'cf-connecting-ip': '198.51.100.7' },
      });

    for (let index = 0; index < RATE_LIMITS.forecast.limit; index += 1) {
      enforceRateLimit(limiter, request(), 'forecast', now);
    }

    expectRateLimited(() =>
      enforceRateLimit(limiter, request(), 'forecast', now),
    );
  });
});

describe('ProviderBudget', () => {
  function makeBudget(
    limits: ConstructorParameters<typeof ProviderBudget>[1],
  ) {
    const clock = { value: Date.parse('2026-10-23T20:30:00Z') };
    const store = new MemoryBudgetStore(() => clock.value);
    const budget = new ProviderBudget(store, limits);

    return {
      clock,
      budget,
      now: () => new Date(clock.value),
    };
  }

  it('allows reservations up to the daily limit', async () => {
    const { budget, now } = makeBudget({
      forecast: { daily: 2 },
      search: { daily: 10 },
    });

    await budget.reserve('forecast', now());
    await budget.reserve('forecast', now());

    await expect(budget.reserve('forecast', now())).rejects.toMatchObject({
      status: 503,
      code: 'BUDGET_EXHAUSTED',
      retryable: true,
    });
  });

  it('enforces the hourly search window and resets at the next hour', async () => {
    const { budget, clock, now } = makeBudget({
      forecast: { daily: 10 },
      search: { daily: 10, hourly: 2 },
    });

    await budget.reserve('search', now());
    await budget.reserve('search', now());

    await expect(budget.reserve('search', now())).rejects.toMatchObject({
      code: 'BUDGET_EXHAUSTED',
    });

    clock.value += 60 * 60 * 1000;

    await expect(budget.reserve('search', now())).resolves.toBeUndefined();
  });

  it('resets the daily window on the next UTC day', async () => {
    const { budget, clock, now } = makeBudget({
      forecast: { daily: 1 },
      search: { daily: 10 },
    });

    await budget.reserve('forecast', now());
    await expect(budget.reserve('forecast', now())).rejects.toMatchObject({
      code: 'BUDGET_EXHAUSTED',
    });

    clock.value += 24 * 60 * 60 * 1000;

    await expect(budget.reserve('forecast', now())).resolves.toBeUndefined();
  });

  it('returns a retry delay that matches the exhausted window', async () => {
    const { budget, now } = makeBudget({
      forecast: { daily: 1 },
      search: { daily: 10 },
    });

    await budget.reserve('forecast', now());

    try {
      await budget.reserve('forecast', now());
      throw new Error('Expected a budget error');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const retryAfter = (error as ApiError).retryAfterSeconds ?? 0;
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
    }
  });

  it('fails open when the budget store is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = {
      async get(): Promise<number | null> {
        throw new Error('kv down');
      },
      async put(): Promise<void> {
        throw new Error('kv down');
      },
    };
    const budget = new ProviderBudget(store, {
      forecast: { daily: 1 },
      search: { daily: 10 },
    });

    await expect(
      budget.reserve('forecast', new Date('2026-10-23T20:30:00Z')),
    ).resolves.toBeUndefined();
  });
});

describe('KvBudgetStore', () => {
  it('reads and writes numeric counters', async () => {
    const values = new Map<string, string>();
    const kv = {
      async get(key: string) {
        return values.get(key) ?? null;
      },
      async put(key: string, value: string) {
        values.set(key, value);
      },
    };
    const store = new KvBudgetStore(kv);

    expect(await store.get('counter')).toBeNull();
    await store.put('counter', 3, 60);
    expect(await store.get('counter')).toBe(3);
  });
});
