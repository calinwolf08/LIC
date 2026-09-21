// @coverage @req(G9)
// @coverage @finding(P5-b) @finding(P5-c) @finding(D5-1)
/**
 * J5.3 — Bypass / generated-override parity (e2e plan Phase 5).
 *
 * A generated day that relaxes a soft constraint is a first-class override, just
 * like a manual one. The engine places an un-onboarded student by default but
 * *surfaces* the soft violation (the day is flagged, override_codes empty); a run
 * that **bypasses** not_onboarded instead stamps the code on the row (finding
 * P5-c — the engine's accepted override codes were dropped before persistence,
 * storing every generated day as override_codes=[]), the schedule-health surface
 * counts those overrides, and completing the onboarding resolves the finding. The
 * API refuses an unknown or hard bypass code (finding P5-b — the code list was
 * previously unvalidated).
 *
 * (The plan framed this as "unmet → bypass"; the engine places-but-flags by
 * default and the bypass converts the flag into an accepted override — the
 * behaviour asserted here.)
 */

import { test, expect, apiOf, assignmentsForSchedule, parseCodes, type Page } from '../../fixtures';
import { CalendarPage } from '../../pages/calendar-page';
import { generationSandbox } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function generate(page: Page, start: string, end: string, strategy: string, bypass: string[] = []) {
	return apiOf(page).post('/api/schedules/generate', {
		startDate: start,
		endDate: end,
		strategy,
		bypassedConstraints: bypass
	});
}

test.describe('J5.3 bypass parity', { tag: ['@stage2'] }, () => {
	test('un-onboarded student: flagged by default, stamped when bypassed, resolved on onboarding', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		// One student, deliberately NOT onboarded.
		const gen = await generationSandbox(asAdmin, kysely, {
			requiredDays: 2,
			students: 1,
			onboard: false
		});
		sandbox.register(gen.sandbox);
		const student = gen.studentIds[0];

		// --- Full run (no bypass): the days are placed but the soft violation is
		// surfaced, not accepted — the rows carry no override code ---
		const full = await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'full-reoptimize');
		expect(full.ok).toBe(true);
		const flagged = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(flagged).toHaveLength(2);
		expect(flagged.every((r) => parseCodes(r.override_codes).length === 0)).toBe(true);
		const v1 = await apiOf(asAdmin).get<{ counts: Record<string, number> }>(
			'/api/schedules/validation'
		);
		expect(v1.data!.counts['not_onboarded'] ?? 0).toBe(2);

		// --- Full run bypassing not_onboarded: the days come back stamped with the
		// override code (finding P5-c — these were previously dropped) ---
		const bypassed = await generate(
			asAdmin,
			gen.sandbox.start,
			gen.sandbox.end,
			'full-reoptimize',
			['not_onboarded']
		);
		expect(bypassed.ok).toBe(true);
		const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.source === 'generated')).toBe(true);
		expect(rows.every((r) => parseCodes(r.override_codes).includes('not_onboarded'))).toBe(true);

		// --- Health surface counts the override, like a manual one ---
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const overrides = await cal.health.overrideCounts();
		expect(overrides['not_onboarded'] ?? 0).toBeGreaterThanOrEqual(2);

		// --- Completing the onboarding resolves the not_onboarded finding ---
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: student,
				health_system_id: gen.hsId,
				is_completed: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.execute();
		const validation = await apiOf(asAdmin).get<{ counts: Record<string, number> }>(
			'/api/schedules/validation'
		);
		expect(validation.data!.counts['not_onboarded'] ?? 0).toBe(0);
	});

	test('an unknown or hard bypass code is rejected (P5-b)', async ({ asAdmin, sandbox, db }) => {
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 1, students: 1 });
		sandbox.register(gen.sandbox);

		// Unknown code → 400.
		const bogus = await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'completion', [
			'totally_made_up'
		]);
		expect(bogus.status).toBe(400);

		// A hard code is not overridable → 400 (cannot bypass a hard block).
		const hard = await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'completion', [
			'student_double_booked'
		]);
		expect(hard.status).toBe(400);
	});
});
