/**
 * Pure Pattern Generator Functions
 *
 * These pure functions generate arrays of date strings from pattern configurations.
 * All functions are side-effect free and can be tested independently.
 */

import type {
	WeeklyConfig,
	MonthlyConfig,
	BlockConfig,
	CreatePattern,
	GeneratedDate
} from '../pattern-schemas';

// ========================================
// Utility Functions
// ========================================

/**
 * Format a Date object as YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD string to Date object at midnight UTC
 */
export function parseDate(dateString: string): Date {
	return new Date(dateString + 'T00:00:00.000Z');
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
	const day = date.getUTCDay();
	return day === 0 || day === 6;
}

/**
 * Get the first day of a month
 */
export function getFirstDayOfMonth(year: number, month: number): Date {
	return new Date(Date.UTC(year, month, 1));
}

/**
 * Get the last day of a month
 */
export function getLastDayOfMonth(year: number, month: number): Date {
	return new Date(Date.UTC(year, month + 1, 0));
}

/**
 * Get all months between two dates (inclusive)
 * Returns array of {year, month} objects
 */
export function getMonthsInRange(startDate: Date, endDate: Date): Array<{ year: number; month: number }> {
	const months: Array<{ year: number; month: number }> = [];
	const current = new Date(startDate);
	current.setUTCDate(1);

	while (current <= endDate) {
		months.push({
			year: current.getUTCFullYear(),
			month: current.getUTCMonth()
		});
		current.setUTCMonth(current.getUTCMonth() + 1);
	}

	return months;
}

/**
 * Check if a date is a specific day of the month (1-31)
 */
export function isDayOfMonth(date: Date, day: number): boolean {
	return date.getUTCDate() === day;
}

// ========================================
// Weekly Pattern Generator
// ========================================

/**
 * Generate dates for a weekly pattern
 *
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param config - Weekly pattern configuration
 * @returns Array of date strings matching the pattern
 */
export function generateWeeklyDates(
	startDate: string,
	endDate: string,
	config: WeeklyConfig
): string[] {
	const dates: string[] = [];
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	const daysSet = new Set(config.days_of_week);

	const current = new Date(start);
	while (current <= end) {
		const dayOfWeek = current.getUTCDay();
		if (daysSet.has(dayOfWeek)) {
			dates.push(formatDate(current));
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

// ========================================
// Monthly Pattern Generators
// ========================================

/**
 * Get dates for the first N days of a month
 */
function getFirstNDays(year: number, month: number, n: number): string[] {
	const dates: string[] = [];
	const firstDay = getFirstDayOfMonth(year, month);
	const lastDay = getLastDayOfMonth(year, month);

	const current = new Date(firstDay);
	for (let i = 0; i < n && current <= lastDay; i++) {
		dates.push(formatDate(current));
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Get dates for the last N days of a month
 */
function getLastNDays(year: number, month: number, n: number): string[] {
	const dates: string[] = [];
	const lastDay = getLastDayOfMonth(year, month);

	const current = new Date(lastDay);
	for (let i = 0; i < n; i++) {
		dates.unshift(formatDate(current));
		current.setUTCDate(current.getUTCDate() - 1);

		// Stop if we go back to previous month
		if (current.getUTCMonth() !== month) {
			break;
		}
	}

	return dates;
}

/**
 * Get dates for the first calendar week of a month (Sunday-Saturday)
 */
function getFirstCalendarWeek(year: number, month: number): string[] {
	const dates: string[] = [];
	const firstDay = getFirstDayOfMonth(year, month);

	// Find the first Sunday (or start of month if it starts later in the week)
	const current = new Date(firstDay);
	const firstDayOfWeek = current.getUTCDay();

	// If month doesn't start on Sunday, find the first Sunday
	if (firstDayOfWeek !== 0) {
		current.setUTCDate(current.getUTCDate() + (7 - firstDayOfWeek));
	}

	// Add 7 days from the first Sunday (or first day if it's a Sunday)
	const startDate = new Date(current);
	for (let i = 0; i < 7; i++) {
		if (current.getUTCMonth() === month) {
			dates.push(formatDate(current));
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Get dates for the last calendar week of a month (Sunday-Saturday)
 */
function getLastCalendarWeek(year: number, month: number): string[] {
	const dates: string[] = [];
	const lastDay = getLastDayOfMonth(year, month);

	// Find the last Saturday of the month
	const current = new Date(lastDay);
	const lastDayOfWeek = current.getUTCDay();

	// If month doesn't end on Saturday, go back to last Saturday
	if (lastDayOfWeek !== 6) {
		current.setUTCDate(current.getUTCDate() - (lastDayOfWeek + 1));
	}

	// Go back 6 more days to get the full week (Sunday-Saturday)
	current.setUTCDate(current.getUTCDate() - 6);

	// Add 7 days
	for (let i = 0; i < 7; i++) {
		if (current.getUTCMonth() === month) {
			dates.push(formatDate(current));
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Get dates for the first N business days of a month (Mon-Fri)
 */
function getFirstBusinessDays(year: number, month: number, n: number): string[] {
	const dates: string[] = [];
	const firstDay = getFirstDayOfMonth(year, month);
	const lastDay = getLastDayOfMonth(year, month);

	const current = new Date(firstDay);
	let count = 0;

	while (count < n && current <= lastDay) {
		if (!isWeekend(current)) {
			dates.push(formatDate(current));
			count++;
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Get dates for the last N business days of a month (Mon-Fri)
 */
function getLastBusinessDays(year: number, month: number, n: number): string[] {
	const dates: string[] = [];
	const lastDay = getLastDayOfMonth(year, month);
	const firstDay = getFirstDayOfMonth(year, month);

	const current = new Date(lastDay);
	let count = 0;

	while (count < n && current >= firstDay) {
		if (!isWeekend(current)) {
			dates.unshift(formatDate(current));
			count++;
		}
		current.setUTCDate(current.getUTCDate() - 1);
	}

	return dates;
}

/**
 * Get specific days of a month (e.g., 1st, 15th, 30th)
 */
function getSpecificDaysOfMonth(year: number, month: number, days: number[]): string[] {
	const dates: string[] = [];
	const lastDay = getLastDayOfMonth(year, month);
	const maxDay = lastDay.getUTCDate();

	for (const day of days) {
		// Only include if the month has this day
		if (day <= maxDay) {
			const date = new Date(Date.UTC(year, month, day));
			dates.push(formatDate(date));
		}
	}

	return dates.sort();
}

/**
 * Generate dates for a monthly pattern
 *
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param config - Monthly pattern configuration
 * @returns Array of date strings matching the pattern
 */
export function generateMonthlyDates(
	startDate: string,
	endDate: string,
	config: MonthlyConfig
): string[] {
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	const months = getMonthsInRange(start, end);
	const allDates: string[] = [];

	for (const { year, month } of months) {
		let monthDates: string[] = [];

		switch (config.monthly_type) {
			case 'first_week':
				if (config.week_definition === 'seven_days') {
					monthDates = getFirstNDays(year, month, 7);
				} else if (config.week_definition === 'calendar') {
					monthDates = getFirstCalendarWeek(year, month);
				} else if (config.week_definition === 'business') {
					monthDates = getFirstBusinessDays(year, month, 5);
				}
				break;

			case 'last_week':
				if (config.week_definition === 'seven_days') {
					monthDates = getLastNDays(year, month, 7);
				} else if (config.week_definition === 'calendar') {
					monthDates = getLastCalendarWeek(year, month);
				} else if (config.week_definition === 'business') {
					monthDates = getLastBusinessDays(year, month, 5);
				}
				break;

			case 'first_business_week':
				monthDates = getFirstBusinessDays(year, month, 5);
				break;

			case 'last_business_week':
				monthDates = getLastBusinessDays(year, month, 5);
				break;

			case 'specific_days':
				if (config.specific_days) {
					monthDates = getSpecificDaysOfMonth(year, month, config.specific_days);
				}
				break;
		}

		allDates.push(...monthDates);
	}

	// Filter to only include dates within the specified range
	return allDates.filter(date => date >= startDate && date <= endDate).sort();
}

// ========================================
// Block Pattern Generator
// ========================================

/**
 * Generate dates for a block pattern (date range)
 *
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param config - Block pattern configuration
 * @returns Array of date strings within the range
 */
export function generateBlockDates(
	startDate: string,
	endDate: string,
	config: BlockConfig
): string[] {
	const dates: string[] = [];
	const start = parseDate(startDate);
	const end = parseDate(endDate);

	const current = new Date(start);
	while (current <= end) {
		// Skip weekends if configured
		if (!config.exclude_weekends || !isWeekend(current)) {
			dates.push(formatDate(current));
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

// ========================================
// Individual Pattern Generator
// ========================================

/**
 * Generate date for an individual pattern (single date)
 *
 * @param date - The date (YYYY-MM-DD)
 * @returns Array with single date
 */
export function generateIndividualDate(date: string): string[] {
	return [date];
}

// ========================================
// Pattern Application Logic
// ========================================

/**
 * Apply patterns in specificity order and generate final availability dates
 *
 * @param patterns - Array of patterns sorted by specificity (ascending)
 * @returns Array of generated dates with availability and source information
 */
export function applyPatternsBySpecificity(patterns: CreatePattern[]): GeneratedDate[] {
	// Map to store final availability state for each date
	const dateMap = new Map<string, GeneratedDate>();

	// Sort patterns by specificity (already assumed to be sorted, but ensure it)
	const sorted = [...patterns].sort((a, b) => a.specificity - b.specificity);

	for (const pattern of sorted) {
		if (!pattern.enabled) {
			continue;
		}

		let dates: string[] = [];

		// Generate dates based on pattern type
		switch (pattern.pattern_type) {
			case 'weekly':
				dates = generateWeeklyDates(
					pattern.date_range_start,
					pattern.date_range_end,
					pattern.config
				);
				break;

			case 'monthly':
				dates = generateMonthlyDates(
					pattern.date_range_start,
					pattern.date_range_end,
					pattern.config
				);
				break;

			case 'block':
				dates = generateBlockDates(
					pattern.date_range_start,
					pattern.date_range_end,
					pattern.config
				);
				break;

			case 'individual':
				dates = generateIndividualDate(pattern.date_range_start);
				break;
		}

		// Apply dates to map (higher specificity overwrites lower)
		for (const date of dates) {
			dateMap.set(date, {
				date,
				is_available: pattern.is_available,
				source_pattern_type: pattern.pattern_type
			});
		}
	}

	// Convert map to array and sort by date
	return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Generate dates from a single pattern
 *
 * @param pattern - The pattern to generate dates from
 * @returns Array of date strings
 */
export function generateDatesFromPattern(pattern: CreatePattern): string[] {
	if (!pattern.enabled) {
		return [];
	}

	switch (pattern.pattern_type) {
		case 'weekly':
			return generateWeeklyDates(
				pattern.date_range_start,
				pattern.date_range_end,
				pattern.config
			);

		case 'monthly':
			return generateMonthlyDates(
				pattern.date_range_start,
				pattern.date_range_end,
				pattern.config
			);

		case 'block':
			return generateBlockDates(
				pattern.date_range_start,
				pattern.date_range_end,
				pattern.config
			);

		case 'individual':
			return generateIndividualDate(pattern.date_range_start);

		default:
			return [];
	}
}
