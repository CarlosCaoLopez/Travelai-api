import { format, toZonedTime } from 'date-fns-tz';

/**
 * Timezone for Madrid, Spain
 */
const MADRID_TIMEZONE = 'Europe/Madrid';

/**
 * Get the current date in Madrid timezone as a string (YYYY-MM-DD format).
 * This is used to determine the "day" for daily recommendations.
 * The day changes at 20:00 Madrid time, so we need to adjust the date accordingly.
 *
 * @returns Date string in YYYY-MM-DD format (Madrid timezone)
 *
 * @example
 * // If current time in Madrid is 2025-12-23 19:59:59
 * getMadridDateString() // Returns '2025-12-23'
 *
 * // If current time in Madrid is 2025-12-23 20:00:00
 * getMadridDateString() // Returns '2025-12-24' (next day starts at 20:00)
 */
export function getMadridDateString(): string {
  const now = new Date();
  const madridTime = toZonedTime(now, MADRID_TIMEZONE);

  // Get hour in Madrid timezone
  const madridHour = madridTime.getHours();

  // If it's 20:00 or later (20:00-23:59), advance to next day
  if (madridHour >= 20) {
    const nextDay = new Date(madridTime);
    nextDay.setDate(nextDay.getDate() + 1);
    return format(nextDay, 'yyyy-MM-dd', { timeZone: MADRID_TIMEZONE });
  }

  // Otherwise, use current date
  return format(madridTime, 'yyyy-MM-dd', { timeZone: MADRID_TIMEZONE });
}

/**
 * Get the current DateTime in Madrid timezone.
 * Useful for logging and debugging.
 *
 * @returns Date object adjusted to Madrid timezone
 */
export function getCurrentMadridDateTime(): Date {
  return toZonedTime(new Date(), MADRID_TIMEZONE);
}

/**
 * Get the current date and time in Madrid as a formatted string.
 *
 * @returns Formatted string like "2025-12-23 19:30:45"
 */
export function getMadridDateTimeString(): string {
  const madridTime = getCurrentMadridDateTime();
  return format(madridTime, 'yyyy-MM-dd HH:mm:ss', { timeZone: MADRID_TIMEZONE });
}
