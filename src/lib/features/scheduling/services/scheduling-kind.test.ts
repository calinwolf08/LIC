import { describe, it, expect } from 'vitest';
import {
	weekKey,
	blockWeeksOf,
	normalizeSchedulingKind,
	type SchedulingKind
} from './scheduling-kind';

describe('scheduling-kind week derivation (L3)', () => {
	describe('weekKey', () => {
		it('maps every weekday of one Mon–Sun span to the same Monday', () => {
			// 2026-01-05 is a Monday.
			const days = [
				'2026-01-05', // Mon
				'2026-01-06', // Tue
				'2026-01-07', // Wed
				'2026-01-08', // Thu
				'2026-01-09', // Fri
				'2026-01-10', // Sat
				'2026-01-11' // Sun
			];
			for (const d of days) expect(weekKey(d)).toBe('2026-01-05');
		});

		it('puts the next Monday in a different week (partial-week boundary)', () => {
			expect(weekKey('2026-01-11')).toBe('2026-01-05'); // Sun
			expect(weekKey('2026-01-12')).toBe('2026-01-12'); // next Mon
			expect(weekKey('2026-01-11')).not.toBe(weekKey('2026-01-12'));
		});

		it('is stable across month and year boundaries', () => {
			// 2025-12-29 (Mon) … 2026-01-04 (Sun) are one week.
			expect(weekKey('2025-12-31')).toBe('2025-12-29');
			expect(weekKey('2026-01-01')).toBe('2025-12-29');
			expect(weekKey('2026-01-04')).toBe('2025-12-29');
			expect(weekKey('2026-01-05')).toBe('2026-01-05');
		});
	});

	describe('blockWeeksOf', () => {
		const row = (date: string, kind: SchedulingKind) => ({ date, kind });

		it('derives exactly the weeks consumed by block assignments', () => {
			const weeks = blockWeeksOf([
				row('2026-01-06', 'block'), // week of 01-05
				row('2026-01-08', 'block'), // same week 01-05
				row('2026-01-13', 'block'), // week of 01-12
				row('2026-01-20', 'scattered') // not a block → ignored
			]);
			expect([...weeks].sort()).toEqual(['2026-01-05', '2026-01-12']);
		});

		it('N block weeks reduce scattered availability by exactly those weeks', () => {
			// Three distinct block weeks; a fourth week has only scattered days.
			const blockWeeks = blockWeeksOf([
				row('2026-02-02', 'block'),
				row('2026-02-09', 'block'),
				row('2026-02-16', 'block')
			]);
			expect(blockWeeks.size).toBe(3);

			// A scattered day in each block week is unavailable; one in a free week is fine.
			const scatteredDays = ['2026-02-03', '2026-02-10', '2026-02-17', '2026-02-24'];
			const blocked = scatteredDays.filter((d) => blockWeeks.has(weekKey(d)));
			const free = scatteredDays.filter((d) => !blockWeeks.has(weekKey(d)));
			expect(blocked).toEqual(['2026-02-03', '2026-02-10', '2026-02-17']);
			expect(free).toEqual(['2026-02-24']);
		});

		it('returns an empty set when there are no block rows', () => {
			expect(blockWeeksOf([row('2026-01-06', 'scattered')]).size).toBe(0);
			expect(blockWeeksOf([]).size).toBe(0);
		});
	});

	describe('normalizeSchedulingKind', () => {
		it('treats only the literal "block" as block, everything else scattered', () => {
			expect(normalizeSchedulingKind('block')).toBe('block');
			expect(normalizeSchedulingKind('scattered')).toBe('scattered');
			expect(normalizeSchedulingKind(null)).toBe('scattered');
			expect(normalizeSchedulingKind(undefined)).toBe('scattered');
			expect(normalizeSchedulingKind('nonsense')).toBe('scattered');
		});
	});
});
