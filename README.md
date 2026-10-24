# Retracify Weather

A lightweight, mobile-friendly weather website with current conditions, hourly
forecasts, a five-day forecast, and global city/town search.

The project is designed as a **static React frontend** with a small serverless
API layer for provider credential protection, caching, and response
normalization. There is no database, account system, or persistent user data.

## Features

- Current temperature, feels-like temperature, condition, today's high/low,
  wind, and precipitation probability.
- Next 24 hours of weather with temperature, condition, precipitation
  probability, and wind.
- Five-day forecast with daily high/low, condition, and precipitation
  probability.
- Debounced location search with region/country disambiguation and keyboard
  support.
- Starts on Grand Falls, New Brunswick as a demonstration location; any city or
  town can be searched.
- Celsius, km/h, and millimetres by default.
- Location-local dates and times, including daylight-saving transitions.
- Loading, empty, error, rate-limit, timeout, missing-data, and refresh-failure
  states.
- Responsive layout for narrow phones and larger screens.
- No analytics, advertising, cookies, or browser geolocation in this release.

## Stack

- React 19 + TypeScript
- Vite
- Plain responsive CSS
- Cloudflare Pages Functions for `/api/*`
- Vitest and ESLint

Runtime dependencies are limited to `react` and `react-dom`.

## Data providers and terms

### Visual Crossing — weather

- Free plan used for this release, with commercial use permitted.
- Free plan limits: **1,000 records/day** and **one concurrent request**.
- A forecast query of up to 15 days counts as one record, including hourly
  data. This application requests five days and caches repeated requests.
- The API key is **server-side only** in the Pages Function. It is never part of
  the client bundle.
- Attribution: “Weather Data Provided by Visual Crossing” with a link.
- Usage beyond the free limits requires a paid plan. Metered pricing is listed
  by Visual Crossing at `$0.0001/record`, but **no paid plan or billing is
  enabled by this repository**.
- Terms: https://www.visualcrossing.com/weather-service-terms/

### GeoNames — location search

- Free web services, with commercial use allowed under CC BY 4.0.
- Limits: 10,000 credits/day and 1,000/hour per username.
- The username is server-side only.
- Attribution: “Location data from GeoNames” with a link.
- Terms: https://www.geonames.org/export/

Open-Meteo is **not** used in production because its free tier is restricted to
non-commercial use and this site is intended to support advertising eventually.

## Architecture

```
Browser
  └── React + Vite static app
        ├── GET /api/search?q=...
        └── GET /api/forecast?lat=...&lon=...
              └── Cloudflare Pages Functions
                    ├── functions/_lib/geocoders/geonames.ts
                    ├── functions/_lib/providers/visualCrossing.ts
                    ├── validation + normalization
                    └── Cloudflare Cache API
```

The frontend consumes a provider-neutral contract in `shared/types.ts`. Provider
details stay inside the server adapters, so the weather provider can be replaced
without rewriting React components.

### API routes

- `GET /api/search?q=Grand%20Falls`
  - Returns up to eight populated places, deduplicated by GeoNames ID.
- `GET /api/forecast?lat=...&lon=...&timezone=...&name=...`
  - Returns normalized current, hourly, and five-day forecast data.
  - The frontend sends display metadata so the response can be rendered on a
    cache hit; the cache key itself is based on coordinates, timezone, and the
    location-local start date.

### Caching and limits

- Forecasts are cached for **10 minutes** per rounded coordinate/timezone.
- Location searches are cached for **24 hours** per normalized query.
- The forecast adapter retries once on a transient `429`/`5xx` with a short
  backoff and respects `Retry-After` when provided.
- Upstream errors are mapped to user-friendly, typed API errors.
- A location change clears the previous location’s forecast. A failed refresh
  keeps the previous forecast but marks it clearly as stale with a last-updated
  time and retry action.
- No polling or service worker is used.

Cloudflare Pages Functions allow 100,000 free requests/day. Static asset
requests are free. The provider and hosting thresholds are documented in
`README` so upgrades are intentional.

## Local development

Requirements: Node.js 22 or newer and npm.

```bash
npm install
cp .env.example .env.local
```

Create free accounts and fill in `.env.local`:

```
VISUAL_CROSSING_API_KEY=your-key
GEONAMES_USERNAME=your-username
```

- Visual Crossing signup: https://www.visualcrossing.com/sign-up/
- GeoNames account: https://www.geonames.org/login
  Enable the free web services for the account.

**Do not commit `.env.local` and do not paste credentials into issue trackers or
chat.** The file is gitignored; `.env.example` contains placeholders only.

Start the app:

```bash
npm run dev
```

The Vite dev server invokes the same server handlers used by Cloudflare Pages.
The app is available at `http://localhost:5173`.

Build and preview the production assets with the same API middleware:

```bash
npm run build
npm run preview
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite development server with local API middleware |
| `npm run build` | Typecheck and build static assets into `dist/` |
| `npm run preview` | Preview the production build with local API middleware |
| `npm run typecheck` | Check app, Functions, and Vite configuration types |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit and handler tests |
| `npm run check` | Typecheck, lint, and test |
| `npm run verify:api` | Live provider check using `.env.local`; prints no credentials |

The live verification script checks real Visual Crossing and GeoNames responses
for Grand Falls. It is skipped with instructions when `.env.local` is absent. The
automated test suite uses provider fixtures and does not call live services.

## Deployment — Cloudflare Pages

This repository does not deploy automatically. Use the following approved
Cloudflare Pages process:

1. Push the repository to GitHub (after review and approval).
2. In Cloudflare Pages, create a project connected to the repository.
3. Use:
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Node version: 22 or newer
4. Add encrypted environment variables in the Pages project:
   - `VISUAL_CROSSING_API_KEY`
   - `GEONAMES_USERNAME`
5. Deploy. Cloudflare serves the static assets and automatically deploys the
   `functions/` directory as Pages Functions.

No backend, database, or API key in client-side code is required. HTTPS is
provided by Cloudflare. The `public/_headers` file adds a restrictive CSP and
security headers to static responses. If advertising or third-party scripts are
added later, the CSP and consent requirements will need to be revisited.

### Custom domain

A custom domain is optional. The free `*.pages.dev` hostname works for an initial
release. Adding a domain is a registrar/hosting decision outside this
repository.

## Security and privacy

- Provider credentials are read from `env` inside the Function only.
- Environment variables are not prefixed with `VITE_`, so Vite does not expose
  them to client code.
- API routes are same-origin; no permissive CORS header is set.
- Query lengths, coordinates, and timezones are validated server-side.
- Error responses do not include upstream URLs, API keys, or stack traces.
- User IP addresses are not sent directly to Visual Crossing or GeoNames; the
  Function makes the upstream request.
- No analytics, ad scripts, cookies, local storage, or browser geolocation are
  used in this release.
- The footer includes a weather-data disclaimer. The data is not intended as the
  sole basis for safety-critical decisions; consult official meteorological
  services for warnings.

## Provider abstraction

To switch providers:

1. Add an adapter under `functions/_lib/providers/` or
   `functions/_lib/geocoders/` that returns the shared types.
2. Update the adapter used by `functions/_lib/handlers.ts`.
3. Keep the API response shape in `shared/types.ts` stable.
4. Update attribution in the returned `Forecast` object and the README.
5. Re-run `npm run check` and the live verification.

The current contract already supports optional precipitation probability and
precipitation amount, so a provider without probability can render precipitation
amount instead without changing components.

## Known limitations

- Visual Crossing Free permits only one concurrent upstream request; sustained
  bursts can return `429` and display the rate-limit state.
- The free plan has a 1,000-record daily ceiling.
- GeoNames limits automated searches to 10,000 credits/day per username.
- Responsive and keyboard checks were run with Playwright at 320, 768, and
  1440 px, including axe-core WCAG 2.1 A/AA scans. Browser tooling is not part of
  the committed dependency set; repeat the checks before major UI changes.
- No service worker, offline mode, saved locations, geolocation, advertising, or
  Fahrenheit toggle is included in the first release.
- The five-day window follows the selected location’s local date, not the
  visitor’s device timezone.

## License

The application source is licensed under AGPL-3.0. Weather data remains subject
to the provider terms and attributions described above.
