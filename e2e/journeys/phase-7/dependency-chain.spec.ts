// @coverage @req(R5.1) @req(R5.2)
// @coverage @finding(D7-2)
/**
 * J7.4 — Dependency-deletion chain (e2e plan Phase 7).
 *
 * Referential integrity across the whole entity graph. With a full chain in
 * place (health system → site → preceptor / clerkship → elective → student, all
 * wired together and carrying assignments), an attempt to delete any entity out
 * from under its dependents is refused with a clear error — never a silent
 * cascade that strands the schedule. The blocks are then resolved bottom-up
 * (assignments → elective → leaf entities → site → health system → schedule) and
 * each delete succeeds; afterwards the DB holds no orphan rows in any junction or
 * child table.
 *
 * The locations slice of this (HS → site → preceptor, through the UI) is already
 * covered by J2.1; this journey drives the full seven-entity chain over the API
 * to assert the block-status contract for every entity and the DB-level orphan
 * cleanup that the UI flow cannot see.
 *
 * Blocked-delete status contract (as implemented): site/preceptor/clerkship/
 * student and an active schedule return 409; health-system and elective return
 * 400. All carry a human-readable message.
 */

import { test, expect, apiOf, type Page } from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import { activeScheduleId } from '../../fixtures/api';
import { futureWeekday, createAssignment } from '../phase-4/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

async function post<T = { id: string }>(page: Page, path: string, body: unknown): Promise<T> {
	const res = await apiOf(page).post<T>(path, body);
	if (!res.ok || !res.data) throw new Error(`POST ${path} failed (${res.status})`);
	return res.data;
}

test.describe('J7.4 dependency-deletion chain', { tag: ['@long', '@stage1'] }, () => {
	test('every entity is blocked while dependents exist, resolves bottom-up, no orphans', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		const baselineId = await activeScheduleId(asAdmin);
		const s = await createSandboxSchedule(asAdmin, { name: `Deps ${stamp}` });
		sandbox.register(s);

		// --- Build the chain: HS → site → (preceptor, clerkship → elective) → student ---
		const hsId = (await post(asAdmin, '/api/health-systems', { name: `HS ${stamp}` })).id;
		const siteId = (
			await post(asAdmin, '/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
		).id;
		const clerkshipId = (
			await post(asAdmin, '/api/clerkships', {
				name: `Clerkship ${stamp}`,
				required_days: 2,
				clerkship_type: 'outpatient'
			})
		).id;
		const preceptorId = (
			await post(asAdmin, '/api/preceptors', {
				name: `Dr Dep ${stamp}`,
				email: `dep_${stamp}@example.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).id;
		const studentId = (
			await post(asAdmin, '/api/students', {
				name: `Student Dep ${stamp}`,
				email: `dep_stu_${stamp}@example.com`
			})
		).id;
		const electiveId = (
			await post<{ id: string }>(
				asAdmin,
				`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`,
				{
					name: `Elective ${stamp}`,
					minimumDays: 1,
					isRequired: false
				}
			)
		).id;

		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_sites')
			.values({ clerkship_id: clerkshipId, site_id: siteId, created_at: ts })
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

		// One core assignment and one elective assignment (the elective's dependent).
		const coreId = await createAssignment(asAdmin, {
			student_id: studentId,
			preceptor_id: preceptorId,
			clerkship_id: clerkshipId,
			site_id: siteId,
			date: futureWeekday(8)
		});
		const electiveAssignmentId = await createAssignment(asAdmin, {
			student_id: studentId,
			preceptor_id: preceptorId,
			clerkship_id: clerkshipId,
			site_id: siteId,
			date: futureWeekday(9),
			// elective days ride on the create payload
			...({ elective_id: electiveId } as Record<string, unknown>)
		});

		// --- Every delete is blocked while its dependents exist ---
		const del = (path: string) => apiOf(asAdmin).delete(path);
		const expectBlocked = async (path: string, status: number, label: string) => {
			const res = await del(path);
			expect(res.ok, `${label} delete should be refused`).toBe(false);
			expect(res.status, `${label} delete status`).toBe(status);
			expect(res.error?.message, `${label} carries a message`).toBeTruthy();
		};

		await expectBlocked(`/api/sites/${siteId}`, 409, 'site');
		await expectBlocked(`/api/health-systems/${hsId}`, 400, 'health system');
		await expectBlocked(`/api/preceptors/${preceptorId}`, 409, 'preceptor');
		await expectBlocked(`/api/clerkships/${clerkshipId}`, 409, 'clerkship');
		await expectBlocked(`/api/scheduling-config/electives/${electiveId}`, 400, 'elective');
		await expectBlocked(`/api/students/${studentId}`, 409, 'student');
		// Note: unlike the entities above, deleting the *schedule* is not
		// dependency-blocked — it cascades its own assignments and junctions by design
		// (J1.2 / finding P3-g). It is therefore the final cleanup step below, not a
		// blocked delete. (D7-2)

		// --- Resolve bottom-up ---
		// 1. Delete the assignments → unblocks preceptor, clerkship, student, elective.
		expect((await del(`/api/schedules/assignments/${electiveAssignmentId}`)).ok).toBe(true);
		expect((await del(`/api/schedules/assignments/${coreId}`)).ok).toBe(true);

		// 2. Elective, then the leaf entities.
		expect((await del(`/api/scheduling-config/electives/${electiveId}`)).ok).toBe(true);
		expect((await del(`/api/students/${studentId}`)).ok).toBe(true);
		// Deleting the preceptor and clerkship cascades preceptor_sites / clerkship_sites,
		// which is what still blocks the site.
		expect((await del(`/api/preceptors/${preceptorId}`)).ok).toBe(true);
		expect((await del(`/api/clerkships/${clerkshipId}`)).ok).toBe(true);

		// 3. The site is now free of dependents.
		expect((await del(`/api/sites/${siteId}`)).ok).toBe(true);
		// 4. The health system has no sites or preceptors left.
		expect((await del(`/api/health-systems/${hsId}`)).ok).toBe(true);

		// 5. Deactivate (switch away) and delete the schedule.
		if (baselineId) {
			await apiOf(asAdmin).put('/api/user/active-schedule', { scheduleId: baselineId });
		}
		expect((await apiOf(asAdmin).delete(`/api/scheduling-periods/${s.id}`)).ok).toBe(true);

		// --- No orphan rows anywhere the chain touched ---
		const none = async (
			table:
				| 'schedule_assignments'
				| 'preceptor_sites'
				| 'clerkship_sites'
				| 'preceptor_availability'
				| 'clerkship_electives'
				| 'elective_preceptors'
				| 'student_health_system_onboarding'
				| 'schedule_students'
				| 'schedule_preceptors'
				| 'schedule_clerkships'
				| 'schedule_sites'
				| 'schedule_health_systems',
			column: string,
			id: string
		) => {
			const rows = await kysely
				.selectFrom(table)
				.select(kysely.fn.countAll<number>().as('n'))
				.where(column as never, '=', id as never)
				.executeTakeFirst();
			expect(Number(rows?.n ?? 0), `${table}.${column}=${id} should be empty`).toBe(0);
		};

		await none('preceptor_sites', 'preceptor_id', preceptorId);
		await none('preceptor_sites', 'site_id', siteId);
		await none('clerkship_sites', 'clerkship_id', clerkshipId);
		await none('clerkship_sites', 'site_id', siteId);
		await none('preceptor_availability', 'preceptor_id', preceptorId);
		await none('clerkship_electives', 'clerkship_id', clerkshipId);
		await none('student_health_system_onboarding', 'student_id', studentId);
		await none('schedule_assignments', 'schedule_id', s.id);
		await none('schedule_students', 'schedule_id', s.id);
		await none('schedule_preceptors', 'schedule_id', s.id);
		await none('schedule_clerkships', 'schedule_id', s.id);
		await none('schedule_sites', 'schedule_id', s.id);
		await none('schedule_health_systems', 'schedule_id', s.id);
	});
});
