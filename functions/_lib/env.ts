import { ApiError } from './errors.ts';

/**
 * The subset of the Cloudflare KV binding this application uses. Declared
 * locally so the repository does not depend on the Workers type package.
 */
export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export interface Env {
  VISUAL_CROSSING_API_KEY?: string;
  GEONAMES_USERNAME?: string;
  /** Optional KV binding used for daily and hourly provider budgets. */
  BUDGET?: KvNamespace;
}

export const USER_AGENT =
  'retracify/0.1 (+https://github.com/retrac-ca/retracify)';

export type StringEnvKey = 'VISUAL_CROSSING_API_KEY' | 'GEONAMES_USERNAME';

export function requireEnv(env: Env, key: StringEnvKey): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new ApiError(
      503,
      'CONFIGURATION',
      'The weather service is not configured yet. Please try again later.',
      { retryable: false },
    );
  }

  return value;
}
