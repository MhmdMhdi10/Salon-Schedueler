import { describe, expect, it } from 'vitest';

import { formatClockTime, localDateKey } from '../date-time';

describe('date-time timezone formatting', () => {
  const instant = '2026-10-20T09:00:00.000Z';

  it('formats an availability instant in the salon timezone', () => {
    expect(formatClockTime(instant, 'Asia/Tehran')).toBe('12:30');
    expect(formatClockTime(instant, 'America/Denver')).toBe('03:00');
  });

  it('uses the salon timezone when deriving a calendar date', () => {
    expect(localDateKey('2026-10-20T00:30:00.000Z', 'Asia/Tehran')).toBe('2026-10-20');
    expect(localDateKey('2026-10-20T00:30:00.000Z', 'America/Denver')).toBe('2026-10-19');
  });
});
