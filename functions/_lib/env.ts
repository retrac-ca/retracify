import { ApiError } from './errors.ts';

export interface Env {
  VISUAL_CROSSING_API_KEY?: string;
  GEONAMES_USERNAME?: string;
}

export const USER_AGENT =
  'retracify/0.1 (+https://github.com/retrac-ca/retracify)';

export function requireEnv(env: Env, key: keyof Env): string {
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
