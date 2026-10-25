import { useCallback, useEffect, useState } from 'react';
import type { Place } from '../shared/types';
import { Attribution } from './components/Attribution';
import { CurrentWeather } from './components/CurrentWeather';
import { DailyForecast } from './components/DailyForecast';
import { HourlyForecast } from './components/HourlyForecast';
import { SearchBox } from './components/SearchBox';
import { StatusPanel } from './components/StatusPanel';
import { useForecast } from './hooks/useForecast';
import { useGeolocation } from './hooks/useGeolocation';
import { useLocationSearch } from './hooks/useLocationSearch';
import { formatDateTime, formatTimezone } from './lib/format';

const DEFAULT_PLACE: Place = {
  id: '6621033',
  name: 'Grand Falls',
  admin1: 'New Brunswick',
  country: 'Canada',
  countryCode: 'CA',
  latitude: 47.0461,
  longitude: -67.7418,
  population: 5220,
  timezone: 'America/Moncton',
};

export default function App() {
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [query, setQuery] = useState('');
  const search = useLocationSearch(query);
  const { forecast, status, error, isStale, staleFromServer, refresh } =
    useForecast(place);

  const selectPlace = useCallback((nextPlace: Place) => {
    setPlace(nextPlace);
    setQuery('');
  }, []);

  const geolocation = useGeolocation(selectPlace);
  const resetGeolocation = geolocation.reset;

  useEffect(() => {
    document.title = `${place.name} Weather | Retracify`;
  }, [place.name]);

  useEffect(() => {
    // Clear a previous location error when a different place is selected.
    resetGeolocation();
  }, [place, resetGeolocation]);

  const liveMessage =
    status === 'loading'
      ? ''
      : status === 'error'
        ? `Weather could not be loaded for ${place.name}.`
        : isStale || staleFromServer
          ? `Showing an older forecast for ${place.name}.`
          : `Weather updated for ${place.name}.`;

  const locationMeta = [
    [place.admin1, place.country].filter(Boolean).join(', '),
    formatTimezone(forecast?.timezone ?? place.timezone ?? ''),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to weather
      </a>

      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" focusable="false">
                <circle cx="13" cy="12" r="5.5" fill="#ffd166" />
                <path
                  d="M9 23a6 6 0 0 1 6-6 7 7 0 0 1 13 3 4.5 4.5 0 0 1-1 8H13a5 5 0 0 1-4-5Z"
                  fill="currentColor"
                  opacity="0.95"
                />
              </svg>
            </span>
            <span className="brand-text">
              Retracify <span className="brand-sub">Weather</span>
            </span>
          </div>

          <SearchBox
            query={query}
            onQueryChange={setQuery}
            results={search.results}
            status={search.status}
            error={search.error}
            onSelect={selectPlace}
            onRetry={search.retry}
          />
        </div>
      </header>

      <main className="page" id="main-content">
        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>

        <section className="location-heading" aria-labelledby="location-title">
          <p className="eyebrow">Local weather</p>
          <h1 id="location-title">{place.name}</h1>
          <p className="location-meta">{locationMeta}</p>
          <p className="location-search-note">
            Search above to check another city or town.
          </p>
          <div className="location-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={geolocation.request}
              disabled={geolocation.status === 'locating'}
              aria-busy={geolocation.status === 'locating'}
            >
              {geolocation.status === 'locating'
                ? 'Finding your location…'
                : 'Use my location'}
            </button>
            <p className="location-note">
              Your browser asks for permission first. Coordinates are used only
              to find the nearest town or city.
            </p>
          </div>
          {geolocation.error && (
            <p className="inline-notice" role="status">
              {geolocation.error}
            </p>
          )}
        </section>

        {forecast && (isStale || staleFromServer) && (
          <div className="notice notice--warning" role="alert">
            <div>
              <p className="notice-title">
                {isStale
                  ? "Couldn't refresh the forecast"
                  : 'Showing an older forecast'}
              </p>
              <p>
                {isStale
                  ? `${
                      error?.message ?? 'The refresh failed.'
                    } Showing data retrieved at ${formatDateTime(
                      Math.floor(Date.parse(forecast.fetchedAt) / 1000),
                      forecast.timezone,
                    )} local time. It may be out of date.`
                  : 'The weather service is temporarily unavailable. This forecast may be out of date.'}
              </p>
            </div>
            <button type="button" className="text-button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}

        {status === 'loading' && !forecast && <StatusPanel variant="loading" />}

        {status === 'error' && !forecast && (
          <StatusPanel
            variant="error"
            title="Weather unavailable"
            message={
              error?.message ??
              'Could not load the forecast. Check your connection and try again.'
            }
            onRetry={refresh}
          />
        )}

        {forecast && (
          <>
            {status === 'loading' && (
              <p className="refreshing" role="status">
                Updating forecast…
              </p>
            )}

            <CurrentWeather forecast={forecast} place={place} />
            <HourlyForecast forecast={forecast} />
            <DailyForecast forecast={forecast} />
            <Attribution
              attribution={forecast.attribution}
              fetchedAt={forecast.fetchedAt}
              timezone={forecast.timezone}
            />
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <p>
            Retracify Weather is free to use and does not require an account.
          </p>
          <p>
            This release does not use analytics, advertising, or cookies. Read
            the <a href="/privacy">privacy policy</a> and{' '}
            <a href="/terms">terms of use</a>.
          </p>
          <p>
            Weather data is provided for general information only. It may be
            delayed, incomplete, or inaccurate and should not be used as the
            sole basis for safety-critical decisions. Always consult official
            meteorological services for warnings and emergencies.
          </p>
          <p>
            <a
              href="https://github.com/retrac-ca/retracify"
              rel="noreferrer"
            >
              Source code on GitHub
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
