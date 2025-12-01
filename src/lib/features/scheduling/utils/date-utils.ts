/**
 * Generate an array of all dates between start and end (inclusive)
 *
 * @param startDate - Start date (ISO format YYYY-MM-DD)
 * @param endDate - End date (ISO format YYYY-MM-DD)
 * @returns Array of ISO date strings for every day in range
 */
export function getDaysBetween(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	// Parse as UTC to avoid timezone issues
	const start = new Date(startDate + 'T00:00:00.000Z');
	const end = new Date(endDate + 'T00:00:00.000Z');

	// Iterate through each day using UTC methods
	const current = new Date(start);
	while (current <= end) {
		dates.push(formatToISODate(current));
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Format a Date object to ISO date string (YYYY-MM-DD)
 *
 * @param date - Date object
 * @returns ISO date string
 */
export function formatToISODate(date: Date): string {
	return date.toISOString().split('T')[0];
}

/**
 * Get scheduling dates excluding blackout dates
 *
 * @param startDate - Start date (ISO format)
 * @param endDate - End date (ISO format)
 * @param blackoutDates - Set of blackout dates to exclude
 * @returns Array of valid scheduling dates
 */
export function getSchedulingDates(
	startDate: string,
	endDate: string,
	blackoutDates: Set<string>
): string[] {
	const allDates = getDaysBetween(startDate, endDate);
	return allDates.filter((date) => !blackoutDates.has(date));
}
