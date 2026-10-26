# Retracify Weather

A lightweight, mobile-friendly weather website with current conditions, hourly
forecasts, a seven-day forecast that expands to 14 days, and global city/town
search.

The project is designed as a **static React frontend** with a small serverless
API layer for provider credential protection, caching, and response
normalization. There is no database or account system. The only value saved in
the browser is the day/night theme preference.

## Features

- Current temperature, feels-like temperature, condition, today's high/low,
  wind, and precipitation probability.
- Next 24 hours of weather with temperature, condition, precipitation
  probability, and wind.
- Seven-day forecast with daily high/low, condition, and precipitation
  probability. A **Show 14-day forecast** toggle reveals the extended week,
  which is labeled as less certain.
- Debounced location search with region/country disambiguation and keyboard
  support.
- Opt-in **Use my location** button that resolves coordinates to the nearest
  city or town. The browser prompt appears only after the visitor chooses it.
- Starts on Grand Falls, New Brunswick as a demonstration location; any city or
  town can be searched.
- Celsius, km/h, and millimetres by default.
- Location-local dates and times, including daylight-saving transitions.
- Loading, empty, error, rate-limit, timeout, missing-data, and refresh-failure
  states. When the provider is unavailable, a recently cached forecast is
  served and clearly marked as out of date.
- Day and night themes that follow your device setting by default, with a
  header toggle. An explicit choice is remembered on your device.
- Responsive layout for narrow phones and larger screens.
- No analytics, advertising, or cookies. The only browser storage is the
  day/night theme preference. Browser geolocation is requested only after an
  explicit user action and is not stored.

## Stack

- React 19 + TypeScript
- Vite
- Plain responsive CSS
- Cloudflare Pages Functions for `/api/*`
- Vitest and ESLint

Runtime dependencies are `react` and `react-dom`. The beta radar also uses
`leaflet`, loaded lazily and only when the radar demo is opened.

## Data providers and terms

### Visual Crossing — weather

- Free plan used for this release, with commercial use permitted.
- Forecast limits: **1,000 records/day** and **one concurrent request** for the
  timeline API.
- Weather Maps limits are separate: **10,000 map requests/month** on the free
  plan. The beta radar uses this allowance, capped at 250 images/day by the app.
  The Maps API accepted six parallel image requests in testing, unlike the
  timeline API.
- A forecast query of up to 15 days counts as one record, including hourly
  data. This application requests 14 days and caches repeated requests, so the
  extended view does not consume extra provider records.
- The API key is **server-side only** in the Pages Function. It is never part of
  the client bundle, including radar images, which are proxied through
  `/api/radar`.
- Attribution: “Weather Data Provided by Visual Crossing” with a link.
- Usage beyond the free limits requires a paid plan. Metered pricing is listed
  by Visual Crossing at `$0.0001/record`, but **no paid plan or billing is
  enabled by this repository**.
- Terms: https://www.visualcrossing.com/weather-service-terms/

### GeoNames — location search

- Free web services, with commercial use allowed under CC BY 4.0.
- Limits: 10,000 credits/day and 1,000/hour per username.
- The username is server-side only.
- Forecast requests resolve the selected place by ID, which costs one cached
  GeoNames credit per unique place. Searches, place lookups, and reverse lookups
  all share the budget described below.
- Attribution: “Location data from GeoNames” with a link.
- Terms: https://www.geonames.org/export/

### OpenStreetMap — beta radar basemap

- Only the beta radar card uses OpenStreetMap raster tiles. The app's normal
  forecast pages make no OpenStreetMap requests.
- The browser loads tiles directly from `https://tile.openstreetmap.org`, so the
  CSP allows that origin plus `blob:` for the radar overlay images.
- Attribution: “© OpenStreetMap contributors” with a link, shown on the radar
  card.
- The privacy policy discloses the direct tile requests and the standard request
  information OpenStreetMap receives.
- OSM tile servers are intended for low-volume use. A busier ad-supported site
  should use a dedicated basemap provider.
- Terms and policy: https://operations.osmfoundation.org/policies/tiles/

Open-Meteo is **not** used in production because its free tier is restricted to
non-commercial use and this site is intended to support advertising eventually.

## Architecture

```
Browser
  └── React + Vite static app
        ├── GET /api/search?q=...
        ├── GET /api/forecast?placeId=...
        ├── GET /api/reverse?lat=...&lon=...
        ├── GET /api/radar?placeId=...&mode=6h&offset=0
        └── GET /api/health
              └── Cloudflare Pages Functions
                    ├── functions/_lib/geocoders/geonames.ts
                    ├── functions/_lib/providers/visualCrossing.ts
                    ├── functions/_lib/providers/visualCrossingMap.ts
                    ├── validation + normalization
                    ├── per-IP rate limits + daily provider budget
                    └── Cloudflare Cache API
```

The frontend consumes a provider-neutral contract in `shared/types.ts`. Provider
details stay inside the server adapters, so the weather provider can be replaced
without rewriting React components. The beta radar card additionally loads
OpenStreetMap raster tiles directly in the browser.

### API routes

- `GET /api/search?q=Grand%20Falls`
  - Returns up to eight populated places, deduplicated by GeoNames ID.
- `GET /api/forecast?placeId=6621033`
  - Resolves the place ID through GeoNames, then returns normalized current,
    hourly, and 14-day forecast data. The UI shows the first week by default and
    reveals the remaining days on demand.
  - The API accepts only numeric GeoNames IDs. Coordinates are not accepted, so
    arbitrary coordinate pairs cannot bypass the cache and consume provider
    records.
  - `place` metadata in the response is server-resolved, which keeps the cached
    forecast body identical for every visitor of the same place.
- `GET /api/reverse?lat=47.0461&lon=-67.7418`
  - Resolves coordinates from the opt-in location button to the nearest
    populated place. Returns `404` when no nearby place is found.
- `GET /api/radar?placeId=6621033&mode=6h&offset=0`
  - Beta radar proxy. Validates the timeframe and frame offset, resolves the
    place server-side, fetches the corresponding precipitation-composite image
    from Visual Crossing, and returns it with Web Mercator bounds and its frame
    time.
  - The API key never reaches the browser. The response is cached at the edge;
    past frames are retained for 24 hours and future frames for 1 hour.
  - The browser only requests this same-origin route. OpenStreetMap tiles for
    the basemap are the one direct third-party image request on the site.
- `GET /api/health`
  - Returns `{"status":"ok"}` without calling any upstream provider. Intended
    for uptime monitoring.

### Caching and limits

- Forecasts are cached for **10 minutes** per place ID and location-local start
  date.
- Place records are cached for **7 days**; location searches for **24 hours**;
  reverse-geocoded places for **24 hours**.
- Concurrent cache misses for the same key share one upstream call, and
  forecast requests are serialized per Worker isolate because the timeline API
  permits one concurrent request. Radar image requests are not serialized; the
  Maps API accepted six parallel requests in testing, and the browser preloads
  six frames at a time.
- Radar images are cached per place, zoom, size, and frame time: **24 hours**
  for past frames and **1 hour** for future frames.
- When a refresh fails, an expired but retained forecast is served for up to one
  day and marked `stale: true`; search and place data can be served stale for up
  to seven days.
- The forecast adapter retries once on a transient `429`/`5xx` with a short
  backoff and respects `Retry-After` when provided.
- Upstream errors are mapped to user-friendly, typed API errors.
- A location change clears the previous location’s forecast. A failed refresh
  keeps the previous forecast but marks it clearly as stale with a last-updated
  time and retry action.
- No polling or service worker is used.

### Abuse protection

The public API is unauthenticated, so the server limits both bursts and total
provider usage:

| Route | Per-IP burst limit |
| --- | --- |
| `/api/search` | 20 requests/minute |
| `/api/forecast` | 30 requests/minute |
| `/api/reverse` | 20 requests/minute |
| `/api/radar` | 120 requests/minute |

Provider usage is capped below the free-plan ceilings:

| Budget | Limit |
| --- | --- |
| Visual Crossing forecast records | 700/day |
| Visual Crossing radar/map images | 250/day and 80/hour |
| GeoNames search and place records | 4,000/day and 700/hour |

Per-IP limits live in Worker memory and reset with each isolate. Provider
budgets use a KV namespace binding named `BUDGET` when one is configured; without
that binding they fall back to in-memory counters that are **not shared between
isolates**. Add the binding in the Cloudflare Pages project settings for
production use.

When a budget is exhausted, the API serves a stale cached value if one exists or
returns `503 BUDGET_EXHAUSTED` with a `Retry-After` header. A determined attacker
rotating IPs and place IDs can still exhaust a day's free quota; the budget is a
safety valve, not an authentication mechanism. A custom domain with Cloudflare
rate-limiting rules, Turnstile on search, or a paid provider plan are the
follow-up options.

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
The app is available at `http://localhost:5173`. Provider budgets use
in-memory counters locally; the production KV binding is not required for
development.

### Radar beta

The deployed site can render the experimental precipitation radar card at
`/?radar=demo`, below the 7/14-day forecast. Add `&autoplay=1` to start the
loop automatically. The card is not linked from the normal page while it is in
beta.

The card is marked **Beta** because the first load of a loop can take a few
seconds; frames are cached after that. The beta uses Visual Crossing map images
through `/api/radar`, keeps the API key server-side, and caps map usage at 250
images per day (80 per hour). Past frames are cached for 24 hours and future
frames for 1 hour.

Map tiles are loaded directly from `https://tile.openstreetmap.org` in the
browser. The CSP allows that origin plus `blob:` for the radar overlay images,
and the privacy policy discloses the direct tile request. OSM tile servers are
for low-volume use; a busier deployment should use a dedicated basemap provider.

To remove the beta, remove the `?radar=demo` flag, `RadarMap` component,
`/api/radar` route, Leaflet dependency, OSM CSP allowance, and the associated
privacy and terms text.

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
for Grand Falls, including the place lookup used by the forecast route. It is
skipped with instructions when `.env.local` is absent. The automated test suite
uses provider fixtures and does not call live services.

Continuous integration runs `npm run check` and `npm run build` for pushes to
`main` and for pull requests (`.github/workflows/ci.yml`). Dependabot checks npm
and GitHub Actions dependencies weekly.

## Deployment — Cloudflare Pages

Production is a **Direct Upload** Pages project named `retracify`, served at
`https://retracify.pages.dev`. It is not connected to Git; deployments are made
with Wrangler after CI passes.

1. Install dependencies and build:
   ```bash
   npm ci
   npm run build
   ```
2. Confirm `wrangler.toml` matches the project:
   - `name = "retracify"`
   - `pages_build_output_dir = "./dist"`
   - `[[kv_namespaces]]` binds `BUDGET` to the shared KV namespace
3. Set the encrypted secrets once per environment. Production already has them;
   the Preview environment needs them separately if you use preview deployments:
   ```bash
   npx wrangler pages secret put VISUAL_CROSSING_API_KEY --project-name retracify
   npx wrangler pages secret put GEONAMES_USERNAME --project-name retracify
   ```
4. Deploy:
   ```bash
   npx wrangler pages deploy dist --project-name retracify --branch main
   ```
5. Smoke-test the production URL: `/api/health`,
   `/api/forecast?placeId=6621033`, `/api/search?q=Grand%20Falls`,
   `/api/reverse`, plus the privacy, terms, robots, sitemap, manifest, and icon
   files.
6. If a deployment regresses, use the Pages dashboard → Deployments → Rollback.

`wrangler.toml` is the source of truth for Pages bindings once used. The `BUDGET`
namespace must exist in the Cloudflare account; create it once with
`npx wrangler kv namespace create retracify-budget` and keep its ID in the file.
Secrets are managed separately with `wrangler pages secret` and are not stored in
the repository.

No backend, database, or API key in client-side code is required. HTTPS is
provided by Cloudflare. The `public/_headers` file adds a restrictive CSP and
security headers to static responses. If advertising or third-party scripts are
added later, the CSP and consent requirements will need to be revisited.

### Monitoring and release checklist

- Point an external uptime monitor at `/api/health` on a five-minute interval.
  The endpoint does not call any provider.
- Watch the Visual Crossing and GeoNames usage dashboards. The budgets above
  keep normal traffic below the free ceilings, but a provider outage can still
  consume budget because reservations happen before each request.
- Before tagging a release:
  - `npm run check` and `npm run build` pass.
  - `npm run verify:api` passes with the release credentials.
  - `VISUAL_CROSSING_API_KEY` and `GEONAMES_USERNAME` are set as Pages secrets,
    and `wrangler.toml` contains the `BUDGET` KV binding.
  - `/api/health` is monitored and the privacy and terms pages are reachable.
  - `SITE_URL` in `shared/config.ts` matches the deployed origin.

### Custom domain

A custom domain is optional. The free `*.pages.dev` hostname works for an initial
release. Adding a domain is a registrar/hosting decision outside this
repository.

## Security and privacy

- Provider credentials are read from `env` inside the Function only.
- Environment variables are not prefixed with `VITE_`, so Vite does not expose
  them to client code.
- API routes are same-origin; no permissive CORS header is set.
- Place IDs, query lengths, and coordinates are validated server-side. Place
  metadata and timezones are resolved from GeoNames rather than trusted from the
  request.
- Client IP addresses are used in memory for short-lived rate limiting. They are
  not written to KV, included in API responses, or sent directly to Visual
  Crossing or GeoNames; the Function makes those upstream requests. The one
  exception is the beta radar's OpenStreetMap basemap, which the browser loads
  directly from `tile.openstreetmap.org`.
- The beta radar's own image requests are proxied through `/api/radar`; the
  Visual Crossing key never reaches the browser. The CSP allows the OpenStreetMap
  tile origin plus `blob:` for those radar overlay images.
- Error responses do not include upstream URLs, API keys, or stack traces.
- Browser geolocation is permitted only for this origin
  (`geolocation=(self)`), and the browser prompt appears only after the visitor
  presses **Use my location**. Coordinates are not linked to an IP address or
  stored in a user profile.
- No analytics, ad scripts, cookies, or tracking storage are used. The only
  local storage value is the day/night theme preference, which never leaves the
  browser.
- `public/privacy.html` and `public/terms.html` describe data flows, retention,
  and the general-information limitation. The footer links to both, and includes
  a weather-data disclaimer. The data is not intended as the sole basis for
  safety-critical decisions; consult official meteorological services for
  warnings.

## Provider abstraction

To switch providers:

1. Add an adapter under `functions/_lib/providers/` or
   `functions/_lib/geocoders/` that returns the shared types.
2. Update the adapter used by `functions/_lib/handlers.ts`.
3. Keep the API response shape in `shared/types.ts` stable.
4. Update attribution in the returned `Forecast` object and the README.
5. Re-run `npm run check` and the live verification.

The forecast route resolves a GeoNames place ID before calling the weather
provider, so a replacement geocoder must support search, place-by-ID, and
nearby-place lookup. The weather adapter receives a server-resolved `Place`
(latitude, longitude, timezone) and never request-supplied display metadata.

The current contract already supports optional precipitation probability and
precipitation amount, so a provider without probability can render precipitation
amount instead without changing components.

## Known limitations

- Visual Crossing Free permits one concurrent request for the timeline
  (forecast) API. Forecast calls are serialized within a Worker isolate and
  retried once, but separate isolates can still overlap and return 429. The
  Maps API accepted six parallel image requests in testing.
- The radar is a hidden beta (`?radar=demo`), not linked from the main page. Its
  first loop load can take a few seconds, map usage is capped at 250 images/day,
  and its OpenStreetMap basemap is only suitable for low traffic.
- The free plan has a 1,000-record daily ceiling, which is why the app stops at
  700 records/day and may serve stale data instead.
- GeoNames limits automated requests to 1,000/hour and 10,000/day per username.
- `*.pages.dev` does not allow configurable WAF or rate-limiting rules. The
  in-Function limits are best-effort; a custom domain with Cloudflare rules is
  the planned follow-up.
- Without a `BUDGET` KV binding, provider budgets reset with each Worker isolate
  and are not globally enforced.
- Rate limiting uses client IP addresses, so visitors behind a shared NAT or
  corporate proxy share a limit.
- Reverse geocoding returns the nearest populated place. Very remote or ocean
  locations may show "no nearby place" and require a manual search.
- Responsive and keyboard checks were run with Playwright at 320, 768, and
  1440 px, including axe-core WCAG 2.1 A/AA scans. Browser tooling is not part of
  the committed dependency set; repeat the checks before major UI changes.
- No service worker, offline mode, saved locations, advertising, or Fahrenheit
  toggle is included in the first release.
- The 14-day window follows the selected location’s local date, not the
  visitor’s device timezone.
- Forecast accuracy generally decreases beyond seven days. Extended days are
  clearly labeled and should be treated as guidance rather than certainty.

## License

The application source is licensed under AGPL-3.0. Weather data remains subject
to the provider terms and attributions described above.
