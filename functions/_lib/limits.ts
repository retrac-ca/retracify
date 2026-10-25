import {
  DAILY_FORECAST_BUDGET,
  DAILY_SEARCH_BUDGET,
  HOURLY_SEARCH_BUDGET,
} from '../../shared/config.ts';
import { ApiError } from './errors.ts';
import type { Env, KvNamespace } from './env.ts';

export type ApiRoute = 'search' | 'forecast' | 'reverse';
export type BudgetKind = 'forecast' | 'search';

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/**
 * Per-IP request limits. These are enforced per Worker isolate, so they stop
 * bursts and casual scripts rather than a distributed attacker. The provider
 * budget below is the backstop for the latter.
 */
export const RATE_LIMITS: Record<ApiRoute, RateLimitRule> = {
  search: { limit: 20, windowMs: 60_000 },
  forecast: { limit: 30, windowMs: 60_000 },
  reverse: { limit: 20, windowMs: 60_000 },
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(
    key: string,
    rule: RateLimitRule,
    now: number,
  ): RateLimitResult;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly maxEntries = 10_000) {}

  check(key: string, rule: RateLimitRule, now: number): RateLimitResult {
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      this.evictIfNeeded(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1000),
        ),
      };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private evictIfNeeded(now: number): void {
    if (this.buckets.size <= this.maxEntries) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    while (this.buckets.size > this.maxEntries) {
      const oldest = this.buckets.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.buckets.delete(oldest);
    }
  }
}

function clientAddress(request: Request): string | null {
  const direct = request.headers.get('cf-connecting-ip')?.trim();

  if (direct) {
    return direct;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();

  return first || null;
}

/**
 * Enforces a per-IP limit for an API route. Requests without a proxy address
 * (local Vite development and unit tests) are not limited.
 */
export function enforceRateLimit(
  limiter: RateLimiter,
  request: Request,
  route: ApiRoute,
  now: Date,
): void {
  const address = clientAddress(request);

  if (!address) {
    return;
  }

  const result = limiter.check(
    `${route}:${address}`,
    RATE_LIMITS[route],
    now.getTime(),
  );

  if (!result.allowed) {
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Too many requests. Please wait a moment and try again.',
      { retryable: true, retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

export interface BudgetStore {
  get(key: string): Promise<number | null>;
  put(key: string, value: number, ttlSeconds: number): Promise<void>;
}

export class MemoryBudgetStore implements BudgetStore {
  private readonly entries = new Map<
    string,
    { value: number; expiresAt: number }
  >();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<number | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  async put(
    key: string,
    value: number,
    ttlSeconds: number,
  ): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }
}

export class KvBudgetStore implements BudgetStore {
  constructor(private readonly kv: KvNamespace) {}

  async get(key: string): Promise<number | null> {
    const raw = await this.kv.get(key);

    if (!raw) {
      return null;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  async put(
    key: string,
    value: number,
    ttlSeconds: number,
  ): Promise<void> {
    await this.kv.put(key, String(value), {
      expirationTtl: Math.max(60, Math.ceil(ttlSeconds)),
    });
  }
}

export interface BudgetWindows {
  daily: number;
  hourly?: number;
}

export const DEFAULT_BUDGET_LIMITS: Record<BudgetKind, BudgetWindows> = {
  forecast: { daily: DAILY_FORECAST_BUDGET },
  search: { daily: DAILY_SEARCH_BUDGET, hourly: HOURLY_SEARCH_BUDGET },
};

export interface Budget {
  reserve(kind: BudgetKind, now: Date): Promise<void>;
}

/**
 * Reserves one provider record for the current day (and hour for search) or
 * throws a retryable 503. Counters are read-then-written, so a small overshoot
 * is possible under concurrency; the configured limits leave headroom.
 */
export class ProviderBudget implements Budget {
  constructor(
    private readonly store: BudgetStore,
    private readonly limits: Record<BudgetKind, BudgetWindows> =
      DEFAULT_BUDGET_LIMITS,
  ) {}

  async reserve(kind: BudgetKind, now: Date): Promise<void> {
    try {
      await this.reserveCounters(kind, now);
    } catch (error) {
      if (error instanceof ApiError) {
        // A real budget limit must still stop the upstream call.
        throw error;
      }

      // Budget storage is infrastructure, not weather data. If it is
      // unavailable, prefer serving weather over failing the request.
      console.warn(
        'Provider budget storage is unavailable; skipping this budget check.',
      );
    }
  }

  private async reserveCounters(
    kind: BudgetKind,
    now: Date,
  ): Promise<void> {
    const windows = this.limits[kind];
    const dayKey = `budget:v1:${kind}:day:${isoDay(now)}`;
    const dayCount = (await this.store.get(dayKey)) ?? 0;

    if (dayCount >= windows.daily) {
      throw budgetExhausted(secondsUntilUtcMidnight(now));
    }

    const hourly = windows.hourly;
    const hourKey = `budget:v1:${kind}:hour:${isoHour(now)}`;
    const hourCount = hourly
      ? ((await this.store.get(hourKey)) ?? 0)
      : 0;

    if (hourly !== undefined && hourCount >= hourly) {
      throw budgetExhausted(secondsUntilNextHour(now));
    }

    await this.store.put(
      dayKey,
      dayCount + 1,
      secondsUntilUtcMidnight(now) + 3_600,
    );

    if (hourly !== undefined) {
      await this.store.put(hourKey, hourCount + 1, 7_200);
    }
  }
}

export function createBudget(
  env: Env,
  fallbackStore: BudgetStore,
): Budget {
  return new ProviderBudget(
    env.BUDGET ? new KvBudgetStore(env.BUDGET) : fallbackStore,
  );
}

function budgetExhausted(retryAfterSeconds: number): ApiError {
  return new ApiError(
    503,
    'BUDGET_EXHAUSTED',
    'The weather service has reached its usage limit. Please try again later.',
    { retryable: true, retryAfterSeconds },
  );
}

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isoHour(now: Date): string {
  return now.toISOString().slice(0, 13);
}

function secondsUntilUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

function secondsUntilNextHour(now: Date): number {
  const nextHour = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() + 1,
  );

  return Math.max(1, Math.ceil((nextHour - now.getTime()) / 1000));
}
