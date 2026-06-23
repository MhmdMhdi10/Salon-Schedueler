import {
  computeOccupancyEnd,
  intervalsOverlap,
  generateCandidateStarts,
  isWithinWindow,
  occupancyMinutes,
} from './index';

describe('Time-slot and interval helpers', () => {
  describe('computeOccupancyEnd', () => {
    it('adds duration + buffer to start time', () => {
      const start = new Date('2024-03-01T09:00:00Z');
      const end = computeOccupancyEnd(start, 60, 15);
      expect(end).toEqual(new Date('2024-03-01T10:15:00Z'));
    });

    it('returns start when duration and buffer are zero', () => {
      const start = new Date('2024-03-01T09:00:00Z');
      const end = computeOccupancyEnd(start, 0, 0);
      expect(end).toEqual(start);
    });

    it('handles zero buffer', () => {
      const start = new Date('2024-03-01T14:00:00Z');
      const end = computeOccupancyEnd(start, 30, 0);
      expect(end).toEqual(new Date('2024-03-01T14:30:00Z'));
    });

    it('handles zero duration', () => {
      const start = new Date('2024-03-01T14:00:00Z');
      const end = computeOccupancyEnd(start, 0, 10);
      expect(end).toEqual(new Date('2024-03-01T14:10:00Z'));
    });
  });

  describe('intervalsOverlap', () => {
    it('returns true for overlapping intervals', () => {
      const a = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      const b = { start: new Date('2024-03-01T09:30:00Z'), end: new Date('2024-03-01T10:30:00Z') };
      expect(intervalsOverlap(a, b)).toBe(true);
    });

    it('returns true when one interval contains the other', () => {
      const a = { start: new Date('2024-03-01T08:00:00Z'), end: new Date('2024-03-01T12:00:00Z') };
      const b = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      expect(intervalsOverlap(a, b)).toBe(true);
    });

    it('returns false for adjacent intervals (a ends where b starts)', () => {
      const a = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      const b = { start: new Date('2024-03-01T10:00:00Z'), end: new Date('2024-03-01T11:00:00Z') };
      expect(intervalsOverlap(a, b)).toBe(false);
    });

    it('returns false for non-overlapping intervals', () => {
      const a = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      const b = { start: new Date('2024-03-01T11:00:00Z'), end: new Date('2024-03-01T12:00:00Z') };
      expect(intervalsOverlap(a, b)).toBe(false);
    });

    it('returns true for identical intervals', () => {
      const a = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      const b = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      expect(intervalsOverlap(a, b)).toBe(true);
    });

    it('is symmetric', () => {
      const a = { start: new Date('2024-03-01T09:00:00Z'), end: new Date('2024-03-01T10:00:00Z') };
      const b = { start: new Date('2024-03-01T09:30:00Z'), end: new Date('2024-03-01T10:30:00Z') };
      expect(intervalsOverlap(a, b)).toBe(intervalsOverlap(b, a));
    });
  });

  describe('generateCandidateStarts', () => {
    it('generates correct candidates for a 2-hour window with 30min service + 15min buffer at 15min granularity', () => {
      const windowStart = new Date('2024-03-01T09:00:00Z');
      const windowEnd = new Date('2024-03-01T11:00:00Z');
      const candidates = generateCandidateStarts(windowStart, windowEnd, 30, 15, 15);

      // Occupancy = 45 min. Window = 120 min.
      // Candidates: 09:00, 09:15, 09:30, 09:45, 10:00, 10:15
      // 10:15 + 45min = 11:00 <= 11:00 ✓
      // 10:30 + 45min = 11:15 > 11:00 ✗
      expect(candidates).toEqual([
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T09:15:00Z'),
        new Date('2024-03-01T09:30:00Z'),
        new Date('2024-03-01T09:45:00Z'),
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T10:15:00Z'),
      ]);
    });

    it('returns empty array when occupancy exceeds window', () => {
      const windowStart = new Date('2024-03-01T09:00:00Z');
      const windowEnd = new Date('2024-03-01T09:30:00Z');
      const candidates = generateCandidateStarts(windowStart, windowEnd, 30, 15, 15);
      expect(candidates).toEqual([]);
    });

    it('returns single candidate when occupancy exactly fills window', () => {
      const windowStart = new Date('2024-03-01T09:00:00Z');
      const windowEnd = new Date('2024-03-01T09:45:00Z');
      const candidates = generateCandidateStarts(windowStart, windowEnd, 30, 15, 15);
      expect(candidates).toEqual([new Date('2024-03-01T09:00:00Z')]);
    });

    it('respects granularity steps', () => {
      const windowStart = new Date('2024-03-01T09:00:00Z');
      const windowEnd = new Date('2024-03-01T11:00:00Z');
      const candidates = generateCandidateStarts(windowStart, windowEnd, 30, 0, 30);

      // Occupancy = 30 min. Window = 120 min. Step = 30 min.
      // 09:00, 09:30, 10:00, 10:30
      // 10:30 + 30 = 11:00 <= 11:00 ✓
      // 11:00 + 30 = 11:30 > 11:00 ✗
      expect(candidates).toEqual([
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T09:30:00Z'),
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T10:30:00Z'),
      ]);
    });

    it('returns empty for zero-length window', () => {
      const t = new Date('2024-03-01T09:00:00Z');
      const candidates = generateCandidateStarts(t, t, 30, 15, 15);
      expect(candidates).toEqual([]);
    });
  });

  describe('isWithinWindow', () => {
    it('returns true when interval is fully inside window', () => {
      const result = isWithinWindow(
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T10:30:00Z'),
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
      );
      expect(result).toBe(true);
    });

    it('returns true when interval exactly matches window', () => {
      const start = new Date('2024-03-01T09:00:00Z');
      const end = new Date('2024-03-01T12:00:00Z');
      expect(isWithinWindow(start, end, start, end)).toBe(true);
    });

    it('returns false when interval starts before window', () => {
      const result = isWithinWindow(
        new Date('2024-03-01T08:00:00Z'),
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
      );
      expect(result).toBe(false);
    });

    it('returns false when interval ends after window', () => {
      const result = isWithinWindow(
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T13:00:00Z'),
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
      );
      expect(result).toBe(false);
    });

    it('returns true when interval start equals window start', () => {
      const result = isWithinWindow(
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T10:00:00Z'),
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
      );
      expect(result).toBe(true);
    });

    it('returns true when interval end equals window end', () => {
      const result = isWithinWindow(
        new Date('2024-03-01T11:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
        new Date('2024-03-01T09:00:00Z'),
        new Date('2024-03-01T12:00:00Z'),
      );
      expect(result).toBe(true);
    });
  });

  describe('occupancyMinutes', () => {
    it('returns sum of duration and buffer', () => {
      expect(occupancyMinutes(60, 15)).toBe(75);
    });

    it('handles zero buffer', () => {
      expect(occupancyMinutes(45, 0)).toBe(45);
    });

    it('handles zero duration', () => {
      expect(occupancyMinutes(0, 10)).toBe(10);
    });
  });
});
