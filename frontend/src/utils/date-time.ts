export type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateOnly(value: Date | string | number): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function localParts(date: Date): DateTimeParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/** Read an instant as wall-clock fields in the requested IANA timezone. */
export function dateTimeParts(
  value: Date | string | number,
  timeZone?: string,
): DateTimeParts | null {
  const date = toDate(value);
  if (!date) return null;

  // Date-only values represent calendar dates, not UTC instants. Preserve the
  // supplied date so a timezone conversion cannot move it to the prior day.
  if (isDateOnly(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day, hour: 0, minute: 0 };
  }

  if (!timeZone) return localParts(date);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const result = {
      year: valueFor('year'),
      month: valueFor('month'),
      day: valueFor('day'),
      hour: valueFor('hour'),
      minute: valueFor('minute'),
    };
    return Object.values(result).every(Number.isFinite) ? result : localParts(date);
  } catch {
    // A malformed legacy timezone must not hide or break an appointment.
    return localParts(date);
  }
}

export function formatClockTime(value: Date | string | number, timeZone?: string): string | null {
  const parts = dateTimeParts(value, timeZone);
  return parts
    ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
    : null;
}

export function localDateKey(value: Date | string | number, timeZone?: string): string | null {
  const parts = dateTimeParts(value, timeZone);
  return parts
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    : null;
}

/** Construct a display-only Gregorian date from timezone wall-clock fields. */
export function dateForDisplay(value: Date | string | number, timeZone?: string): Date | null {
  const parts = dateTimeParts(value, timeZone);
  return parts ? new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) : null;
}
