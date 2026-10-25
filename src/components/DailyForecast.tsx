import { useState } from 'react';
import type {
  DailyForecast as DailyForecastDay,
  Forecast,
} from '../../shared/types';
import { FORECAST_DAYS } from '../../shared/config';
import {
  formatDayDate,
  formatDayLabel,
  formatPercent,
  formatPrecipitation,
  formatTemperatureShort,
} from '../lib/format';
import { WeatherIcon } from './WeatherIcon';

const DEFAULT_VISIBLE_DAYS = 7;

interface DailyForecastProps {
  forecast: Forecast;
  /** Start with the extended week expanded. Useful for deep links and tests. */
  defaultExpanded?: boolean;
}

function DayRow({ day, index }: { day: DailyForecastDay; index: number }) {
  const hasProbability = day.precipitationProbability !== null;
  const precipitation = hasProbability
    ? formatPercent(day.precipitationProbability)
    : formatPrecipitation(day.precipitationMm);

  return (
    <li className="day-row">
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
          {hasProbability ? 'Chance of precipitation ' : 'Precipitation '}
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
}

export function DailyForecast({
  forecast,
  defaultExpanded = false,
}: DailyForecastProps) {
  const { daily } = forecast;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const firstWeek = daily.slice(0, DEFAULT_VISIBLE_DAYS);
  const extended = daily.slice(DEFAULT_VISIBLE_DAYS, FORECAST_DAYS);
  const canExpand = extended.length > 0;
  const visibleDays = expanded ? daily.length : firstWeek.length;

  return (
    <section className="forecast-section" aria-labelledby="daily-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{visibleDays}-day forecast</p>
          <h2 id="daily-heading">The days ahead</h2>
        </div>
        <p className="section-note">High / low · °C</p>
      </div>

      {daily.length === 0 ? (
        <p className="inline-notice">
          Forecast data is unavailable for this location.
        </p>
      ) : (
        <>
          <ul className="daily-list">
            {firstWeek.map((day, index) => (
              <DayRow day={day} index={index} key={day.date} />
            ))}
          </ul>

          {expanded && canExpand && (
            <div className="extended-forecast" id="extended-daily">
              <p className="extended-heading">
                Next week <span>Less certain</span>
              </p>
              <ul
                className="daily-list"
                aria-label="Extended forecast, days 8 to 14"
              >
                {extended.map((day, index) => (
                  <DayRow
                    day={day}
                    index={index + DEFAULT_VISIBLE_DAYS}
                    key={day.date}
                  />
                ))}
              </ul>
            </div>
          )}

          {canExpand && (
            <button
              type="button"
              className="text-button daily-toggle"
              aria-expanded={expanded}
              aria-controls={expanded ? 'extended-daily' : undefined}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? 'Show 7-day forecast'
                : `Show ${FORECAST_DAYS}-day forecast`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
