const VISUAL_CROSSING_BASE =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
const FORECAST_DAYS = 7;

const apiKey = process.env.VISUAL_CROSSING_API_KEY?.trim();
const geonamesUsername = process.env.GEONAMES_USERNAME?.trim();

if (!apiKey || !geonamesUsername) {
  console.error(
    [
      'Missing API credentials.',
      'Create a .env.local file (gitignored) with:',
      '  VISUAL_CROSSING_API_KEY=...',
      '  GEONAMES_USERNAME=...',
      'Then run: npm run verify:api',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  const place = {
    latitude: 47.0461,
    longitude: -67.7418,
    timezone: 'America/Moncton',
    label: 'Grand Falls, New Brunswick, Canada',
  };

  await verifyVisualCrossing(place);
  await verifyGeonames('Grand Falls');
}

async function verifyVisualCrossing(place) {
  const range = getLocalDateRange(place.timezone, new Date(), FORECAST_DAYS);
  const elements = [
    'datetime',
    'datetimeEpoch',
    'tempmax',
    'tempmin',
    'temp',
    'feelslike',
    'conditions',
    'icon',
    'precip',
    'precipprob',
    'windspeed',
    'winddir',
    'humidity',
    'pressure',
  ].join(',');
  const params = new URLSearchParams({
    unitGroup: 'metric',
    include: 'current,days,hours',
    elements,
    lang: 'en',
    contentType: 'json',
    key: apiKey,
  });
  const path = range
    ? `${VISUAL_CROSSING_BASE}/${place.latitude},${place.longitude}/${range.start}/${range.end}`
    : `${VISUAL_CROSSING_BASE}/${place.latitude},${place.longitude}`;

  try {
    const response = await fetch(`${path}?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'retracify-verify/0.1' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error(
        `Visual Crossing: FAILED (HTTP ${response.status}) for ${place.label}`,
      );
      process.exitCode = 1;
      return;
    }

    const data = await response.json();
    const current = data.currentConditions ?? {};
    const days = Array.isArray(data.days) ? data.days : [];
    const hours = days.flatMap((day) =>
      Array.isArray(day.hours) ? day.hours : [],
    );

    console.log(`Visual Crossing: OK for ${place.label}`);
    console.log(`  queryCost: ${data.queryCost ?? 'unknown'}`);
    console.log(`  timezone: ${data.timezone ?? 'unknown'}`);
    console.log(`  current temperature: ${current.temp ?? 'unavailable'} °C`);
    console.log(`  current feels-like: ${current.feelslike ?? 'unavailable'} °C`);
    console.log(
      `  current precipitation probability: ${current.precipprob ?? 'unavailable'}%`,
    );
    console.log(`  daily periods: ${days.length}`);
    console.log(`  hourly periods returned: ${hours.length}`);
    console.log(
      `  today's high/low: ${days[0]?.tempmax ?? 'unavailable'} / ${days[0]?.tempmin ?? 'unavailable'} °C`,
    );
    console.log(
      `  first hourly precipitation probability: ${hours[0]?.precipprob ?? 'unavailable'}%`,
    );
  } catch (error) {
    console.error(
      `Visual Crossing: FAILED for ${place.label} (${error instanceof Error ? error.message : 'unknown error'})`,
    );
    process.exitCode = 1;
  }
}

async function verifyGeonames(query) {
  const params = new URLSearchParams({
    q: query,
    maxRows: '8',
    featureClass: 'P',
    orderby: 'population',
    style: 'MEDIUM',
    lang: 'en',
    username: geonamesUsername,
  });

  try {
    const response = await fetch(
      `https://secure.geonames.org/searchJSON?${params}`,
      {
        headers: { accept: 'application/json', 'user-agent': 'retracify-verify/0.1' },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      console.error(`GeoNames: FAILED (HTTP ${response.status}) for "${query}"`);
      process.exitCode = 1;
      return;
    }

    const data = await response.json();

    if (data.status) {
      console.error(
        `GeoNames: FAILED (${data.status.message ?? 'unknown error'}) for "${query}"`,
      );
      process.exitCode = 1;
      return;
    }

    const places = Array.isArray(data.geonames) ? data.geonames : [];

    console.log(`GeoNames: OK for "${query}"`);
    console.log(`  results: ${places.length}`);

    for (const place of places.slice(0, 3)) {
      const timezone = place.timezone?.timeZoneId ?? 'no timezone';
      console.log(
        `  - ${[place.name, place.adminName1, place.countryName].filter(Boolean).join(', ')} (${timezone})`,
      );
    }
  } catch (error) {
    console.error(
      `GeoNames: FAILED for "${query}" (${error instanceof Error ? error.message : 'unknown error'})`,
    );
    process.exitCode = 1;
  }
}

function getLocalDateRange(timezone, now, days) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      return null;
    }

    const start = `${year}-${month}-${day}`;
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    const endDate = new Date(
      Date.UTC(startYear, startMonth - 1, startDay + days - 1),
    );

    return { start, end: endDate.toISOString().slice(0, 10) };
  } catch {
    return null;
  }
}
