import type { Forecast } from '../../shared/types';
import {
  formatDayDate,
  formatDayLabel,
  formatPercent,
  formatPrecipitation,
  formatTemperatureShort,
} from '../lib/format';
import { WeatherIcon } from './WeatherIcon';

interface DailyForecastProps {
  forecast: Forecast;
}

export function DailyForecast({ forecast }: DailyForecastProps) {
  const { daily } = forecast;

  return (
    <section className="forecast-section" aria-labelledby="daily-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Five-day forecast</p>
          <h2 id="daily-heading">The days ahead</h2>
        </div>
        <p className="section-note">High / low · °C</p>
      </div>

      {daily.length === 0 ? (
        <p className="inline-notice">
          Five-day forecast data is unavailable for this location.
        </p>
      ) : (
        <ul className="daily-list">
          {daily.map((day, index) => {
            const hasProbability = day.precipitationProbability !== null;
            const precipitation = hasProbability
              ? formatPercent(day.precipitationProbability)
              : formatPrecipitation(day.precipitationMm);

            return (
              <li className="day-row" key={day.date}>
                <div className="day-date">
                  <time dateTime={day.date}>{formatDayLabel(day.date, index)}</time>
                  <span>{formatDayDate(day.date)}</span>
                </div>

                <div className="day-condition">
                  <WeatherIcon condition={day.condition.key} size="small" />
                  <span>{day.condition.label}</span>
                </div>

                <div className="day-precip">
                  <span className="sr-only">
                    {hasProbability
                      ? 'Chance of precipitation '
                      : 'Precipitation '}
                  </span>
                  {precipitation}
                </div>

                <div
                  className="day-temps"
                  aria-label={`High ${formatTemperatureShort(day.highC)}, low ${formatTemperatureShort(day.lowC)}`}
                >
                  <span>
                    <span className="sr-only">High </span>
                    {formatTemperatureShort(day.highC)}
                  </span>
                  <span className="low">
                    <span className="sr-only">Low </span>
                    {formatTemperatureShort(day.lowC)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
