/**
 * Number of daily forecast periods requested from the provider.
 * Visual Crossing supports up to 15 days; a request of this size still counts
 * as a single forecast record on the free plan. The UI shows the first week by
 * default and reveals the remaining days on demand.
 */
export const FORECAST_DAYS = 14;

/**
 * Public origin used for canonical URLs, Open Graph tags, the sitemap, and
 * robots.txt. Change this one value when a custom domain replaces the
 * `*.pages.dev` hostname.
 */
export const SITE_URL = 'https://retracify.pages.dev';

/**
 * Provider quotas are documented in the README. Budgets below the provider
 * limits leave headroom for concurrent requests and for the fact that
 * Cloudflare KV counters are eventually consistent.
 */
export const DAILY_FORECAST_BUDGET = 700;
export const DAILY_SEARCH_BUDGET = 4_000;
export const HOURLY_SEARCH_BUDGET = 700;
