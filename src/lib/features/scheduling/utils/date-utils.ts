/**
 * UTC Date Utilities
 *
 * IMPORTANT: All date handling in this application should use these utilities
 * to ensure consistent timezone handling. Dates are stored and processed as
 * UTC to avoid timezone shift bugs.
 *
 * Common mistake to avoid:
 *   new Date('2025-12-01') - Parses in LOCAL timezone, causes day shift in Western timezones
 *
 * Correct approach:
 *   parseUTCDate('2025-12-01') - Always parses as UTC midnight
 */

// ============================================================================
// Core UTC Date Functions
// ============================================================================

/**
 * Parse a date string as UTC to avoid timezone shifts
 *
 * This is the ONLY way dates should be parsed from strings in this application.
 * Using `new Date(dateString)` directly will parse in local timezone and cause
 * dates to shift by one day in Western timezones.
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Date object set to UTC midnight
 *
 * @example
 * // Correct - parses as Dec 1, 2025 00:00:00 UTC
 * parseUTCDate('2025-12-01')
 *
 * // WRONG - parses as local time, may become Nov 30 in UTC
 * new Date('2025-12-01')
 */
export function parseUTCDate(dateString: string): Date {
	return new Date(dateString + 'T00:00:00.000Z');
}

/**
 * Format a Date object to YYYY-MM-DD string using UTC
 *
 * @param date - Date object
 * @returns ISO date string (YYYY-MM-DD)
 */
export function formatUTCDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Get the UTC day of week (0 = Sunday, 1 = Monday, ... 6 = Saturday)
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Day of week number (0-6)
 */
export function getUTCDayOfWeek(dateString: string): number {
	return parseUTCDate(dateString).getUTCDay();
}

/**
 * Get the day name for a date string
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @param format - 'short' for 'Mon', 'long' for 'Monday'
 * @returns Day name
 */
export function getDayName(dateString: string, format: 'short' | 'long' = 'short'): string {
	const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const longNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dayOfWeek = getUTCDayOfWeek(dateString);
	return format === 'short' ? shortNames[dayOfWeek] : longNames[dayOfWeek];
}

/**
 * Check if a date falls on a weekend (Saturday or Sunday)
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if weekend
 */
export function isWeekend(dateString: string): boolean {
	const day = getUTCDayOfWeek(dateString);
	return day === 0 || day === 6;
}

/**
 * Get today's date as YYYY-MM-DD string in UTC
 *
 * @returns Today's date string
 */
export function getTodayUTC(): string {
	return formatUTCDate(new Date());
}

// ============================================================================
// Date Range Functions
// ============================================================================

/**
 * Generate an array of all dates between start and end (inclusive)
 *
 * @param startDate - Start date (ISO format YYYY-MM-DD)
 * @param endDate - End date (ISO format YYYY-MM-DD)
 * @returns Array of ISO date strings for every day in range
 */
export function getDaysBetween(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const start = parseUTCDate(startDate);
	const end = parseUTCDate(endDate);

	const current = new Date(start);
	while (current <= end) {
		dates.push(formatUTCDate(current));
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
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

/**
 * Get months between two dates
 *
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Array of month info objects
 */
export function getMonthsBetween(
	startDate: string,
	endDate: string
): Array<{ year: number; month: number; name: string }> {
	const months: Array<{ year: number; month: number; name: string }> = [];
	const start = parseUTCDate(startDate);
	const end = parseUTCDate(endDate);

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

	while (current <= end) {
		months.push({
			year: current.getUTCFullYear(),
			month: current.getUTCMonth() + 1,
			name: `${monthNames[current.getUTCMonth()]} ${current.getUTCFullYear()}`
		});
		current.setUTCMonth(current.getUTCMonth() + 1);
	}

	return months;
}

/**
 * Get the last day of a month
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Last day of the month (28-31)
 */
export function getLastDayOfMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ============================================================================
// Display Formatting Functions
// ============================================================================

/**
 * Format a date string for display (e.g., "Mon, Dec 1, 2025")
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDisplayDate(
	dateString: string,
	options: Intl.DateTimeFormatOptions = {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}
): string {
	const date = parseUTCDate(dateString);
	return date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/**
 * Format a date string to show just month and year (e.g., "December 2025")
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted month/year string
 */
export function formatMonthYear(dateString: string): string {
	return formatDisplayDate(dateString, { month: 'long', year: 'numeric' });
}

// ============================================================================
// Legacy Compatibility (deprecated - use formatUTCDate instead)
// ============================================================================

/**
 * @deprecated Use formatUTCDate instead
 */
export function formatToISODate(date: Date): string {
	return formatUTCDate(date);
}
