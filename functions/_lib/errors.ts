import type { ApiErrorBody, ApiErrorCode } from '../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { retryable?: boolean; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable =
      options.retryable ?? (status === 429 || status >= 500);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    },
  };

  return jsonResponse(body, error.status, {
    ...(error.retryAfterSeconds !== undefined
      ? { 'retry-after': String(error.retryAfterSeconds) }
      : {}),
  });
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(
    500,
    'INTERNAL',
    'Something went wrong while loading the weather. Please try again.',
    { retryable: true },
  );
}

export function methodNotAllowed(): ApiError {
  return new ApiError(
    405,
    'METHOD_NOT_ALLOWED',
    'Only GET requests are supported.',
    { retryable: false },
  );
}
