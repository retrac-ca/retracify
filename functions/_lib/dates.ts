export function getLocalDateRange(
  timezone: string | undefined,
  now: Date,
  days = 5,
): { start: string; end: string } | null {
  if (!timezone || days < 1) {
    return null;
  }

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

    return { start, end: addDays(start, days - 1) };
  } catch {
    return null;
  }
}

function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + offset));
  return value.toISOString().slice(0, 10);
}
