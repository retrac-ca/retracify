import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SITE_URL } from './shared/config.ts';
import { MemoryCache } from './functions/_lib/cache.ts';
import {
  handleForecast,
  handleHealth,
  handleRadar,
  handleReverse,
  handleSearch,
} from './functions/_lib/handlers.ts';
import { asApiError, errorResponse } from './functions/_lib/errors.ts';
import type { Env } from './functions/_lib/env.ts';

type NextFunction = (error?: unknown) => void;

const ORIGIN = SITE_URL.replace(/\/+$/, '');

function staticMetadataPlugin(): Plugin {
  return {
    name: 'retracify-static-metadata',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', ORIGIN);
    },
    closeBundle() {
      const outDir = 'dist';
      mkdirSync(outDir, { recursive: true });

      const lastmod = new Date().toISOString().slice(0, 10);
      writeFileSync(
        join(outDir, 'robots.txt'),
        [
          'User-agent: *',
          'Allow: /',
          'Disallow: /api/',
          '',
          `Sitemap: ${ORIGIN}/sitemap.xml`,
          '',
        ].join('\n'),
      );
      writeFileSync(
        join(outDir, 'sitemap.xml'),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${ORIGIN}/</loc>`,
          `    <lastmod>${lastmod}</lastmod>`,
          '    <changefreq>hourly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '  <url>',
          `    <loc>${ORIGIN}/privacy</loc>`,
          '    <changefreq>yearly</changefreq>',
          '    <priority>0.3</priority>',
          '  </url>',
          '  <url>',
          `    <loc>${ORIGIN}/terms</loc>`,
          '    <changefreq>yearly</changefreq>',
          '    <priority>0.3</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      );
    },
  };
}

function apiDevPlugin(env: Env): Plugin {
  const cache = new MemoryCache();

  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: NextFunction,
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (
      url.pathname !== '/api/search' &&
      url.pathname !== '/api/forecast' &&
      url.pathname !== '/api/reverse' &&
      url.pathname !== '/api/radar' &&
      url.pathname !== '/api/health'
    ) {
      next();
      return;
    }

    try {
      const webRequest = new Request(url, {
        method: request.method ?? 'GET',
        headers: request.headers as HeadersInit,
      });
      let webResponse: Response;

      switch (url.pathname) {
        case '/api/search':
          webResponse = await handleSearch(webRequest, env, cache);
          break;
        case '/api/forecast':
          webResponse = await handleForecast(webRequest, env, cache);
          break;
        case '/api/reverse':
          webResponse = await handleReverse(webRequest, env, cache);
          break;
        case '/api/radar':
          webResponse = await handleRadar(webRequest, env, cache);
          break;
        default:
          webResponse = handleHealth(webRequest);
          break;
      }

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
    plugins: [react(), staticMetadataPlugin(), apiDevPlugin(env)],
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
