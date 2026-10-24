const FALLBACK = 'Unavailable';

export function formatTemperature(value: number | null): string {
  return value === null ? FALLBACK : `${Math.round(value)}°C`;
}

export function formatTemperatureShort(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°`;
}

export function formatWind(value: number | null): string {
  return value === null ? FALLBACK : `${Math.round(value)} km/h`;
}

export function formatWindShort(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} km/h`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

export function formatPrecipitation(value: number | null): string {
  return value === null ? FALLBACK : `${value.toFixed(1)} mm`;
}

export function formatPopulation(value: number | undefined): string | null {
  if (value === undefined || value <= 0) {
    return null;
  }

  return new Intl.NumberFormat('en-CA', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function toDate(epoch: number): Date | null {
  if (!Number.isFinite(epoch)) {
    return null;
  }

  const date = new Date(epoch * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHour(epoch: number, timezone: string): string {
  const date = toDate(epoch);

  if (!date) {
    return FALLBACK;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      hour: 'numeric',
      hour12: true,
      timeZone: timezone,
    }).format(date);
  } catch {
    return FALLBACK;
  }
}

export function formatTime(epoch: number, timezone: string): string {
  const date = toDate(epoch);

  if (!date) {
    return FALLBACK;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);
  } catch {
    return FALLBACK;
  }
}

export function formatDateTime(epoch: number, timezone: string): string {
  const date = toDate(epoch);

  if (!date) {
    return FALLBACK;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);
  } catch {
    return FALLBACK;
  }
}

export function formatDayLabel(date: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';

  const parsed = new Date(`${date}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

export function formatDayDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

export function formatTimezone(timezone: string): string {
  return timezone;
}

export function formatPlaceMeta(place: {
  admin1?: string;
  country: string;
}): string {
  return [place.admin1, place.country]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');
}
