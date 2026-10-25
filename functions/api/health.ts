import { handleHealth } from '../_lib/handlers.ts';

interface PagesContext {
  request: Request;
}

export function onRequest(context: PagesContext): Response {
  return handleHealth(context.request);
}
