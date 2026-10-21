import { describe, expect, it } from 'vitest';
import {
	emptyPreceptorFitData,
	preceptorFitViolations,
	type PreceptorFitCandidate,
	type PreceptorFitData
} from './preceptor-fit';

const P = 'prec';
const CLINIC = 'site-clinic';
const HOSPITAL = 'site-hospital';

function data(build: (d: PreceptorFitData) => void): PreceptorFitData {
	const d = emptyPreceptorFitData();
	build(d);
	return d;
}

function available(
	d: PreceptorFitData,
	date: string,
	session: 'full' | 'am' | 'pm',
	site = CLINIC
) {
	d.withAvailability.add(P);
	const byDate = d.available.get(P) ?? new Map();
	byDate.set(date, [...(byDate.get(date) ?? []), { session, siteId: site }]);
	d.available.set(P, byDate);
}

const codes = (d: PreceptorFitData, c: Partial<PreceptorFitCandidate>) =>
	preceptorFitViolations(d, { preceptorId: P, date: '2026-11-02', ...c }).map((v) => v.code);

describe('preceptorFitViolations', () => {
	it('does not restrict a preceptor with no availability set up', () => {
		expect(codes(emptyPreceptorFitData(), { siteId: CLINIC })).toEqual([]);
	});

	it('flags a day explicitly marked unavailable', () => {
		const d = data((d) => d.unavailable.set(P, new Set(['2026-11-02'])));
		expect(codes(d, {})).toEqual(['preceptor_unavailable']);
	});

	it('flags a day with no availability once the preceptor has available days', () => {
		const d = data((d) => available(d, '2026-11-03', 'full'));
		expect(codes(d, { date: '2026-11-02' })).toEqual(['preceptor_unavailable']);
		expect(codes(d, { date: '2026-11-03' })).toEqual([]);
	});

	it('checks the session: AM-only availability does not cover a full day or PM', () => {
		const d = data((d) => available(d, '2026-11-02', 'am'));
		expect(codes(d, { session: 'am' })).toEqual([]);
		expect(codes(d, { session: 'pm' })).toEqual(['preceptor_unavailable']);
		expect(codes(d, { session: 'full' })).toEqual(['preceptor_unavailable']);
	});

	it('treats AM + PM availability as covering a full day', () => {
		const d = data((d) => {
			available(d, '2026-11-02', 'am');
			available(d, '2026-11-02', 'pm');
		});
		expect(codes(d, { session: 'full' })).toEqual([]);
	});

	it('flags a site other than where the preceptor is available that day', () => {
		const d = data((d) => available(d, '2026-11-02', 'full', HOSPITAL));
		expect(codes(d, { siteId: CLINIC })).toEqual(['preceptor_wrong_site']);
		expect(codes(d, { siteId: HOSPITAL })).toEqual([]);
	});

	it("falls back to the preceptor's sites when they have no availability that day", () => {
		const d = data((d) => d.sites.set(P, new Set([HOSPITAL])));
		expect(codes(d, { siteId: CLINIC })).toEqual(['preceptor_wrong_site']);
		expect(codes(d, { siteId: HOSPITAL })).toEqual([]);
	});

	it('flags a clerkship whose teams do not include the preceptor', () => {
		const d = data((d) => {
			d.clerkshipTeams.set('clerk-im', new Set(['someone-else']));
			d.clerkshipTeams.set('clerk-fm', new Set([P]));
		});
		expect(codes(d, { clerkshipId: 'clerk-im' })).toEqual(['preceptor_not_teaching']);
		expect(codes(d, { clerkshipId: 'clerk-fm' })).toEqual([]);
		// A clerkship with no team is open to anyone (the engine's eligibility rule).
		expect(codes(d, { clerkshipId: 'clerk-open' })).toEqual([]);
	});

	it("uses the elective's own preceptor pool when it has one", () => {
		const d = data((d) => {
			d.clerkshipTeams.set('clerk-im', new Set([P]));
			d.electivePreceptors.set('elec-cards', new Set(['cardiologist']));
		});
		expect(codes(d, { clerkshipId: 'clerk-im', electiveId: 'elec-cards' })).toEqual([
			'preceptor_not_teaching'
		]);
	});

	it('reports every problem at once', () => {
		const d = data((d) => {
			available(d, '2026-11-03', 'full', HOSPITAL);
			d.sites.set(P, new Set([HOSPITAL]));
			d.clerkshipTeams.set('clerk-im', new Set());
		});
		expect(codes(d, { siteId: CLINIC, clerkshipId: 'clerk-im' })).toEqual([
			'preceptor_unavailable',
			'preceptor_wrong_site',
			'preceptor_not_teaching'
		]);
	});
});
