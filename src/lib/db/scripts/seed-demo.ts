/**
 * Demo assignment scenario for the admin tenant (Round 4, step 36).
 *
 * Kept in its own module — free of the auth / CLI side effects in `seed.ts` —
 * so it can be exercised directly against a migrated in-memory database.
 *
 * The scenario is deliberately shaped to exercise the Round 3 features:
 *   - a clean multi-day block (normal calendar + progress bars),
 *   - a partially-complete clerkship (requirement strip + "days left"),
 *   - a fully-complete clerkship (completed state),
 *   - a preceptor double-booked across 4 consecutive days, carrying an accepted
 *     `preceptor_capacity` override (schedule-health "4 findings not 8" + the
 *     grouped override row),
 *   - one `not_onboarded` override that is already resolved (the student has
 *     since onboarded), so the active/resolved toggle has both states to show.
 *
 * Every date is anchored to today via `fromToday()`, every assignment carries a
 * valid `site_id` drawn from its preceptor's site link, and every student is a
 * member of the owning schedule. Idempotent via the marker preceptor.
 */

import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '../types';
import { fromToday } from './seed-schedule';

/** Email of the marker preceptor used to detect an already-seeded scenario. */
export const CAPACITY_DEMO_EMAIL = 'capacity-demo@metro.edu';

export interface AdminSeedRefs {
	scheduleId: string;
	studentIds: string[];
	preceptorIds: string[];
	clerkshipIds: string[];
	healthSystemIds: string[];
	timestamp: string;
}

/** Look up the site a preceptor is linked to (its first `preceptor_sites` row). */
async function preceptorSiteId(db: Kysely<DB>, preceptorId: string): Promise<string> {
	const row = await db
		.selectFrom('preceptor_sites')
		.select('site_id')
		.where('preceptor_id', '=', preceptorId)
		.executeTakeFirst();
	if (!row?.site_id) {
		throw new Error(
			`Preceptor ${preceptorId} has no linked site — cannot seed a required-site assignment`
		);
	}
	return row.site_id;
}

/** Ensure a preceptor belongs to the schedule (idempotent). */
async function ensureSchedulePreceptor(
	db: Kysely<DB>,
	scheduleId: string,
	preceptorId: string,
	ts: string
) {
	const existing = await db
		.selectFrom('schedule_preceptors')
		.select('id')
		.where('schedule_id', '=', scheduleId)
		.where('preceptor_id', '=', preceptorId)
		.executeTakeFirst();
	if (existing) return;
	await db
		.insertInto('schedule_preceptors')
		.values({ id: nanoid(), schedule_id: scheduleId, preceptor_id: preceptorId, created_at: ts })
		.execute();
}

/** Mark a student onboarded to a health system (idempotent). */
async function ensureOnboarded(
	db: Kysely<DB>,
	studentId: string,
	healthSystemId: string,
	ts: string
) {
	const existing = await db
		.selectFrom('student_health_system_onboarding')
		.select('id')
		.where('student_id', '=', studentId)
		.where('health_system_id', '=', healthSystemId)
		.executeTakeFirst();
	if (existing) return;
	await db
		.insertInto('student_health_system_onboarding')
		.values({
			id: nanoid(),
			student_id: studentId,
			health_system_id: healthSystemId,
			is_completed: 1,
			completed_date: ts,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

/**
 * Seed the demo assignment scenario for the admin tenant. See the module
 * docstring for the shape of the data and why each piece exists.
 */
export async function seedAdminAssignments(db: Kysely<DB>, refs: AdminSeedRefs) {
	console.log('\nSeeding admin assignments (demo scenario)...');
	const {
		scheduleId,
		studentIds,
		preceptorIds,
		clerkshipIds,
		healthSystemIds,
		timestamp: ts
	} = refs;

	// Idempotency: the marker preceptor only exists once the scenario is seeded.
	const marker = await db
		.selectFrom('preceptors')
		.select('id')
		.where('email', '=', CAPACITY_DEMO_EMAIL)
		.executeTakeFirst();
	if (marker) {
		console.log('  Admin assignments already seeded');
		return;
	}

	const hsId = healthSystemIds[0];
	const familyMedicine = clerkshipIds[0];
	const internalMedicine = clerkshipIds[1];
	const psychiatry = clerkshipIds[5]; // required_days: 14

	const insertAssignment = async (a: {
		studentId: string;
		preceptorId: string;
		clerkshipId: string;
		siteId: string;
		date: string;
		overrideCodes?: string[];
		overrideNote?: string;
	}) => {
		await db
			.insertInto('schedule_assignments')
			.values({
				id: nanoid(),
				schedule_id: scheduleId,
				student_id: a.studentId,
				preceptor_id: a.preceptorId,
				clerkship_id: a.clerkshipId,
				site_id: a.siteId,
				date: a.date,
				status: 'scheduled',
				source: 'manual',
				override_codes: JSON.stringify(a.overrideCodes ?? []),
				override_note: a.overrideNote ?? null,
				created_at: ts,
				updated_at: ts
			})
			.execute();
	};

	// --- Scenario 1: clean multi-day block (student 0, 5 days) --------------
	const cleanPreceptor = preceptorIds[0];
	const cleanSite = await preceptorSiteId(db, cleanPreceptor);
	await ensureOnboarded(db, studentIds[0], hsId, ts);
	for (let i = 1; i <= 5; i++) {
		await insertAssignment({
			studentId: studentIds[0],
			preceptorId: cleanPreceptor,
			clerkshipId: familyMedicine,
			siteId: cleanSite,
			date: fromToday(i)
		});
	}

	// --- Scenario 2: partially complete (student 1, 10 of 28 days) ----------
	const partialPreceptor = preceptorIds[2];
	const partialSite = await preceptorSiteId(db, partialPreceptor);
	await ensureOnboarded(db, studentIds[1], hsId, ts);
	for (let i = 1; i <= 10; i++) {
		await insertAssignment({
			studentId: studentIds[1],
			preceptorId: partialPreceptor,
			clerkshipId: internalMedicine,
			siteId: partialSite,
			date: fromToday(i)
		});
	}

	// --- Scenario 3: fully complete (student 2, 14 of 14 days) --------------
	const completePreceptor = preceptorIds[1];
	const completeSite = await preceptorSiteId(db, completePreceptor);
	await ensureOnboarded(db, studentIds[2], hsId, ts);
	for (let i = 1; i <= 14; i++) {
		await insertAssignment({
			studentId: studentIds[2],
			preceptorId: completePreceptor,
			clerkshipId: psychiatry,
			siteId: completeSite,
			date: fromToday(i)
		});
	}

	// --- Scenario 4: capacity double-booking, accepted override -------------
	// A dedicated preceptor with capacity 1 carries two students on each of four
	// consecutive days. validateSchedule reports 4 slot-scoped findings (not 8).
	const capacityPreceptorId = nanoid();
	await db
		.insertInto('preceptors')
		.values({
			id: capacityPreceptorId,
			name: 'Dr. Olivia Capacity',
			email: CAPACITY_DEMO_EMAIL,
			health_system_id: hsId,
			max_students: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	const capacitySite = cleanSite;
	await db
		.insertInto('preceptor_sites')
		.values({ preceptor_id: capacityPreceptorId, site_id: capacitySite, created_at: ts })
		.execute();
	await ensureSchedulePreceptor(db, scheduleId, capacityPreceptorId, ts);
	await ensureOnboarded(db, studentIds[3], hsId, ts);
	await ensureOnboarded(db, studentIds[4], hsId, ts);
	for (let i = 20; i <= 23; i++) {
		for (const studentId of [studentIds[3], studentIds[4]]) {
			await insertAssignment({
				studentId,
				preceptorId: capacityPreceptorId,
				clerkshipId: familyMedicine,
				siteId: capacitySite,
				date: fromToday(i),
				overrideCodes: ['preceptor_capacity'],
				overrideNote: 'Approved: preceptor covering an extra student this block'
			});
		}
	}

	// --- Scenario 5: resolved not_onboarded override -----------------------
	// The override was accepted when the student was not onboarded; the student
	// has since onboarded, so the exception now reads as resolved.
	await ensureOnboarded(db, studentIds[5], hsId, ts);
	await insertAssignment({
		studentId: studentIds[5],
		preceptorId: cleanPreceptor,
		clerkshipId: familyMedicine,
		siteId: cleanSite,
		date: fromToday(30),
		overrideCodes: ['not_onboarded'],
		overrideNote: 'Approved before onboarding completed'
	});

	console.log(
		'  Seeded demo assignments: clean block, partial, complete, capacity run, resolved override'
	);
}
