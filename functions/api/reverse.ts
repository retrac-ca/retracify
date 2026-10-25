import { handleReverse } from '../_lib/handlers.ts';
import { getDefaultCache } from '../_lib/cache.ts';
import type { Env } from '../_lib/env.ts';

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequest(context: PagesContext): Promise<Response> {
  return handleReverse(context.request, context.env, getDefaultCache());
}
