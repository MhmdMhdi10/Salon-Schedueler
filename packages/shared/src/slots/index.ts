/**
 * Time-slot and interval helpers for the Scheduling Engine.
 * All functions are pure (no I/O, no side effects).
 */

/**
 * Computes the end of the occupancy interval.
 * Occupancy = [startAt, startAt + durationMinutes + bufferMinutes) (half-open)
 *
 * @param startAt - The start time of the appointment
 * @param durationMinutes - Service duration in minutes
 * @param bufferMinutes - Buffer/cleanup time in minutes
 * @returns The end of the occupancy interval
 */
export function computeOccupancyEnd(
  startAt: Date,
  durationMinutes: number,
  bufferMinutes: number,
): Date {
  return new Date(startAt.getTime() + (durationMinutes + bufferMinutes) * 60_000);
}

/**
 * Checks whether two half-open time intervals overlap.
 * Intervals are [start, end) — half-open (inclusive start, exclusive end).
 * Two half-open intervals overlap iff a.start < b.end && b.start < a.end.
 *
 * @param a - First interval with start and end dates
 * @param b - Second interval with start and end dates
 * @returns true if the intervals overlap
 */
export function intervalsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Generates candidate start times at a given granularity within a time window.
 * Walks from windowStart at granularityMinutes steps, returning only starts
 * where the full occupancy interval (duration + buffer) fits within the window.
 *
 * @param windowStart - Start of the availability window
 * @param windowEnd - End of the availability window
 * @param durationMinutes - Service duration in minutes
 * @param bufferMinutes - Buffer/cleanup time in minutes
 * @param granularityMinutes - Step size for candidate starts (e.g., 15)
 * @returns Array of candidate start times where full occupancy fits
 */
export function generateCandidateStarts(
  windowStart: Date,
  windowEnd: Date,
  durationMinutes: number,
  bufferMinutes: number,
  granularityMinutes: number,
): Date[] {
  const candidates: Date[] = [];
  const stepMs = granularityMinutes * 60_000;
  const occupancyMs = (durationMinutes + bufferMinutes) * 60_000;

  let currentMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  while (currentMs + occupancyMs <= windowEndMs) {
    candidates.push(new Date(currentMs));
    currentMs += stepMs;
  }

  return candidates;
}

/**
 * Checks if a half-open interval [start, end) fits entirely within
 * the window [windowStart, windowEnd).
 *
 * @param start - Start of the interval to check
 * @param end - End of the interval to check
 * @param windowStart - Start of the containing window
 * @param windowEnd - End of the containing window
 * @returns true if the interval is entirely within the window
 */
export function isWithinWindow(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  return start >= windowStart && end <= windowEnd;
}

/**
 * Computes the total occupancy in minutes (duration + buffer).
 * Convenience helper wrapping the sum.
 *
 * @param durationMinutes - Service duration in minutes
 * @param bufferMinutes - Buffer/cleanup time in minutes
 * @returns Total occupancy in minutes
 */
export function occupancyMinutes(durationMinutes: number, bufferMinutes: number): number {
  return durationMinutes + bufferMinutes;
}
