// @coverage @finding(CF-GEN-UI) @req(R3.1)
/**
 * Auto-generation driven through the REAL UI button.
 *
 * Every other generation journey opens the dialog but then applies over the
 * API, because the modal's apply was historically flaky under Playwright. That
 * leaves the dialog's own logic — the piece a coordinator actually triggers —
 * unproven: the mode radios map to a strategy, and *full* mode first DELETEs the
 * whole schedule before generating. This drives the button itself:
 *
 *   1. seed a manual day so there is something for full mode to clear;
 *   2. open /generate → "Generate schedule…" → pick Full → "Apply Regeneration";
 *   3. the dialog reports it cleared the old assignments and generated new ones;
 *   4. the schedule the coordinator ends up with is entirely engine-generated
 *      (the manual row is gone) and the results page reads complete.
 *
 * This is the UI→engine hookup proof; the engine's placement rules themselves
 * are covered by the API-level generation specs.
 */

import { test, expect, apiOf, assignmentsForSchedule, fromToday, type Page } from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import { generationSandbox, weekdaysBetween } from '../phase-5/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function mondayAtLeast(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1) return d;
		n++;
	}
}
function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const SAFETY = [
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule',
	'session_clash',
	'mutual_exclusion',
	'block_week_conflict',
	'past_date'
];

/** Open the generate dialog, choose full mode, and click the real apply button. */
async function applyFullRegenViaUi(page: Page) {
	await page.goto('/generate');
	const openBtn = page.getByRole('button', { name: /generate schedule/i });
	await expect(openBtn).toBeVisible({ timeout: 15000 });
	await openBtn.click();

	// The dialog is open once its mode options render.
	await expect(page.getByText('Full Regeneration (Start Over)')).toBeVisible({ timeout: 10000 });
	// Force full mode regardless of the date-based default.
	await page.locator('input[type="radio"][value="full"]').check();
	await expect(page.getByText(/delete all existing assignments/i)).toBeVisible();

	await page.getByRole('button', { name: /apply regeneration/i }).click();
}

test.describe('CF-GEN-UI generate via the real dialog button', { tag: ['@stage2', '@long'] }, () => {
	test('full-mode Apply clears the old schedule and generates a new one', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(gen.sandbox);
		const api = apiOf(asAdmin);
		const expectedRows = gen.studentIds.length * gen.requiredDays; // 2 × 2 = 4

		// Seed one MANUAL day so full mode has something distinct to clear. It must be
		// in the FUTURE: full-mode clears from today forward and always preserves past
		// (and locked) rows, so a future unlocked manual day is exactly what the delete
		// step should remove. If that step were skipped, this source=manual row survives.
		const today = new Date().toISOString().slice(0, 10);
		const futureDay = weekdaysBetween(gen.sandbox.start, gen.sandbox.end).find((d) => d > today);
		expect(futureDay, 'a future weekday exists in range').toBeTruthy();
		const manual = await api.post('/api/schedules/assignments', {
			student_id: gen.studentIds[0],
			preceptor_id: gen.preceptorId,
			clerkship_id: gen.clerkshipId,
			site_id: gen.siteId,
			date: futureDay!,
			override_codes: SAFETY
		});
		expect(manual.ok, 'manual seed created').toBe(true);
		const before = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(before.some((r) => r.source === 'manual')).toBe(true);

		// --- Drive the real apply button ---
		await applyFullRegenViaUi(asAdmin);

		// The dialog confirms the full-mode branch actually ran: cleared + generated.
		await expect(asAdmin.getByText(/successfully cleared .* generated .* new assignments/i)).toBeVisible({
			timeout: 30000
		});

		// --- The applied schedule is entirely engine-generated (manual row cleared) ---
		await expect
			.poll(
				async () => {
					const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
					return {
						total: rows.length,
						allGenerated: rows.length > 0 && rows.every((r) => r.source === 'generated'),
						anyManual: rows.some((r) => r.source === 'manual')
					};
				},
				{ timeout: 20000 }
			)
			.toEqual({ total: expectedRows, allGenerated: true, anyManual: false });

		// --- The coordinator lands on a results page that reads complete ---
		await asAdmin.goto('/generate/results');
		const results = asAdmin.getByTestId('results');
		await expect(results).toBeVisible({ timeout: 15000 });
		expect(await results.getAttribute('data-complete')).toBe('true');
	});

	// Regression guard for the L3 block-week pipeline bug: a schedule-scoped blackout
	// from another schedule used to leak into availableDates (strategy-context read
	// blackouts unscoped), removing the only valid free-week day so the fallback put
	// the scattered day in the block week. Fixed by scoping the blackout read.
	test('full-mode Apply honors the L3 block-week constraint (UI passes gated options to the engine)', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		// Same block/scatter scenario the API-level autogen-constraints spec proves —
		// but applied through the real dialog button, to prove the UI path hands the
		// gated L3 constraint to the engine, not just the raw API.
		const blockMon = mondayAtLeast(8);
		const sameWeekWed = addDays(blockMon, 2);
		const nextMon = addDays(blockMon, 7);

		const sb = await createSandboxSchedule(asAdmin, {
			name: `GEN-UI-L3 ${stamp}`,
			start: blockMon,
			end: addDays(nextMon, 2)
		});
		sandbox.register(sb);

		const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` })).data!.id;
		// Two sites so each preceptor is eligible for exactly one clerkship.
		const siteBlock = (
			await api.post<{ id: string }>('/api/sites', { name: `SiteB ${stamp}`, health_system_id: hsId })
		).data!.id;
		const siteScatter = (
			await api.post<{ id: string }>('/api/sites', { name: `SiteS ${stamp}`, health_system_id: hsId })
		).data!.id;
		const clerkBlock = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `Block ${stamp}`,
				required_days: 1,
				clerkship_type: 'inpatient',
				scheduling_kind: 'block'
			})
		).data!.id;
		const clerkScatter = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `Scatter ${stamp}`,
				required_days: 1,
				clerkship_type: 'outpatient',
				scheduling_kind: 'scattered'
			})
		).data!.id;
		const precBlock = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr Block ${stamp}`,
				email: `blk_${stamp}@x.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteBlock]
			})
		).data!.id;
		const precScatter = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr Scatter ${stamp}`,
				email: `sct_${stamp}@x.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteScatter]
			})
		).data!.id;
		const studentId = (
			await api.post<{ id: string }>('/api/students', { name: `S ${stamp}`, email: `s_${stamp}@x.com` })
		).data!.id;

		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_sites')
			.values([
				{ clerkship_id: clerkBlock, site_id: siteBlock, created_at: ts },
				{ clerkship_id: clerkScatter, site_id: siteScatter, created_at: ts }
			])
			.execute();
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: studentId,
				health_system_id: hsId,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// Block preceptor only on blockMon; scatter preceptor in the block week AND the
		// following (free) week — so the only L3-respecting placement is the free week.
		await kysely
			.insertInto('preceptor_availability')
			.values([
				{ id: crypto.randomUUID(), preceptor_id: precBlock, site_id: siteBlock, date: blockMon, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts },
				{ id: crypto.randomUUID(), preceptor_id: precScatter, site_id: siteScatter, date: sameWeekWed, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts },
				{ id: crypto.randomUUID(), preceptor_id: precScatter, site_id: siteScatter, date: nextMon, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts }
			])
			.execute();

		// --- Generate through the real dialog button (full mode) ---
		await applyFullRegenViaUi(asAdmin);
		await expect(asAdmin.getByText(/successfully cleared .* generated .* new assignments/i)).toBeVisible({
			timeout: 30000
		});

		// --- The engine honored L3: block day on blockMon, scattered day in the FREE
		//     week (nextMon), never in the block's week (sameWeekWed) ---
		await expect
			.poll(
				async () => {
					const rows = (await assignmentsForSchedule(kysely, sb.id)).filter(
						(r) => r.student_id === studentId
					);
					const block = rows.find((r) => r.clerkship_id === clerkBlock);
					const scatter = rows.find((r) => r.clerkship_id === clerkScatter);
					return { block: block?.date ?? null, scatter: scatter?.date ?? null };
				},
				{ timeout: 20000 }
			)
			.toEqual({ block: blockMon, scatter: nextMon });
	});
});
