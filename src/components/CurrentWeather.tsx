import type { Forecast, Place } from '../../shared/types';
import {
  formatDateTime,
  formatPercent,
  formatTemperature,
  formatTimezone,
  formatWind,
} from '../lib/format';
import { WeatherIcon } from './WeatherIcon';

interface CurrentWeatherProps {
  forecast: Forecast;
  place: Place;
}

export function CurrentWeather({ forecast, place }: CurrentWeatherProps) {
  const current = forecast.current;
  const today = forecast.daily[0];
  const high = current?.highC ?? today?.highC ?? null;
  const low = current?.lowC ?? today?.lowC ?? null;
  const condition = current?.condition ?? {
    key: 'unknown' as const,
    label: 'Current conditions unavailable',
  };
  const updatedEpoch =
    current?.epoch ??
    (Number.isFinite(Date.parse(forecast.fetchedAt))
      ? Math.floor(Date.parse(forecast.fetchedAt) / 1000)
      : null);
  const hasTemperature = current?.temperatureC !== null && current?.temperatureC !== undefined;
  const hasFeelsLike = current?.feelsLikeC !== null && current?.feelsLikeC !== undefined;

  return (
    <section className="card current-card" aria-labelledby="current-heading">
      <div className="current-head">
        <div className="current-copy">
          <p className="eyebrow">Current conditions</p>
          <h2 className="current-title" id="current-heading">
            Now
          </h2>
          <p
            className={
              hasTemperature
                ? 'current-temperature'
                : 'current-temperature is-unavailable'
            }
          >
            {hasTemperature
              ? formatTemperature(current.temperatureC)
              : 'Unavailable'}
          </p>
          <p className="current-condition">
            <WeatherIcon condition={condition.key} size="small" />
            <span>{condition.label}</span>
          </p>
          <p className="current-feels">
            {hasFeelsLike
              ? `Feels like ${formatTemperature(current.feelsLikeC)}`
              : 'Feels-like temperature unavailable'}
          </p>
        </div>
        <div className="current-visual">
          <WeatherIcon condition={condition.key} size="large" />
        </div>
      </div>

      {!current && (
        <p className="inline-notice">
          Current conditions are unavailable for {place.name}. Forecast details
          are shown below.
        </p>
      )}

      <dl className="current-stats">
        <div>
          <dt>Today's high (forecast)</dt>
          <dd>{formatTemperature(high)}</dd>
        </div>
        <div>
          <dt>Today's low (forecast)</dt>
          <dd>{formatTemperature(low)}</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>{formatWind(current?.windKph ?? null)}</dd>
        </div>
        <div>
          <dt>Precip. chance</dt>
          <dd>{formatPercent(current?.precipitationProbability ?? null)}</dd>
        </div>
        <div>
          <dt>{current ? 'Updated' : 'Retrieved'}</dt>
          <dd>
            {updatedEpoch !== null
              ? formatDateTime(updatedEpoch, forecast.timezone)
              : 'Unavailable'}
          </dd>
        </div>
      </dl>

      <p className="local-note">
        Times are local to {place.name} ({formatTimezone(forecast.timezone)}).
        Current conditions and forecast values can differ.
      </p>
    </section>
  );
}
