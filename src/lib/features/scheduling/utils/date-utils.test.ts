/**
 * Date Utils Unit Tests
 *
 * Tests for date manipulation and scheduling date utilities
 */

import { describe, it, expect } from 'vitest';
import { getDaysBetween, formatToISODate, getSchedulingDates } from './date-utils';

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
