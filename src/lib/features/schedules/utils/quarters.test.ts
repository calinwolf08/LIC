import { describe, expect, it } from 'vitest';
import { addDays, addMonths, nextQuarter, validateQuarters } from './quarters';

const YEAR = { start_date: '2026-07-01', end_date: '2027-06-30' };

describe('date helpers', () => {
	it('adds days across month and year ends', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('adds months, clamping to a shorter month', () => {
		expect(addMonths('2026-07-01', 3)).toBe('2026-10-01');
		expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
		expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
	});
});

describe('nextQuarter', () => {
	it('starts Q1 on the schedule start and runs three months', () => {
		expect(nextQuarter([], YEAR)).toEqual({
			name: 'Q1',
			start_date: '2026-07-01',
			end_date: '2026-09-30'
		});
	});

	it('starts the day after the latest quarter ends and numbers on', () => {
		const q1 = nextQuarter([], YEAR)!;
		const q2 = nextQuarter([q1], YEAR)!;
		expect(q2).toEqual({ name: 'Q2', start_date: '2026-10-01', end_date: '2026-12-31' });
		const q3 = nextQuarter([q1, q2], YEAR)!;
		const q4 = nextQuarter([q1, q2, q3], YEAR)!;
		expect([q3.name, q3.start_date, q4.name, q4.end_date]).toEqual([
			'Q3',
			'2027-01-01',
			'Q4',
			'2027-06-30'
		]);
	});

	it('caps the last quarter at the schedule end', () => {
		const short = { start_date: '2026-07-01', end_date: '2026-08-15' };
		expect(nextQuarter([], short)?.end_date).toBe('2026-08-15');
	});

	it('returns null when the latest quarter already reaches the schedule end', () => {
		expect(
			nextQuarter([{ name: 'All', start_date: '2026-07-01', end_date: '2027-06-30' }], YEAR)
		).toBeNull();
	});

	it('chains from the latest end even when quarters are out of order or renamed', () => {
		const next = nextQuarter(
			[
				{ name: 'Spring', start_date: '2027-01-01', end_date: '2027-03-31' },
				{ name: 'Fall', start_date: '2026-07-01', end_date: '2026-12-31' }
			],
			YEAR
		);
		expect(next).toEqual({ name: 'Q3', start_date: '2027-04-01', end_date: '2027-06-30' });
	});

	it('returns null when the schedule has no dates', () => {
		expect(nextQuarter([], { start_date: '', end_date: '' })).toBeNull();
	});
});

describe('validateQuarters', () => {
	it('accepts back-to-back quarters inside the schedule', () => {
		expect(
			validateQuarters(
				[
					{ name: 'Q1', start_date: '2026-07-01', end_date: '2026-09-30' },
					{ name: 'Q2', start_date: '2026-10-01', end_date: '2026-12-31' }
				],
				YEAR
			)
		).toEqual([]);
	});

	it('flags a missing name, missing dates and a reversed range', () => {
		const issues = validateQuarters(
			[
				{ name: '', start_date: '2026-07-01', end_date: '2026-07-31' },
				{ name: 'Q2', start_date: '', end_date: '2026-09-30' },
				{ name: 'Q3', start_date: '2026-12-01', end_date: '2026-11-01' }
			],
			YEAR
		);
		expect(issues).toEqual([
			{ index: 0, message: 'Quarter 1 needs a name' },
			{ index: 1, message: 'Q2 needs a start and an end date' },
			{ index: 2, message: 'Q3 ends before it starts' }
		]);
	});

	it('flags a quarter outside the schedule', () => {
		const issues = validateQuarters(
			[{ name: 'Q4', start_date: '2027-04-01', end_date: '2027-07-31' }],
			YEAR
		);
		expect(issues).toEqual([
			{ index: 0, message: 'Q4 must fall within the schedule (2026-07-01 to 2027-06-30)' }
		]);
	});

	it('flags overlapping quarters, including a shared boundary day', () => {
		const issues = validateQuarters(
			[
				{ name: 'Q1', start_date: '2026-07-01', end_date: '2026-09-30' },
				{ name: 'Q2', start_date: '2026-09-30', end_date: '2026-12-31' }
			],
			YEAR
		);
		expect(issues).toEqual([{ index: 1, message: 'Q2 overlaps Q1' }]);
	});
});
