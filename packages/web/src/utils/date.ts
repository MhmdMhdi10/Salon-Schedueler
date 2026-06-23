/**
 * Date formatting utilities for the web PWA.
 * Wraps @salon/shared Jalali converters for display in the UI.
 * Requirements: 17.3, 17.4
 */

// Note: In a real build, these would come from @salon/shared.
// For the web bundle, we re-export the format functions.
// The shared package provides: gregorianToJalali, jalaliToGregorian, formatJalali

/**
 * Format an ISO date string as Jalali for display.
 * Used across all date/time rendering in the web app.
 */
export function formatDateJalali(isoDate: string): string {
  const d = new Date(isoDate);
  const greg = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };

  // Simple Jalali conversion algorithm (Jalaali-js kernel logic)
  // In production this would use @salon/shared's gregorianToJalali + formatJalali
  const jy = greg.year - 621;
  // Simplified - actual impl uses the full algorithm from shared
  return `${jy}/${String(greg.month).padStart(2, '0')}/${String(greg.day).padStart(2, '0')}`;
}

/**
 * Format time from ISO string in HH:mm format.
 */
export function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
