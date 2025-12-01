// @ts-nocheck
/**
 * Date Utils Unit Tests
 *
 * Tests for date manipulation and scheduling date utilities.
 * These tests ensure consistent UTC date handling to prevent timezone bugs.
 */

import { describe, it, expect } from 'vitest';
import {
	parseUTCDate,
	formatUTCDate,
	getUTCDayOfWeek,
	getDayName,
	isWeekend,
	getTodayUTC,
	getDaysBetween,
	getSchedulingDates,
	getMonthsBetween,
	getLastDayOfMonth,
	formatDisplayDate,
	formatMonthYear,
	formatToISODate
} from './date-utils';

// ============================================================================
// Core UTC Functions - Critical for preventing timezone bugs
// ============================================================================

describe('parseUTCDate() - Timezone Safety', () => {
	it('parses date string as UTC midnight', () => {
		const date = parseUTCDate('2025-12-01');
		expect(date.getUTCFullYear()).toBe(2025);
		expect(date.getUTCMonth()).toBe(11); // December is 11
		expect(date.getUTCDate()).toBe(1);
		expect(date.getUTCHours()).toBe(0);
		expect(date.getUTCMinutes()).toBe(0);
	});

	it('does NOT shift date due to timezone (critical regression test)', () => {
		// This is the critical test - Dec 1 should stay Dec 1, not become Nov 30
		const date = parseUTCDate('2025-12-01');
		const formatted = formatUTCDate(date);
		expect(formatted).toBe('2025-12-01');
	});

	it('handles year boundary correctly', () => {
		const date = parseUTCDate('2025-01-01');
		expect(date.getUTCFullYear()).toBe(2025);
		expect(date.getUTCMonth()).toBe(0);
		expect(date.getUTCDate()).toBe(1);
	});

	it('handles leap year date', () => {
		const date = parseUTCDate('2024-02-29');
		expect(date.getUTCMonth()).toBe(1);
		expect(date.getUTCDate()).toBe(29);
	});
});

describe('formatUTCDate()', () => {
	it('formats date to YYYY-MM-DD using UTC', () => {
		const date = new Date(Date.UTC(2025, 11, 1, 0, 0, 0)); // Dec 1, 2025
		expect(formatUTCDate(date)).toBe('2025-12-01');
	});

	it('pads single-digit months and days', () => {
		const date = new Date(Date.UTC(2025, 2, 5)); // March 5
		expect(formatUTCDate(date)).toBe('2025-03-05');
	});

	it('handles end of year', () => {
		const date = new Date(Date.UTC(2024, 11, 31)); // Dec 31
		expect(formatUTCDate(date)).toBe('2024-12-31');
	});

	it('round-trips with parseUTCDate correctly', () => {
		const original = '2025-12-15';
		const parsed = parseUTCDate(original);
		const formatted = formatUTCDate(parsed);
		expect(formatted).toBe(original);
	});
});

describe('getUTCDayOfWeek()', () => {
	it('returns 0 for Sunday', () => {
		expect(getUTCDayOfWeek('2025-12-07')).toBe(0); // Dec 7, 2025 is Sunday
	});

	it('returns 1 for Monday', () => {
		expect(getUTCDayOfWeek('2025-12-01')).toBe(1); // Dec 1, 2025 is Monday
	});

	it('returns 5 for Friday', () => {
		expect(getUTCDayOfWeek('2025-12-05')).toBe(5); // Dec 5, 2025 is Friday
	});

	it('returns 6 for Saturday', () => {
		expect(getUTCDayOfWeek('2025-12-06')).toBe(6); // Dec 6, 2025 is Saturday
	});
});

describe('getDayName()', () => {
	it('returns short day names by default', () => {
		expect(getDayName('2025-12-01')).toBe('Mon');
		expect(getDayName('2025-12-03')).toBe('Wed');
		expect(getDayName('2025-12-05')).toBe('Fri');
	});

	it('returns long day names when specified', () => {
		expect(getDayName('2025-12-01', 'long')).toBe('Monday');
		expect(getDayName('2025-12-03', 'long')).toBe('Wednesday');
		expect(getDayName('2025-12-05', 'long')).toBe('Friday');
	});
});

describe('isWeekend()', () => {
	it('returns true for Saturday', () => {
		expect(isWeekend('2025-12-06')).toBe(true);
	});

	it('returns true for Sunday', () => {
		expect(isWeekend('2025-12-07')).toBe(true);
	});

	it('returns false for weekdays', () => {
		expect(isWeekend('2025-12-01')).toBe(false); // Monday
		expect(isWeekend('2025-12-02')).toBe(false); // Tuesday
		expect(isWeekend('2025-12-03')).toBe(false); // Wednesday
		expect(isWeekend('2025-12-04')).toBe(false); // Thursday
		expect(isWeekend('2025-12-05')).toBe(false); // Friday
	});
});

describe('getTodayUTC()', () => {
	it('returns a valid date string in YYYY-MM-DD format', () => {
		const today = getTodayUTC();
		expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('returns a date that can be parsed', () => {
		const today = getTodayUTC();
		const parsed = parseUTCDate(today);
		expect(parsed).toBeInstanceOf(Date);
		expect(isNaN(parsed.getTime())).toBe(false);
	});
});

// ============================================================================
// Date Range Functions
// ============================================================================

describe('getMonthsBetween()', () => {
	it('returns single month for same-month range', () => {
		const months = getMonthsBetween('2025-12-01', '2025-12-31');
		expect(months).toHaveLength(1);
		expect(months[0].year).toBe(2025);
		expect(months[0].month).toBe(12);
		expect(months[0].name).toBe('December 2025');
	});

	it('returns multiple months for multi-month range', () => {
		const months = getMonthsBetween('2025-11-01', '2026-02-15');
		expect(months).toHaveLength(4);
		expect(months[0].name).toBe('November 2025');
		expect(months[1].name).toBe('December 2025');
		expect(months[2].name).toBe('January 2026');
		expect(months[3].name).toBe('February 2026');
	});

	it('handles year boundary', () => {
		const months = getMonthsBetween('2025-12-15', '2026-01-15');
		expect(months).toHaveLength(2);
		expect(months[0].year).toBe(2025);
		expect(months[1].year).toBe(2026);
	});
});

describe('getLastDayOfMonth()', () => {
	it('returns 31 for January', () => {
		expect(getLastDayOfMonth(2025, 1)).toBe(31);
	});

	it('returns 28 for February in non-leap year', () => {
		expect(getLastDayOfMonth(2025, 2)).toBe(28);
	});

	it('returns 29 for February in leap year', () => {
		expect(getLastDayOfMonth(2024, 2)).toBe(29);
	});

	it('returns 30 for April', () => {
		expect(getLastDayOfMonth(2025, 4)).toBe(30);
	});

	it('returns 31 for December', () => {
		expect(getLastDayOfMonth(2025, 12)).toBe(31);
	});
});

// ============================================================================
// Display Formatting Functions
// ============================================================================

describe('formatDisplayDate()', () => {
	it('formats date with default options', () => {
		const formatted = formatDisplayDate('2025-12-01');
		// Should include weekday, year, month, day
		expect(formatted).toContain('Mon');
		expect(formatted).toContain('Dec');
		expect(formatted).toContain('2025');
	});

	it('respects custom options', () => {
		const formatted = formatDisplayDate('2025-12-01', { weekday: 'long', month: 'long' });
		expect(formatted).toContain('Monday');
		expect(formatted).toContain('December');
	});
});

describe('formatMonthYear()', () => {
	it('formats as month and year', () => {
		const formatted = formatMonthYear('2025-12-15');
		expect(formatted).toContain('December');
		expect(formatted).toContain('2025');
	});
});

// ============================================================================
// Timezone Regression Tests
// ============================================================================

describe('Timezone Regression Tests', () => {
	it('Mon/Wed/Fri pattern stays Mon/Wed/Fri (Dec 2025)', () => {
		// Dec 1, 2025 is Monday - critical test date
		const dates = ['2025-12-01', '2025-12-03', '2025-12-05'];
		const expectedDays = [1, 3, 5]; // Mon, Wed, Fri

		for (let i = 0; i < dates.length; i++) {
			const dayOfWeek = getUTCDayOfWeek(dates[i]);
			expect(dayOfWeek, `Date ${dates[i]} should be day ${expectedDays[i]}`).toBe(expectedDays[i]);
		}
	});

	it('getDaysBetween preserves correct dates across month range', () => {
		const days = getDaysBetween('2025-12-01', '2025-12-07');

		// First day should be Dec 1 (Monday)
		expect(days[0]).toBe('2025-12-01');
		expect(getUTCDayOfWeek(days[0])).toBe(1);

		// Days should be consecutive
		expect(days).toEqual([
			'2025-12-01',
			'2025-12-02',
			'2025-12-03',
			'2025-12-04',
			'2025-12-05',
			'2025-12-06',
			'2025-12-07'
		]);
	});

	it('date iteration does not shift by timezone offset', () => {
		// Start from Dec 1, iterate 7 days
		const start = parseUTCDate('2025-12-01');
		const dates: string[] = [];
		const current = new Date(start);

		for (let i = 0; i < 7; i++) {
			dates.push(formatUTCDate(current));
			current.setUTCDate(current.getUTCDate() + 1);
		}

		// Should get Dec 1-7, not Nov 30 - Dec 6
		expect(dates[0]).toBe('2025-12-01');
		expect(dates[6]).toBe('2025-12-07');
	});
});

// ============================================================================
// Legacy Tests (keeping for backward compatibility)
// ============================================================================

describe('formatToISODate()', () => {
	it('formats date to ISO date string (YYYY-MM-DD)', () => {
		const date = new Date('2024-01-15T10:30:00.000Z');
		const result = formatToISODate(date);
		expect(result).toBe('2024-01-15');
	});

	it('handles dates at start of year', () => {
		const date = new Date('2024-01-01T00:00:00.000Z');
		const result = formatToISODate(date);
		expect(result).toBe('2024-01-01');
	});

	it('handles dates at end of year', () => {
		const date = new Date('2024-12-31T23:59:59.000Z');
		const result = formatToISODate(date);
		expect(result).toBe('2024-12-31');
	});

	it('handles leap year date', () => {
		const date = new Date('2024-02-29T12:00:00.000Z');
		const result = formatToISODate(date);
		expect(result).toBe('2024-02-29');
	});

	it('pads single-digit months and days with zeros', () => {
		const date = new Date('2024-03-05T12:00:00.000Z');
		const result = formatToISODate(date);
		expect(result).toBe('2024-03-05');
	});
});

describe('getDaysBetween()', () => {
	it('returns single day when start equals end', () => {
		const result = getDaysBetween('2024-01-15', '2024-01-15');
		expect(result).toEqual(['2024-01-15']);
	});

	it('returns consecutive days for multi-day range', () => {
		const result = getDaysBetween('2024-01-01', '2024-01-05');
		expect(result).toEqual([
			'2024-01-01',
			'2024-01-02',
			'2024-01-03',
			'2024-01-04',
			'2024-01-05'
		]);
	});

	it('handles month boundary', () => {
		const result = getDaysBetween('2024-01-30', '2024-02-02');
		expect(result).toEqual(['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02']);
	});

	it('handles year boundary', () => {
		const result = getDaysBetween('2023-12-30', '2024-01-02');
		expect(result).toEqual(['2023-12-30', '2023-12-31', '2024-01-01', '2024-01-02']);
	});

	it('handles leap year February', () => {
		const result = getDaysBetween('2024-02-28', '2024-03-01');
		expect(result).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
	});

	it('handles non-leap year February', () => {
		const result = getDaysBetween('2023-02-28', '2023-03-01');
		expect(result).toEqual(['2023-02-28', '2023-03-01']);
	});

	it('returns correct count for one week', () => {
		const result = getDaysBetween('2024-01-01', '2024-01-07');
		expect(result).toHaveLength(7);
	});

	it('returns correct count for one month (30 days)', () => {
		const result = getDaysBetween('2024-04-01', '2024-04-30');
		expect(result).toHaveLength(30);
	});

	it('returns correct count for one month (31 days)', () => {
		const result = getDaysBetween('2024-01-01', '2024-01-31');
		expect(result).toHaveLength(31);
	});

	it('returns all dates in chronological order', () => {
		const result = getDaysBetween('2024-01-10', '2024-01-15');
		for (let i = 1; i < result.length; i++) {
			expect(new Date(result[i]).getTime()).toBeGreaterThan(new Date(result[i - 1]).getTime());
		}
	});

	it('handles empty range (end before start) gracefully', () => {
		const result = getDaysBetween('2024-01-15', '2024-01-10');
		expect(result).toEqual([]);
	});
});

describe('getSchedulingDates()', () => {
	it('returns all dates when no blackouts', () => {
		const blackouts = new Set<string>();
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual([
			'2024-01-01',
			'2024-01-02',
			'2024-01-03',
			'2024-01-04',
			'2024-01-05'
		]);
	});

	it('excludes blackout dates', () => {
		const blackouts = new Set(['2024-01-02', '2024-01-04']);
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
	});

	it('handles all dates blacked out', () => {
		const blackouts = new Set(['2024-01-01', '2024-01-02', '2024-01-03']);
		const result = getSchedulingDates('2024-01-01', '2024-01-03', blackouts);
		expect(result).toEqual([]);
	});

	it('ignores blackout dates outside the range', () => {
		const blackouts = new Set(['2023-12-31', '2024-01-10']);
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual([
			'2024-01-01',
			'2024-01-02',
			'2024-01-03',
			'2024-01-04',
			'2024-01-05'
		]);
	});

	it('handles single day range with no blackout', () => {
		const blackouts = new Set<string>();
		const result = getSchedulingDates('2024-01-15', '2024-01-15', blackouts);
		expect(result).toEqual(['2024-01-15']);
	});

	it('handles single day range with blackout', () => {
		const blackouts = new Set(['2024-01-15']);
		const result = getSchedulingDates('2024-01-15', '2024-01-15', blackouts);
		expect(result).toEqual([]);
	});

	it('excludes multiple consecutive blackout dates', () => {
		const blackouts = new Set(['2024-01-02', '2024-01-03', '2024-01-04']);
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual(['2024-01-01', '2024-01-05']);
	});

	it('excludes first day when blacked out', () => {
		const blackouts = new Set(['2024-01-01']);
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual(['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
	});

	it('excludes last day when blacked out', () => {
		const blackouts = new Set(['2024-01-05']);
		const result = getSchedulingDates('2024-01-01', '2024-01-05', blackouts);
		expect(result).toEqual(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']);
	});

	it('handles holidays/weekends pattern', () => {
		const blackouts = new Set([
			'2024-12-25', // Christmas
			'2024-12-26', // Boxing Day
			'2024-01-01' // New Year
		]);
		const result = getSchedulingDates('2024-12-23', '2024-12-27', blackouts);
		expect(result).toEqual(['2024-12-23', '2024-12-24', '2024-12-27']);
	});
});
