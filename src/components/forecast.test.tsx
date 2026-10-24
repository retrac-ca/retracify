import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Forecast } from '../../shared/types';
import {
  makeVisualCrossingPayload,
  TEST_NOW,
  TEST_PLACE,
} from '../../functions/_lib/__fixtures__/providers.ts';
import { normalizeVisualCrossing } from '../../functions/_lib/providers/visualCrossing.ts';
import { Attribution } from './Attribution';
import { CurrentWeather } from './CurrentWeather';
import { DailyForecast } from './DailyForecast';
import { HourlyForecast } from './HourlyForecast';

function makeForecast(): Forecast {
  return normalizeVisualCrossing(makeVisualCrossingPayload(), TEST_PLACE, {
    now: TEST_NOW,
    fetchedAt: TEST_NOW,
  });
}

describe('forecast components', () => {
  it('render normalized data without a browser DOM', () => {
    const forecast = makeForecast();
    const html = renderToStaticMarkup(
      <>
        <CurrentWeather forecast={forecast} place={TEST_PLACE} />
        <HourlyForecast forecast={forecast} />
        <DailyForecast forecast={forecast} />
        <Attribution
          attribution={forecast.attribution}
          fetchedAt={forecast.fetchedAt}
          timezone={forecast.timezone}
        />
      </>,
    );

    expect(html).toContain('Grand Falls');
    expect(html).toContain('8°C');
    expect(html).toContain('Feels like 6°C');
    expect(html).toContain('Next 24 hours');
    expect(html).toContain('Today');
    expect((html.match(/class="day-row"/g) ?? [])).toHaveLength(7);
    expect(html).toContain('Weather Data Provided by');
    expect(html).toContain('GeoNames');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders a clear fallback when current conditions are missing', () => {
    const forecast = makeForecast();
    const html = renderToStaticMarkup(
      <CurrentWeather
        forecast={{ ...forecast, current: null }}
        place={TEST_PLACE}
      />,
    );

    expect(html).toContain('Current conditions are unavailable');
    expect(html).toContain('Unavailable');
  });
});
