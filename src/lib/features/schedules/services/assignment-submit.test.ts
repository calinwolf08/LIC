import { describe, it, expect } from 'vitest';
import { analyseSelection, buildSubmitPayload, type FlagAnalysis } from './assignment-submit';
import type { DayState } from '$lib/features/scheduling/services/assignment-day-state';

function day(date: string, overrides: Partial<DayState> = {}): DayState {
	return {
		date,
		inRange: true,
		state: 'available',
		preceptorBookings: [],
		preceptorAtCapacity: false,
		studentBusy: false,
		studentBookedCredit: 0,
		studentSessions: [],
		availableSession: null,
		availableCredit: null,
		isPast: false,
		...overrides
	};
}

/** A day the student already has a full-day assignment on (for session-clash cases). */
function booked(date: string, overrides: Partial<DayState> = {}): DayState {
	return day(date, {
		studentBusy: true,
		studentBookedCredit: 1,
		studentSessions: ['full'],
		...overrides
	});
}

const selection = {
	studentId: 'stu-1',
	preceptorId: 'prec-1',
	clerkshipId: 'clerk-1',
	siteId: 'site-1'
};

describe('analyseSelection', () => {
	it('submits every day when nothing is flagged', () => {
		const r = analyseSelection(
			['2030-03-05', '2030-03-06'],
			[day('2030-03-05'), day('2030-03-06')]
		);
		expect(r.blockedDates).toEqual([]);
		expect(r.submittableDates).toEqual(['2030-03-05', '2030-03-06']);
		expect(r.categories).toEqual([]);
	});

	it('flags a full-day clash as session_clash — submittable, overridable (L1)', () => {
		const r = analyseSelection(
			['2030-03-05', '2030-03-06'],
			[booked('2030-03-05'), day('2030-03-06')],
			{},
			'full'
		);
		// No longer a hard block: both days submit, the booked one carries the warning.
		expect(r.blockedDates).toEqual([]);
		expect(r.submittableDates).toEqual(['2030-03-05', '2030-03-06']);
		expect(r.categories.map((c) => c.category)).toEqual(['session_clash']);
		expect(r.categories[0].dates).toEqual(['2030-03-05']);
	});

	it('lets an afternoon pass cleanly when the student already has a morning (AM + PM)', () => {
		const r = analyseSelection(
			['2030-03-05'],
			[day('2030-03-05', { studentBusy: true, studentBookedCredit: 0.5, studentSessions: ['am'] })],
			{},
			'pm'
		);
		expect(r.submittableDates).toEqual(['2030-03-05']);
		expect(r.categories).toEqual([]);
	});

	it('flags a second morning as a session clash (AM + AM)', () => {
		const r = analyseSelection(
			['2030-03-05'],
			[day('2030-03-05', { studentBusy: true, studentBookedCredit: 0.5, studentSessions: ['am'] })],
			{},
			'am'
		);
		expect(r.categories.map((c) => c.category)).toEqual(['session_clash']);
	});

	it('groups flagged days by category', () => {
		const r = analyseSelection(
			['2030-03-05', '2030-03-06', '2030-03-07'],
			[
				day('2030-03-05', { state: 'unavailable' }),
				day('2030-03-06', { state: 'unavailable' }),
				day('2030-03-07', { state: 'blackout' })
			]
		);
		expect(r.categories.map((c) => c.category)).toEqual(['preceptor_unavailable', 'blackout_date']);
		expect(r.categories[0].dates).toEqual(['2030-03-05', '2030-03-06']);
		expect(r.categories[1].dates).toEqual(['2030-03-07']);
	});

	it('collects the occupying students for a capacity clash, without duplicates', () => {
		const occupant = { assignmentId: 'a-1', studentId: 'stu-2', studentName: 'Bob' };
		const r = analyseSelection(
			['2030-03-05', '2030-03-06'],
			[
				day('2030-03-05', { preceptorAtCapacity: true, preceptorBookings: [occupant] }),
				day('2030-03-06', { preceptorAtCapacity: true, preceptorBookings: [occupant] })
			]
		);
		expect(r.categories[0].category).toBe('preceptor_capacity');
		expect(r.categories[0].occupants).toEqual([occupant]);
	});

	it('flags past days', () => {
		const r = analyseSelection(['2030-03-05'], [day('2030-03-05', { isPast: true })]);
		expect(r.categories.map((c) => c.category)).toEqual(['past_date']);
	});

	it('adds selection-wide categories with no specific dates', () => {
		const r = analyseSelection(['2030-03-05'], [day('2030-03-05')], {
			overRequired: true,
			notOnboarded: true
		});
		expect(r.categories.map((c) => c.category)).toEqual(['not_onboarded', 'over_required_days']);
		expect(r.categories[0].dates).toEqual([]);
	});

	it('keeps selection-wide categories on a clashing (still submittable) day', () => {
		const r = analyseSelection(['2030-03-05'], [booked('2030-03-05')], { overRequired: true }, 'full');
		// The day is submittable now, so both the session-clash warning and the
		// selection-wide over-required category apply.
		expect(r.submittableDates).toEqual(['2030-03-05']);
		expect(r.categories.map((c) => c.category)).toEqual(['session_clash', 'over_required_days']);
	});

	it('sorts the selection and reports categories in conversation order', () => {
		const r = analyseSelection(
			['2030-03-07', '2030-03-05'],
			[day('2030-03-05', { isPast: true }), day('2030-03-07', { state: 'unavailable' })]
		);
		expect(r.submittableDates).toEqual(['2030-03-05', '2030-03-07']);
		expect(r.categories.map((c) => c.category)).toEqual(['preceptor_unavailable', 'past_date']);
	});

	it('treats a day with no state entry as unflagged', () => {
		const r = analyseSelection(['2030-03-05'], []);
		expect(r.submittableDates).toEqual(['2030-03-05']);
		expect(r.categories).toEqual([]);
	});
});

describe('buildSubmitPayload', () => {
	const analysis: FlagAnalysis = analyseSelection(
		['2030-03-05', '2030-03-06'],
		[day('2030-03-05', { state: 'unavailable' }), day('2030-03-06')]
	);

	it('submits every selected day (nothing is hard-blocked anymore)', () => {
		const payload = buildSubmitPayload(selection, analysis, ['preceptor_unavailable']);
		expect(payload.dates).toEqual(['2030-03-05', '2030-03-06']);
	});

	it('carries the accepted codes', () => {
		const payload = buildSubmitPayload(selection, analysis, ['preceptor_unavailable']);
		expect(payload.override_codes).toEqual(['preceptor_unavailable']);
	});

	it('drops accepted codes that were never flagged', () => {
		const payload = buildSubmitPayload(selection, analysis, [
			'preceptor_unavailable',
			'blackout_date'
		]);
		expect(payload.override_codes).toEqual(['preceptor_unavailable']);
	});

	it('de-duplicates accepted codes', () => {
		const payload = buildSubmitPayload(selection, analysis, [
			'preceptor_unavailable',
			'preceptor_unavailable'
		]);
		expect(payload.override_codes).toEqual(['preceptor_unavailable']);
	});

	it('includes the note only when something was actually overridden', () => {
		const withOverride = buildSubmitPayload(
			{ ...selection, note: 'agreed with the preceptor' },
			analysis,
			['preceptor_unavailable']
		);
		expect(withOverride.override_note).toBe('agreed with the preceptor');

		const clean = analyseSelection(['2030-03-05'], [day('2030-03-05')]);
		const withoutOverride = buildSubmitPayload({ ...selection, note: 'irrelevant' }, clean, []);
		expect(withoutOverride.override_note).toBeUndefined();
	});

	it('includes only the chosen side effects', () => {
		const payload = buildSubmitPayload(selection, analysis, ['preceptor_unavailable'], [
			{
				kind: 'mark_preceptor_available',
				preceptor_id: 'prec-1',
				site_id: 'site-1',
				dates: ['2030-03-05']
			}
		]);
		expect(payload.side_effects).toHaveLength(1);
		expect(payload.side_effects?.[0].kind).toBe('mark_preceptor_available');

		const none = buildSubmitPayload(selection, analysis, ['preceptor_unavailable']);
		expect(none.side_effects).toBeUndefined();
	});

	it('normalises an empty site to null and defaults locked to false', () => {
		const payload = buildSubmitPayload({ ...selection, siteId: '' }, analysis, []);
		expect(payload.site_id).toBeNull();
		expect(payload.locked).toBe(false);
	});
});
