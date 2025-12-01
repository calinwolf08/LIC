/**
 * Pattern Generator Functions Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
	formatDate,
	parseDate,
	isWeekend,
	getFirstDayOfMonth,
	getLastDayOfMonth,
	getMonthsInRange,
	generateWeeklyDates,
	generateMonthlyDates,
	generateBlockDates,
	generateIndividualDate,
	applyPatternsBySpecificity,
	generateDatesFromPattern
} from './pattern-generators';
import type { CreatePattern } from '../pattern-schemas';

// ========================================
// Utility Functions Tests
// ========================================

describe('formatDate', () => {
	it('should format date correctly', () => {
		const date = new Date('2025-01-15T00:00:00.000Z');
		expect(formatDate(date)).toBe('2025-01-15');
	});

	it('should pad month and day with zeros', () => {
		const date = new Date('2025-03-05T00:00:00.000Z');
		expect(formatDate(date)).toBe('2025-03-05');
	});
});

describe('parseDate', () => {
	it('should parse date string correctly', () => {
		const date = parseDate('2025-01-15');
		expect(date.getUTCFullYear()).toBe(2025);
		expect(date.getUTCMonth()).toBe(0); // January
		expect(date.getUTCDate()).toBe(15);
	});
});

describe('isWeekend', () => {
	it('should return true for Saturday', () => {
		const saturday = new Date('2025-01-11T00:00:00.000Z'); // Saturday
		expect(isWeekend(saturday)).toBe(true);
	});

	it('should return true for Sunday', () => {
		const sunday = new Date('2025-01-12T00:00:00.000Z'); // Sunday
		expect(isWeekend(sunday)).toBe(true);
	});

	it('should return false for weekdays', () => {
		const monday = new Date('2025-01-13T00:00:00.000Z'); // Monday
		expect(isWeekend(monday)).toBe(false);
	});
});

describe('getMonthsInRange', () => {
	it('should return all months in range', () => {
		const start = parseDate('2025-01-15');
		const end = parseDate('2025-03-20');
		const months = getMonthsInRange(start, end);

		expect(months).toEqual([
			{ year: 2025, month: 0 }, // January
			{ year: 2025, month: 1 }, // February
			{ year: 2025, month: 2 }  // March
		]);
	});

	it('should handle single month range', () => {
		const start = parseDate('2025-01-01');
		const end = parseDate('2025-01-31');
		const months = getMonthsInRange(start, end);

		expect(months).toEqual([{ year: 2025, month: 0 }]);
	});

	it('should handle year boundary', () => {
		const start = parseDate('2024-12-15');
		const end = parseDate('2025-02-10');
		const months = getMonthsInRange(start, end);

		expect(months).toEqual([
			{ year: 2024, month: 11 }, // December
			{ year: 2025, month: 0 },  // January
			{ year: 2025, month: 1 }   // February
		]);
	});
});

// ========================================
// Weekly Pattern Generator Tests
// ========================================

describe('generateWeeklyDates', () => {
	it('should generate weekly dates for Mon-Wed-Fri', () => {
		const dates = generateWeeklyDates(
			'2025-01-01', // Wednesday
			'2025-01-10', // Friday
			{ days_of_week: [1, 3, 5] } // Mon, Wed, Fri
		);

		expect(dates).toContain('2025-01-01'); // Wed
		expect(dates).toContain('2025-01-03'); // Fri
		expect(dates).toContain('2025-01-06'); // Mon
		expect(dates).toContain('2025-01-08'); // Wed
		expect(dates).toContain('2025-01-10'); // Fri

		expect(dates).not.toContain('2025-01-02'); // Thu
		expect(dates).not.toContain('2025-01-04'); // Sat
		expect(dates).not.toContain('2025-01-05'); // Sun
	});

	it('should generate weekend dates', () => {
		const dates = generateWeeklyDates(
			'2025-01-01',
			'2025-01-31',
			{ days_of_week: [0, 6] } // Sun, Sat
		);

		// Check for weekends in January 2025
		expect(dates).toContain('2025-01-04'); // Sat
		expect(dates).toContain('2025-01-05'); // Sun
		expect(dates).toContain('2025-01-11'); // Sat
		expect(dates).toContain('2025-01-12'); // Sun
	});

	it('should return empty array when no days selected', () => {
		const dates = generateWeeklyDates(
			'2025-01-01',
			'2025-01-31',
			{ days_of_week: [] }
		);

		expect(dates).toEqual([]);
	});
});

// ========================================
// Monthly Pattern Generator Tests
// ========================================

describe('generateMonthlyDates - first 7 days', () => {
	it('should generate first 7 days of each month', () => {
		const dates = generateMonthlyDates(
			'2025-01-01',
			'2025-02-28',
			{
				monthly_type: 'first_week',
				week_definition: 'seven_days'
			}
		);

		// January first 7 days
		expect(dates).toContain('2025-01-01');
		expect(dates).toContain('2025-01-07');
		expect(dates).not.toContain('2025-01-08');

		// February first 7 days
		expect(dates).toContain('2025-02-01');
		expect(dates).toContain('2025-02-07');
		expect(dates).not.toContain('2025-02-08');
	});
});

describe('generateMonthlyDates - last 7 days', () => {
	it('should generate last 7 days of each month', () => {
		const dates = generateMonthlyDates(
			'2025-01-01',
			'2025-02-28',
			{
				monthly_type: 'last_week',
				week_definition: 'seven_days'
			}
		);

		// January last 7 days (25-31)
		expect(dates).toContain('2025-01-25');
		expect(dates).toContain('2025-01-31');
		expect(dates).not.toContain('2025-01-24');

		// February last 7 days (22-28)
		expect(dates).toContain('2025-02-22');
		expect(dates).toContain('2025-02-28');
		expect(dates).not.toContain('2025-02-21');
	});
});

describe('generateMonthlyDates - first business week', () => {
	it('should generate first 5 business days of each month', () => {
		const dates = generateMonthlyDates(
			'2025-01-01', // Wednesday
			'2025-01-31',
			{
				monthly_type: 'first_business_week'
			}
		);

		// First 5 business days of January 2025
		expect(dates).toContain('2025-01-01'); // Wed
		expect(dates).toContain('2025-01-02'); // Thu
		expect(dates).toContain('2025-01-03'); // Fri
		expect(dates).toContain('2025-01-06'); // Mon
		expect(dates).toContain('2025-01-07'); // Tue
		expect(dates).toHaveLength(5);
	});
});

describe('generateMonthlyDates - specific days', () => {
	it('should generate specific days of each month', () => {
		const dates = generateMonthlyDates(
			'2025-01-01',
			'2025-03-31',
			{
				monthly_type: 'specific_days',
				specific_days: [1, 15]
			}
		);

		// Check 1st and 15th of each month
		expect(dates).toContain('2025-01-01');
		expect(dates).toContain('2025-01-15');
		expect(dates).toContain('2025-02-01');
		expect(dates).toContain('2025-02-15');
		expect(dates).toContain('2025-03-01');
		expect(dates).toContain('2025-03-15');
		expect(dates).toHaveLength(6);
	});

	it('should skip days that dont exist in month', () => {
		const dates = generateMonthlyDates(
			'2025-01-01',
			'2025-02-28',
			{
				monthly_type: 'specific_days',
				specific_days: [31] // February doesn't have 31 days
			}
		);

		expect(dates).toContain('2025-01-31'); // January has 31
		expect(dates).not.toContain('2025-02-31'); // February doesn't
		expect(dates).toHaveLength(1);
	});
});

// ========================================
// Block Pattern Generator Tests
// ========================================

describe('generateBlockDates', () => {
	it('should generate all dates in range', () => {
		const dates = generateBlockDates(
			'2025-01-01',
			'2025-01-10',
			{ exclude_weekends: false }
		);

		expect(dates).toHaveLength(10);
		expect(dates).toContain('2025-01-01');
		expect(dates).toContain('2025-01-10');
	});

	it('should exclude weekends when configured', () => {
		const dates = generateBlockDates(
			'2025-01-01', // Wednesday
			'2025-01-10', // Friday
			{ exclude_weekends: true }
		);

		// Should not contain Sat Jan 4 or Sun Jan 5
		expect(dates).not.toContain('2025-01-04');
		expect(dates).not.toContain('2025-01-05');

		// Should contain weekdays
		expect(dates).toContain('2025-01-01'); // Wed
		expect(dates).toContain('2025-01-06'); // Mon
		expect(dates).toContain('2025-01-10'); // Fri
	});

	it('should handle single day range', () => {
		const dates = generateBlockDates(
			'2025-01-15',
			'2025-01-15',
			{ exclude_weekends: false }
		);

		expect(dates).toEqual(['2025-01-15']);
	});
});

// ========================================
// Individual Pattern Generator Tests
// ========================================

describe('generateIndividualDate', () => {
	it('should return single date', () => {
		const dates = generateIndividualDate('2025-01-15');

		expect(dates).toEqual(['2025-01-15']);
	});
});

// ========================================
// Pattern Application Tests
// ========================================

describe('applyPatternsBySpecificity', () => {
	it('should apply patterns in specificity order', () => {
		const patterns: CreatePattern[] = [
			{
				pattern_type: 'weekly',
				is_available: true,
				specificity: 1,
				date_range_start: '2025-01-01',
				date_range_end: '2025-01-31',
				config: { days_of_week: [1, 3, 5] }, // Mon, Wed, Fri
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			{
				pattern_type: 'block',
				is_available: false,
				specificity: 2,
				date_range_start: '2025-01-06', // Monday
				date_range_end: '2025-01-10', // Friday
				config: { exclude_weekends: false },
				enabled: true,
				preceptor_id: 'test-preceptor'
			}
		];

		const result = applyPatternsBySpecificity(patterns);

		// Jan 3 (Fri) should be available from weekly pattern
		const jan3 = result.find(d => d.date === '2025-01-03');
		expect(jan3?.is_available).toBe(true);

		// Jan 6 (Mon) should be unavailable from block pattern (overrides weekly)
		const jan6 = result.find(d => d.date === '2025-01-06');
		expect(jan6?.is_available).toBe(false);

		// Jan 8 (Wed) should be unavailable from block pattern (overrides weekly)
		const jan8 = result.find(d => d.date === '2025-01-08');
		expect(jan8?.is_available).toBe(false);
	});

	it('should handle individual overrides with highest specificity', () => {
		const patterns: CreatePattern[] = [
			{
				pattern_type: 'weekly',
				is_available: true,
				specificity: 1,
				date_range_start: '2025-01-01',
				date_range_end: '2025-01-31',
				config: { days_of_week: [1, 3, 5] }, // Mon, Wed, Fri
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			{
				pattern_type: 'block',
				is_available: false,
				specificity: 2,
				date_range_start: '2025-01-06',
				date_range_end: '2025-01-10',
				config: { exclude_weekends: false },
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			{
				pattern_type: 'individual',
				is_available: true,
				specificity: 3,
				date_range_start: '2025-01-08',
				date_range_end: '2025-01-08',
				config: null,
				enabled: true,
				preceptor_id: 'test-preceptor'
			}
		];

		const result = applyPatternsBySpecificity(patterns);

		// Jan 8 should be available from individual override (overrides block)
		const jan8 = result.find(d => d.date === '2025-01-08');
		expect(jan8?.is_available).toBe(true);
		expect(jan8?.source_pattern_type).toBe('individual');
	});

	it('should ignore disabled patterns', () => {
		const patterns: CreatePattern[] = [
			{
				pattern_type: 'weekly',
				is_available: true,
				specificity: 1,
				date_range_start: '2025-01-01',
				date_range_end: '2025-01-07',
				config: { days_of_week: [1] }, // Monday
				enabled: false, // Disabled
				preceptor_id: 'test-preceptor'
			}
		];

		const result = applyPatternsBySpecificity(patterns);

		expect(result).toHaveLength(0);
	});

	it('should return sorted dates', () => {
		const patterns: CreatePattern[] = [
			{
				pattern_type: 'individual',
				is_available: true,
				specificity: 3,
				date_range_start: '2025-01-20',
				date_range_end: '2025-01-20',
				config: null,
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			{
				pattern_type: 'individual',
				is_available: true,
				specificity: 3,
				date_range_start: '2025-01-10',
				date_range_end: '2025-01-10',
				config: null,
				enabled: true,
				preceptor_id: 'test-preceptor'
			}
		];

		const result = applyPatternsBySpecificity(patterns);

		expect(result[0].date).toBe('2025-01-10');
		expect(result[1].date).toBe('2025-01-20');
	});
});

describe('generateDatesFromPattern', () => {
	it('should generate dates from weekly pattern', () => {
		const pattern: CreatePattern = {
			pattern_type: 'weekly',
			is_available: true,
			specificity: 1,
			date_range_start: '2025-01-01',
			date_range_end: '2025-01-07',
			config: { days_of_week: [1] }, // Monday
			enabled: true,
			preceptor_id: 'test-preceptor'
		};

		const dates = generateDatesFromPattern(pattern);

		expect(dates).toContain('2025-01-06'); // Monday
		expect(dates).toHaveLength(1);
	});

	it('should return empty array for disabled pattern', () => {
		const pattern: CreatePattern = {
			pattern_type: 'weekly',
			is_available: true,
			specificity: 1,
			date_range_start: '2025-01-01',
			date_range_end: '2025-01-07',
			config: { days_of_week: [1] },
			enabled: false,
			preceptor_id: 'test-preceptor'
		};

		const dates = generateDatesFromPattern(pattern);

		expect(dates).toEqual([]);
	});
});

// ========================================
// Edge Cases and Integration Tests
// ========================================

describe('edge cases', () => {
	it('should handle leap year correctly', () => {
		const dates = generateMonthlyDates(
			'2024-02-01',
			'2024-02-29', // 2024 is a leap year
			{
				monthly_type: 'specific_days',
				specific_days: [29]
			}
		);

		expect(dates).toContain('2024-02-29');
	});

	it('should handle year boundary in weekly pattern', () => {
		const dates = generateWeeklyDates(
			'2024-12-30', // Monday
			'2025-01-06', // Monday
			{ days_of_week: [1] } // Monday
		);

		expect(dates).toContain('2024-12-30');
		expect(dates).toContain('2025-01-06');
	});

	it('should generate correct day-of-week for Mon/Wed/Fri pattern (timezone regression test)', () => {
		// This test catches the timezone bug where dates were shifted by one day
		// Bug: Mon/Wed/Fri pattern produced Sun/Tues/Thurs due to UTC/local timezone mismatch
		const dates = generateWeeklyDates(
			'2025-12-01', // Monday Dec 1, 2025
			'2025-12-31',
			{ days_of_week: [1, 3, 5] } // Mon=1, Wed=3, Fri=5
		);

		// Verify each generated date actually falls on Mon, Wed, or Fri
		for (const dateStr of dates) {
			const date = parseDate(dateStr);
			const dayOfWeek = date.getUTCDay();
			expect([1, 3, 5]).toContain(dayOfWeek);
		}

		// Verify specific dates are correct day of week
		expect(dates).toContain('2025-12-01'); // Monday
		expect(dates).toContain('2025-12-03'); // Wednesday
		expect(dates).toContain('2025-12-05'); // Friday

		// Verify Sunday/Tuesday/Thursday are NOT included (the bug would include these)
		expect(dates).not.toContain('2025-11-30'); // Sunday Nov 30
		expect(dates).not.toContain('2025-12-02'); // Tuesday
		expect(dates).not.toContain('2025-12-04'); // Thursday
	});

	it('should generate weekend dates on actual weekends (timezone regression test)', () => {
		// Another timezone regression test: verify Sat/Sun pattern produces actual weekends
		const dates = generateWeeklyDates(
			'2025-12-01',
			'2025-12-14',
			{ days_of_week: [0, 6] } // Sun=0, Sat=6
		);

		// Verify each generated date is actually a weekend
		for (const dateStr of dates) {
			const date = parseDate(dateStr);
			const dayOfWeek = date.getUTCDay();
			expect([0, 6]).toContain(dayOfWeek);
		}

		// December 2025 weekends
		expect(dates).toContain('2025-12-06'); // Saturday
		expect(dates).toContain('2025-12-07'); // Sunday
		expect(dates).toContain('2025-12-13'); // Saturday
		expect(dates).toContain('2025-12-14'); // Sunday

		// Verify weekdays are NOT included
		expect(dates).not.toContain('2025-12-01'); // Monday
		expect(dates).not.toContain('2025-12-05'); // Friday
	});

	it('should handle complex multi-pattern scenario', () => {
		const patterns: CreatePattern[] = [
			// Available Mon-Fri all year
			{
				pattern_type: 'weekly',
				is_available: true,
				specificity: 1,
				date_range_start: '2025-01-01',
				date_range_end: '2025-12-31',
				config: { days_of_week: [1, 2, 3, 4, 5] },
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			// Unavailable for 2 weeks in July
			{
				pattern_type: 'block',
				is_available: false,
				specificity: 2,
				date_range_start: '2025-07-01',
				date_range_end: '2025-07-14',
				config: { exclude_weekends: false },
				enabled: true,
				preceptor_id: 'test-preceptor'
			},
			// Available on July 4th (individual override)
			{
				pattern_type: 'individual',
				is_available: true,
				specificity: 3,
				date_range_start: '2025-07-04',
				date_range_end: '2025-07-04',
				config: null,
				enabled: true,
				preceptor_id: 'test-preceptor'
			}
		];

		const result = applyPatternsBySpecificity(patterns);

		// June 30 (Mon) - should be available
		const jun30 = result.find(d => d.date === '2025-06-30');
		expect(jun30?.is_available).toBe(true);

		// July 1 (Tue) - should be unavailable (vacation block)
		const jul1 = result.find(d => d.date === '2025-07-01');
		expect(jul1?.is_available).toBe(false);

		// July 4 (Fri) - should be available (individual override)
		const jul4 = result.find(d => d.date === '2025-07-04');
		expect(jul4?.is_available).toBe(true);
		expect(jul4?.source_pattern_type).toBe('individual');

		// July 15 (Tue) - should be available (after vacation)
		const jul15 = result.find(d => d.date === '2025-07-15');
		expect(jul15?.is_available).toBe(true);
	});
});
