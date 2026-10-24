import type { Forecast } from '../../shared/types';
import {
  formatHour,
  formatPercent,
  formatTemperatureShort,
  formatWindShort,
} from '../lib/format';
import { WeatherIcon } from './WeatherIcon';

interface HourlyForecastProps {
  forecast: Forecast;
}

export function HourlyForecast({ forecast }: HourlyForecastProps) {
  const { hourly, timezone } = forecast;

  return (
    <section className="forecast-section" aria-labelledby="hourly-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Hourly forecast</p>
          <h2 id="hourly-heading">Next 24 hours</h2>
        </div>
        <p className="section-note">Local time · °C · swipe or scroll</p>
      </div>

      {hourly.length === 0 ? (
        <p className="inline-notice">
          Hourly forecast data is unavailable for this location.
        </p>
      ) : (
        <ul
          className="hourly-list"
          aria-label="Hourly forecast. Scroll horizontally for more hours."
          tabIndex={0}
        >
          {hourly.map((hour) => (
            <li className="hour-card" key={hour.epoch}>
              <time
                className="hour-time"
                dateTime={new Date(hour.epoch * 1000).toISOString()}
              >
                {hour.isNow ? 'Now' : formatHour(hour.epoch, timezone)}
              </time>
              <WeatherIcon condition={hour.condition.key} />
              <span className="hour-condition">{hour.condition.label}</span>
              <span className="hour-temp">
                {formatTemperatureShort(hour.temperatureC)}
              </span>
              <span className="hour-detail">
                <span className="sr-only">Chance of precipitation </span>
                {formatPercent(hour.precipitationProbability)}
              </span>
              <span className="hour-detail">
                <span className="sr-only">Wind </span>
                {formatWindShort(hour.windKph)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
