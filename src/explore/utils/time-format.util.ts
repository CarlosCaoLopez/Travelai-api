/**
 * Format walking time based on distance in meters.
 * Uses a conservative walking speed of 4 km/h to account for traffic lights, stops, etc.
 *
 * @param distanceInMeters - Distance in meters
 * @param language - Language code ('es', 'en', etc.)
 * @returns Formatted time string (e.g., "5 min a pie" or "5 min walk")
 *
 * @example
 * formatWalkingTime(500, 'es');  // Returns: "8 min a pie"
 * formatWalkingTime(3000, 'en'); // Returns: "45 min walk"
 */
export function formatWalkingTime(
  distanceInMeters: number,
  language: string = 'es',
): string {
  const WALKING_SPEED_MPS = 1.11; // 4 km/h in m/s (conservative estimate)
  const timeInSeconds = distanceInMeters / WALKING_SPEED_MPS;
  const minutes = Math.ceil(timeInSeconds / 60);

  if (language === 'es') {
    if (minutes < 1) return 'menos de 1 min a pie';
    if (minutes === 1) return '1 min a pie';
    if (minutes < 60) return `${minutes} min a pie`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours}h a pie`;
    return `${hours}h ${remainingMinutes} min a pie`;
  }

  if (language === 'en') {
    if (minutes < 1) return 'less than 1 min walk';
    if (minutes === 1) return '1 min walk';
    if (minutes < 60) return `${minutes} min walk`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours}h walk`;
    return `${hours}h ${remainingMinutes} min walk`;
  }

  // Fallback to Spanish format
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes} min`;
}
