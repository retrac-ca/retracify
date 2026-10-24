import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryCache } from './functions/_lib/cache.ts';
import { handleForecast, handleSearch } from './functions/_lib/handlers.ts';
import { asApiError, errorResponse } from './functions/_lib/errors.ts';
import type { Env } from './functions/_lib/env.ts';

type NextFunction = (error?: unknown) => void;

function apiDevPlugin(env: Env): Plugin {
  const cache = new MemoryCache();

  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: NextFunction,
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname !== '/api/search' && url.pathname !== '/api/forecast') {
      next();
      return;
    }

    try {
      const webRequest = new Request(url, {
        method: request.method ?? 'GET',
        headers: request.headers as HeadersInit,
      });
      const handler =
        url.pathname === '/api/search' ? handleSearch : handleForecast;
      const webResponse = await handler(webRequest, env, cache);

      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-length') {
          response.setHeader(key, value);
        }
      });
      response.end(Buffer.from(await webResponse.arrayBuffer()));
    } catch (error) {
      const apiError = asApiError(error);
      const webResponse = errorResponse(apiError);

      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, key) => {
        response.setHeader(key, value);
      });
      response.end(Buffer.from(await webResponse.arrayBuffer()));
    }
  };

  return {
    name: 'retracify-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '');
  const env: Env = {
    VISUAL_CROSSING_API_KEY: loaded.VISUAL_CROSSING_API_KEY,
    GEONAMES_USERNAME: loaded.GEONAMES_USERNAME,
  };

  return {
    plugins: [react(), apiDevPlugin(env)],
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
