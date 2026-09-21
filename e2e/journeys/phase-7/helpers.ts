/**
 * Phase 7 (cross-area combinations and long arcs) helpers.
 *
 * Where Phase 5's `generationSandbox` stands up one clerkship / one site / one
 * preceptor, Phase 7 needs a whole small *semester*: two health systems, three
 * sites, three clerkships (one carrying an optional elective), four preceptors
 * (one deliberately left without materialised availability), and five students
 * (one deliberately un-onboarded at the second health system). It is built
 * through the same session's API plus the handful of rows the app materialises
 * elsewhere (availability, onboarding, clerkship↔site) so a long journey can
 * assert behaviour across UI, API and DB without fighting flaky modals.
 *
 * The world is shaped so the cross-area interactions are deterministic:
 *   - C1, C2 are taught only at health system A (sites A1/A2 by P1/P2);
 *   - C3 is taught only at health system B (site B1 by P3);
 *   - P4 is bound to A1 but has NO availability rows — the "un-materialised"
 *     preceptor the readiness checklist must name;
 *   - S5 is onboarded at A but NOT at B, so any C3 day placed for S5 trips the
 *     `not_onboarded` soft code (the engine places-but-flags by default — the
 *     behaviour established in J5.3 — and stamps the code only when bypassed).
 */

import { apiOf, type Page } from '../../fixtures';
import { createSandboxSchedule, type Sandbox } from '../../fixtures/sandbox';
import { monthStart, monthEnd } from '../../../src/lib/db/scripts/seed-schedule';
import { weekdaysBetween } from '../phase-5/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

export interface SemesterWorld {
	sandbox: Sandbox;
	scheduleId: string;
	/** health systems */
	hsA: string;
	hsB: string;
	/** sites: A1/A2 under hsA, B1 under hsB */
	siteA1: string;
	siteA2: string;
	siteB1: string;
	/** clerkships: c1/c2 at A, c3 at B; requiredDays each */
	c1: string;
	c2: string;
	c3: string;
	requiredDays: number;
	/** optional elective on c3 */
	electiveId: string;
	/** preceptors: p1@A1, p2@A2, p3@B1 (materialised); p4@A1 (NOT materialised) */
	p1: string;
	p2: string;
	p3: string;
	p4: string;
	/** students: s1..s4 onboarded at A and B; s5 onboarded at A only */
	students: string[];
	/** future weekdays (>= today) inside the schedule range, in order */
	futureWeekdays: string[];
}

/** Future weekdays (>= today) inside [start, end], in ascending order. */
export function futureWeekdaysInRange(start: string, end: string): string[] {
	const today = new Date().toISOString().slice(0, 10);
	return weekdaysBetween(start, end).filter((d) => d >= today);
}

/**
 * Build the semester world on a throwaway, active sandbox and return its ids.
 * The caller registers `sandbox` with the test's `sandbox` fixture for teardown.
 *
 * `requiredDays` is the required-days count for every clerkship (default 2).
 */
export async function semesterWorld(
	page: Page,
	db: Kysely<DB>,
	opts: { name?: string; requiredDays?: number; maxStudents?: number } = {}
): Promise<SemesterWorld> {
	const api = apiOf(page);
	const stamp = Date.now();
	const requiredDays = opts.requiredDays ?? 2;
	const maxStudents = opts.maxStudents ?? 10;

	// A three-month schedule (register → schedule for 3 months).
	const sandbox = await createSandboxSchedule(page, {
		name: opts.name ?? `Semester ${stamp}`,
		start: monthStart(0),
		end: monthEnd(2)
	});

	const post = async <T = { id: string }>(path: string, body: unknown): Promise<T> => {
		const res = await api.post<T>(path, body);
		if (!res.ok || !res.data) {
			throw new Error(`POST ${path} failed (${res.status}): ${JSON.stringify(res.error)}`);
		}
		return res.data;
	};

	// --- 2 health systems, 3 sites ---
	const hsA = (await post('/api/health-systems', { name: `HS A ${stamp}` })).id;
	const hsB = (await post('/api/health-systems', { name: `HS B ${stamp}` })).id;
	const siteA1 = (await post('/api/sites', { name: `Site A1 ${stamp}`, health_system_id: hsA })).id;
	const siteA2 = (await post('/api/sites', { name: `Site A2 ${stamp}`, health_system_id: hsA })).id;
	const siteB1 = (await post('/api/sites', { name: `Site B1 ${stamp}`, health_system_id: hsB })).id;

	// --- 3 clerkships (c3 carries an optional elective) ---
	const mkClerkship = async (name: string) =>
		(
			await post('/api/clerkships', {
				name,
				required_days: requiredDays,
				clerkship_type: 'outpatient'
			})
		).id;
	const c1 = await mkClerkship(`Clerkship C1 ${stamp}`);
	const c2 = await mkClerkship(`Clerkship C2 ${stamp}`);
	const c3 = await mkClerkship(`Clerkship C3 ${stamp}`);

	// Optional elective on c3 (optional so it does not add mandatory demand — the
	// engine need never satisfy it, but a hand-scheduled elective day proves the
	// elective_id round-trips through the long arc).
	const electiveId = (
		await post<{ id: string }>(`/api/scheduling-config/electives?clerkshipId=${c3}`, {
			name: `Elective ${stamp}`,
			minimumDays: 1,
			isRequired: false
		})
	).id;

	// --- 4 preceptors (p4 deliberately left un-materialised) ---
	const mkPreceptor = async (name: string, hs: string, siteIds: string[]) =>
		(
			await post('/api/preceptors', {
				name,
				email: `p_${name.replace(/\W+/g, '')}_${stamp}@example.com`,
				max_students: maxStudents,
				health_system_id: hs,
				site_ids: siteIds
			})
		).id;
	const p1 = await mkPreceptor(`P1 ${stamp}`, hsA, [siteA1]);
	const p2 = await mkPreceptor(`P2 ${stamp}`, hsA, [siteA2]);
	const p3 = await mkPreceptor(`P3 ${stamp}`, hsB, [siteB1]);
	const p4 = await mkPreceptor(`P4 ${stamp}`, hsA, [siteA1]);

	// --- 5 students (s5 onboarded at A only) ---
	const students: string[] = [];
	for (let i = 0; i < 5; i++) {
		students.push(
			(
				await post('/api/students', {
					name: `Student S${i + 1} ${stamp}`,
					email: `s${i + 1}_${stamp}@example.com`
				})
			).id
		);
	}

	const ts = new Date().toISOString();

	// --- clerkship ↔ site eligibility (c1/c2 at A, c3 at B) ---
	await db
		.insertInto('clerkship_sites')
		.values([
			{ clerkship_id: c1, site_id: siteA1, created_at: ts },
			{ clerkship_id: c1, site_id: siteA2, created_at: ts },
			{ clerkship_id: c2, site_id: siteA1, created_at: ts },
			{ clerkship_id: c2, site_id: siteA2, created_at: ts },
			{ clerkship_id: c3, site_id: siteB1, created_at: ts }
		])
		.execute();

	// --- materialise availability for p1/p2/p3 (every weekday in range); p4 none ---
	const weekdays = weekdaysBetween(sandbox.start, sandbox.end);
	const availFor = (preceptorId: string, siteId: string) =>
		weekdays.map((date) => ({
			id: crypto.randomUUID(),
			preceptor_id: preceptorId,
			site_id: siteId,
			date,
			is_available: 1,
			created_at: ts,
			updated_at: ts
		}));
	await db
		.insertInto('preceptor_availability')
		.values([...availFor(p1, siteA1), ...availFor(p2, siteA2), ...availFor(p3, siteB1)])
		.execute();

	// --- onboarding: s1..s4 at A and B; s5 at A only ---
	const onboardRows: Array<{
		id: string;
		student_id: string;
		health_system_id: string;
		is_completed: number;
		created_at: string;
		updated_at: string;
	}> = [];
	const onboard = (studentId: string, hs: string) =>
		onboardRows.push({
			id: crypto.randomUUID(),
			student_id: studentId,
			health_system_id: hs,
			is_completed: 1,
			created_at: ts,
			updated_at: ts
		});
	for (let i = 0; i < 5; i++) {
		onboard(students[i], hsA);
		if (i < 4) onboard(students[i], hsB); // s5 (index 4) NOT onboarded at B
	}
	await db.insertInto('student_health_system_onboarding').values(onboardRows).execute();

	return {
		sandbox,
		scheduleId: sandbox.id,
		hsA,
		hsB,
		siteA1,
		siteA2,
		siteB1,
		c1,
		c2,
		c3,
		requiredDays,
		electiveId,
		p1,
		p2,
		p3,
		p4,
		students,
		futureWeekdays: futureWeekdaysInRange(sandbox.start, sandbox.end)
	};
}
