/**
 * Whole-schedule validation (Step 10).
 *
 * Runs the structured per-assignment checks over every assignment in a
 * schedule in a single batched pass (no N+1 queries) and indexes the results
 * by date, student, and preceptor for the calendar / dashboard.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import {
	validateCandidateWithContext,
	type ValidationContext,
	type Violation
} from './assignment-validation';

export interface ScheduleViolation extends Violation {
	assignment_id: string;
	/**
	 * Every assignment this finding covers. For per-assignment codes this is just
	 * `[assignment_id]`; for slot-scoped codes (preceptor_capacity) it is all the
	 * assignments sharing the over-subscribed preceptor-day.
	 */
	assignment_ids: string[];
	date: string;
	student_id: string;
	preceptor_id: string;
}

export interface ScheduleValidationResult {
	violations: ScheduleViolation[];
	byDate: Record<string, ScheduleViolation[]>;
	byStudent: Record<string, ScheduleViolation[]>;
	byPreceptor: Record<string, ScheduleViolation[]>;
	/** Count of violations by code, for summaries. */
	counts: Record<string, number>;
}

export async function validateSchedule(
	db: Kysely<DB>,
	scheduleId: string
): Promise<ScheduleValidationResult> {
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();

	// Students & clerkships in this schedule
	const studentRows = await db
		.selectFrom('schedule_students')
		.select('student_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	const studentIds = studentRows.map((r) => r.student_id);

	if (studentIds.length === 0) {
		return { violations: [], byDate: {}, byStudent: {}, byPreceptor: {}, counts: {} };
	}

	// All assignments for those students
	const assignments = await db
		.selectFrom('schedule_assignments')
		.select(['id', 'student_id', 'preceptor_id', 'clerkship_id', 'site_id', 'date'])
		.where('student_id', 'in', studentIds)
		.execute();

	if (assignments.length === 0) {
		return { violations: [], byDate: {}, byStudent: {}, byPreceptor: {}, counts: {} };
	}

	const preceptorIds = [...new Set(assignments.map((a) => a.preceptor_id))];
	const clerkshipIds = [...new Set(assignments.map((a) => a.clerkship_id))];

	// Batch-load the context inputs
	const [preceptors, clerkships, availability, blackouts, clerkshipSites, onboarding] =
		await Promise.all([
			db
				.selectFrom('preceptors')
				.select(['id', 'max_students', 'health_system_id'])
				.where('id', 'in', preceptorIds)
				.execute(),
			db.selectFrom('clerkships').select('id').where('id', 'in', clerkshipIds).execute(),
			db
				.selectFrom('preceptor_availability')
				.select(['preceptor_id', 'date', 'is_available'])
				.where('preceptor_id', 'in', preceptorIds)
				.execute(),
			db.selectFrom('blackout_dates').select('date').execute(),
			db
				.selectFrom('clerkship_sites')
				.select(['clerkship_id', 'site_id'])
				.where('clerkship_id', 'in', clerkshipIds)
				.execute(),
			db
				.selectFrom('student_health_system_onboarding')
				.select(['student_id', 'health_system_id', 'is_completed'])
				.where('student_id', 'in', studentIds)
				.execute()
		]);

	// Build context maps
	const preceptorMaxStudents = new Map<string, number>();
	const preceptorHealthSystem = new Map<string, string | null>();
	for (const p of preceptors) {
		preceptorMaxStudents.set(p.id!, p.max_students);
		preceptorHealthSystem.set(p.id!, p.health_system_id);
	}

	const preceptorUnavailable = new Map<string, Set<string>>();
	for (const a of availability) {
		if (a.is_available === 0) {
			if (!preceptorUnavailable.has(a.preceptor_id))
				preceptorUnavailable.set(a.preceptor_id, new Set());
			preceptorUnavailable.get(a.preceptor_id)!.add(a.date);
		}
	}

	const clerkshipSiteMap = new Map<string, Set<string>>();
	for (const cs of clerkshipSites) {
		if (!clerkshipSiteMap.has(cs.clerkship_id)) clerkshipSiteMap.set(cs.clerkship_id, new Set());
		clerkshipSiteMap.get(cs.clerkship_id)!.add(cs.site_id);
	}

	const studentOnboarded = new Map<string, Set<string>>();
	for (const o of onboarding) {
		if (o.is_completed === 1) {
			if (!studentOnboarded.has(o.student_id)) studentOnboarded.set(o.student_id, new Set());
			studentOnboarded.get(o.student_id)!.add(o.health_system_id);
		}
	}

	const ctx: ValidationContext = {
		scheduleStart: period?.start_date ?? '0000-01-01',
		scheduleEnd: period?.end_date ?? '9999-12-31',
		preceptorMaxStudents,
		preceptorUnavailable,
		preceptorHealthSystem,
		clerkshipSites: clerkshipSiteMap,
		studentOnboarded,
		blackoutDates: new Set(blackouts.map((b) => b.date)),
		existingStudentIds: new Set(studentIds),
		existingPreceptorIds: new Set(preceptorIds),
		existingClerkshipIds: new Set(clerkships.map((c) => c.id!))
	};

	// Preceptor-date occupancy for capacity checks: keep the actual assignments on
	// each slot so a single capacity finding can reference them all.
	const slotAssignments = new Map<string, typeof assignments>();
	for (const a of assignments) {
		const k = `${a.preceptor_id}:${a.date}`;
		(slotAssignments.get(k) ?? slotAssignments.set(k, []).get(k)!).push(a);
	}

	// student:date -> assignment id (double-booking is DB-prevented, but keep for completeness)
	const existingByStudentDate = new Map<string, string>();
	for (const a of assignments) {
		existingByStudentDate.set(`${a.student_id}:${a.date}`, a.id!);
	}

	const violations: ScheduleViolation[] = [];

	// Per-assignment findings (capacity is slot-scoped and handled separately below).
	for (const a of assignments) {
		const res = validateCandidateWithContext(
			{
				student_id: a.student_id,
				preceptor_id: a.preceptor_id,
				clerkship_id: a.clerkship_id,
				site_id: a.site_id,
				date: a.date,
				excludeId: a.id! // exclude self from double-booking
			},
			ctx,
			existingByStudentDate
		);

		for (const v of [...res.hard, ...res.soft]) {
			violations.push({
				...v,
				assignment_id: a.id!,
				assignment_ids: [a.id!],
				date: a.date,
				student_id: a.student_id,
				preceptor_id: a.preceptor_id
			});
		}
	}

	// Capacity: ONE finding per over-subscribed (preceptor, date), not one per
	// assignment — so four double-booked days read as 4, not 8.
	for (const [, slot] of slotAssignments) {
		const first = slot[0];
		const max = preceptorMaxStudents.get(first.preceptor_id) ?? 1;
		if (slot.length > max) {
			violations.push({
				code: 'preceptor_capacity',
				message: 'Preceptor is over capacity for this date',
				entity_refs: { preceptor_id: first.preceptor_id },
				assignment_id: first.id!,
				assignment_ids: slot.map((a) => a.id!),
				date: first.date,
				student_id: first.student_id,
				preceptor_id: first.preceptor_id
			});
		}
	}

	const byDate: Record<string, ScheduleViolation[]> = {};
	const byStudent: Record<string, ScheduleViolation[]> = {};
	const byPreceptor: Record<string, ScheduleViolation[]> = {};
	const counts: Record<string, number> = {};
	for (const v of violations) {
		(byDate[v.date] ??= []).push(v);
		(byStudent[v.student_id] ??= []).push(v);
		(byPreceptor[v.preceptor_id] ??= []).push(v);
		counts[v.code] = (counts[v.code] ?? 0) + 1;
	}

	return { violations, byDate, byStudent, byPreceptor, counts };
}
