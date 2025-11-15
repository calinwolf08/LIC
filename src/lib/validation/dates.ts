/**
 * Date Utility Functions
 *
 * Helper functions for date parsing, formatting, and validation
 */

/**
 * Checks if a string is a valid ISO date (YYYY-MM-DD)
 */
export function isValidISODate(dateString: string): boolean {
	const regex = /^\d{4}-\d{2}-\d{2}$/;
	if (!regex.test(dateString)) {
		return false;
	}

	const date = new Date(dateString);
	return !isNaN(date.getTime());
}

/**
 * Parses an ISO date string to a Date object
 * @throws {Error} If the date string is invalid
 */
export function parseISODate(dateString: string): Date {
	if (!isValidISODate(dateString)) {
		throw new Error(`Invalid ISO date format: ${dateString}`);
	}

	const date = new Date(dateString);
	return date;
}

/**
 * Formats a Date object to ISO date string (YYYY-MM-DD)
 */
export function formatToISODate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

/**
 * Checks if a date is within a range (inclusive)
 */
export function isDateInRange(date: string, start: string, end: string): boolean {
	const d = new Date(date);
	const s = new Date(start);
	const e = new Date(end);

	return d >= s && d <= e;
}

/**
 * Returns an array of all dates between start and end (inclusive)
 */
export function getDaysBetween(start: string, end: string): string[] {
	const dates: string[] = [];
	const startDate = new Date(start);
	const endDate = new Date(end);

	const current = new Date(startDate);
	while (current <= endDate) {
		dates.push(formatToISODate(current));
		current.setDate(current.getDate() + 1);
	}

	return dates;
}
