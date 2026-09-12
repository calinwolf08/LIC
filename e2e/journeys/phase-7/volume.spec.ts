/**
 * J7.6 — Volume smoke (e2e plan Phase 7).
 *
 * Not a benchmark — a regression tripwire. A realistically-sized roster (60
 * students × 6 clerkships × 12 preceptors, seeded through the API + the rows the
 * app materialises) must still: generate a Full schedule within the route's
 * timeout, render the calendar month and apply a filter without falling over,
 * stream an export, and report correct dashboard counts.
 *
 * The timing assertions are deliberately generous upper bounds (the CI runner is
 * shared and slow); the actual measurements are logged. What trips the wire is a
 * pathological regression — a route that no longer returns, a calendar that
 * hangs, an export that 500s — not a few hundred milliseconds of drift.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import { monthStart, monthEnd } from '../../../src/lib/db/scripts/seed-schedule';
import { weekdaysBetween } from '../phase-5/helpers';
import { CalendarPage } from '../../pages/calendar-page';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const STUDENTS = 60;
const CLERKSHIPS = 6;
const PRECEPTORS = 12;
const SITES = 3;

async function post<T = { id: string }>(page: Page, path: string, body: unknown): Promise<T> {
	const res = await apiOf(page).post<T>(path, body);
	if (!res.ok || !res.data) throw new Error(`POST ${path} failed (${res.status})`);
	return res.data;
}

test.describe('J7.6 volume smoke', { tag: ['@long', '@stage2'] }, () => {
	test('60×6×12 generates, renders, filters, exports and counts correctly', async ({
		asFreshEntitledUser,
		sandbox,
		db
	}) => {
		test.setTimeout(600000);
		const kysely = db as Kysely<DB>;
		const { page } = asFreshEntitledUser;
		const stamp = Date.now();

		const s = await createSandboxSchedule(page, {
			name: `Volume ${stamp}`,
			start: monthStart(0),
			end: monthEnd(2)
		});
		sandbox.register(s);

		// --- Locations: 1 health system, a few sites ---
		const hsId = (await post(page, '/api/health-systems', { name: `HS ${stamp}` })).id;
		const siteIds: string[] = [];
		for (let i = 0; i < SITES; i++) {
			siteIds.push(
				(await post(page, '/api/sites', { name: `Site ${i}_${stamp}`, health_system_id: hsId })).id
			);
		}

		// --- 6 clerkships (1 required day each keeps the demand honest but bounded) ---
		const clerkshipIds: string[] = [];
		for (let i = 0; i < CLERKSHIPS; i++) {
			clerkshipIds.push(
				(
					await post(page, '/api/clerkships', {
						name: `Clerkship ${i}_${stamp}`,
						required_days: 1,
						clerkship_type: 'outpatient'
					})
				).id
			);
		}

		// --- 12 preceptors, spread across the sites, high daily capacity ---
		const preceptorIds: string[] = [];
		for (let i = 0; i < PRECEPTORS; i++) {
			preceptorIds.push(
				(
					await post(page, '/api/preceptors', {
						name: `Dr ${i}_${stamp}`,
						email: `vp_${i}_${stamp}@example.com`,
						max_students: 20,
						health_system_id: hsId,
						site_ids: [siteIds[i % SITES]]
					})
				).id
			);
		}

		// --- 60 students ---
		const studentIds: string[] = [];
		for (let i = 0; i < STUDENTS; i++) {
			studentIds.push(
				(
					await post(page, '/api/students', {
						name: `Student ${i}_${stamp}`,
						email: `vs_${i}_${stamp}@example.com`
					})
				).id
			);
		}

		const ts = new Date().toISOString();

		// --- Every clerkship is allowed at every site (engine eligibility) ---
		await kysely
			.insertInto('clerkship_sites')
			.values(
				clerkshipIds.flatMap((clerkship_id) =>
					siteIds.map((site_id) => ({ clerkship_id, site_id, created_at: ts }))
				)
			)
			.execute();

		// --- Materialise availability: each preceptor at its site, every weekday ---
		const weekdays = weekdaysBetween(s.start, s.end);
		const availRows = preceptorIds.flatMap((preceptor_id, i) =>
			weekdays.map((date) => ({
				id: crypto.randomUUID(),
				preceptor_id,
				site_id: siteIds[i % SITES],
				date,
				is_available: 1,
				created_at: ts,
				updated_at: ts
			}))
		);
		await kysely.insertInto('preceptor_availability').values(availRows).execute();

		// --- Onboard every student at the health system ---
		await kysely
			.insertInto('student_health_system_onboarding')
			.values(
				studentIds.map((student_id) => ({
					id: crypto.randomUUID(),
					student_id,
					health_system_id: hsId,
					is_completed: 1,
					created_at: ts,
					updated_at: ts
				}))
			)
			.execute();

		// --- Full generation completes within the route's timeout ---
		const genStart = Date.now();
		const gen = await apiOf(page).post<{ success: boolean }>('/api/schedules/generate', {
			startDate: s.start,
			endDate: s.end,
			strategy: 'full-reoptimize'
		});
		const genMs = Date.now() - genStart;
		console.log(`J7.6 generate: ${genMs}ms`);
		expect(gen.ok).toBe(true);

		// Demand is 60 students × 6 clerkships × 1 day = 360; capacity is ample, so
		// the run should place all of it.
		const rows = await assignmentsForSchedule(kysely, s.id);
		expect(rows.length).toBe(STUDENTS * CLERKSHIPS);
		expect(rows.every((r) => r.source === 'generated')).toBe(true);

		// --- Calendar renders the populated month, then filters, without falling over ---
		const cal = new CalendarPage(page);
		const navStart = Date.now();
		await cal.goto();
		const navMs = Date.now() - navStart;
		console.log(`J7.6 calendar nav: ${navMs}ms`);
		await expect(cal.grid.locator('[data-source="generated"]').first()).toBeVisible({
			timeout: 20000
		});

		const filterStart = Date.now();
		await cal.filter({ student: `Student 0_${stamp}` });
		// After filtering to one student, only that student's chips remain (≤ CLERKSHIPS).
		await expect
			.poll(async () => cal.chips().count(), { timeout: 15000 })
			.toBeLessThanOrEqual(CLERKSHIPS);
		const filterMs = Date.now() - filterStart;
		console.log(`J7.6 calendar filter: ${filterMs}ms`);
		// Generous tripwire bounds (shared CI runner): catch a hang, not drift.
		expect(navMs).toBeLessThan(30000);
		expect(filterMs).toBeLessThan(20000);

		// --- Export streams the whole schedule ---
		const exp = await page.request.get(
			`/api/schedules/export?start_date=${s.start}&end_date=${s.end}`
		);
		expect(exp.status()).toBe(200);
		const bytes = await exp.body();
		expect(bytes.length).toBeGreaterThan(0);

		// --- Dashboard counts: the student-status partition covers the whole roster ---
		await page.goto('/dashboard');
		const num = async (tid: string) => Number((await page.getByTestId(tid).textContent()) ?? '0');
		const partition =
			(await num('dash-fully')) + (await num('dash-partially')) + (await num('dash-unscheduled'));
		expect(partition).toBe(STUDENTS);
		// Every student got all 6 clerkships → everyone fully scheduled.
		expect(await num('dash-fully')).toBe(STUDENTS);
	});
});
