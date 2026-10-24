import type { Attribution as AttributionData } from '../../shared/types';
import { formatDateTime } from '../lib/format';

interface AttributionProps {
  attribution: AttributionData;
  fetchedAt: string;
  timezone: string;
}

export function Attribution({
  attribution,
  fetchedAt,
  timezone,
}: AttributionProps) {
  const fetchedEpoch = Math.floor(Date.parse(fetchedAt) / 1000);
  const retrieved = Number.isFinite(fetchedEpoch)
    ? formatDateTime(fetchedEpoch, timezone)
    : null;

  return (
    <section className="attribution" aria-label="Weather data attribution">
      <p>
        Weather Data Provided by{' '}
        <a href={attribution.url} rel="noreferrer">
          {attribution.name}
        </a>
        {attribution.licenseUrl && attribution.licenseName ? (
          <>
            {' '}
            ·{' '}
            <a href={attribution.licenseUrl} rel="noreferrer">
              {attribution.licenseName}
            </a>
          </>
        ) : null}
      </p>
      <p>
        Location data from{' '}
        <a href="https://www.geonames.org/" rel="noreferrer">
          GeoNames
        </a>{' '}
        (
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
        ).
      </p>
      {retrieved && (
        <p className="attribution-time">
          Forecast retrieved at {retrieved} local time.
        </p>
      )}
    </section>
  );
}
