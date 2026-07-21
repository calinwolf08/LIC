/**
 * Requirement status (Step 10 contract, consumed by the students/clerkships UI).
 *
 * Splits each student's clerkship requirements, as of `today`, into:
 *   - completed:   assigned days with date < today
 *   - scheduled:   assigned days with date >= today
 *   - unscheduled: required - completed - scheduled (floored at 0)
 *
 * Works against whatever assignments exist — no auto-generation required.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface RequirementCounts {
	required: number;
	completed: number;
	scheduled: number;
	unscheduled: number;
	/** assigned beyond required (completed + scheduled - required, floored at 0) */
	over_scheduled: number;
}

export interface ClerkshipRequirementStatus extends RequirementCounts {
	clerkship_id: string;
	clerkship_name: string;
}

export interface StudentStatus {
	student_id: string;
	student_name: string;
	overall: RequirementCounts;
	per_clerkship: ClerkshipRequirementStatus[];
	scheduling_state: 'full' | 'partial' | 'none';
	conflict_count: number;
}

function todayUTC(): string {
	return new Date().toISOString().split('T')[0];
}

function emptyCounts(required: number): RequirementCounts {
	return { required, completed: 0, scheduled: 0, unscheduled: required, over_scheduled: 0 };
}

/**
 * Compute requirement status for every student in the schedule.
 *
 * @param scheduleId - active schedule id (scopes students/assignments).
 * @param today - YYYY-MM-DD; defaults to today (UTC).
 */
export async function getStudentStatuses(
	db: Kysely<DB>,
	scheduleId: string,
	today: string = todayUTC()
): Promise<StudentStatus[]> {
	// Students in this schedule
	const students = await db
		.selectFrom('students')
		.innerJoin('schedule_students', 'schedule_students.student_id', 'students.id')
		.where('schedule_students.schedule_id', '=', scheduleId)
		.select(['students.id as id', 'students.name as name'])
		.execute();

	if (students.length === 0) return [];

	// Clerkships in this schedule (with required days)
	const clerkships = await db
		.selectFrom('clerkships')
		.innerJoin('schedule_clerkships', 'schedule_clerkships.clerkship_id', 'clerkships.id')
		.where('schedule_clerkships.schedule_id', '=', scheduleId)
		.select(['clerkships.id as id', 'clerkships.name as name', 'clerkships.required_days as required_days'])
		.execute();

	// All assignments for these students
	const studentIds = students.map((s) => s.id!).filter(Boolean);
	const assignments =
		studentIds.length > 0
			? await db
					.selectFrom('schedule_assignments')
					.select(['student_id', 'clerkship_id', 'date'])
					.where('student_id', 'in', studentIds)
					.execute()
			: [];

	// Conflicts: a student double-booked on a date (>1 assignment same day)
	const perStudentDateCount = new Map<string, number>();
	for (const a of assignments) {
		const k = `${a.student_id}:${a.date}`;
		perStudentDateCount.set(k, (perStudentDateCount.get(k) ?? 0) + 1);
	}
	const conflictDatesByStudent = new Map<string, Set<string>>();
	for (const [k, count] of perStudentDateCount) {
		if (count > 1) {
			const [sid, date] = k.split(':');
			if (!conflictDatesByStudent.has(sid)) conflictDatesByStudent.set(sid, new Set());
			conflictDatesByStudent.get(sid)!.add(date);
		}
	}

	return students.map((student) => {
		const sid = student.id!;
		const perClerkship: ClerkshipRequirementStatus[] = clerkships.map((c) => {
			const counts = emptyCounts(c.required_days);
			const forClerkship = assignments.filter(
				(a) => a.student_id === sid && a.clerkship_id === c.id
			);
			let completed = 0;
			let scheduled = 0;
			for (const a of forClerkship) {
				if (a.date < today) completed++;
				else scheduled++;
			}
			counts.completed = completed;
			counts.scheduled = scheduled;
			counts.unscheduled = Math.max(0, c.required_days - completed - scheduled);
			counts.over_scheduled = Math.max(0, completed + scheduled - c.required_days);
			return { clerkship_id: c.id!, clerkship_name: c.name, ...counts };
		});

		const overall: RequirementCounts = perClerkship.reduce(
			(acc, c) => ({
				required: acc.required + c.required,
				completed: acc.completed + c.completed,
				scheduled: acc.scheduled + c.scheduled,
				unscheduled: acc.unscheduled + c.unscheduled,
				over_scheduled: acc.over_scheduled + c.over_scheduled
			}),
			emptyCounts(0)
		);
		overall.unscheduled = Math.max(
			0,
			overall.required - overall.completed - overall.scheduled
		);

		const hasAny = perClerkship.some((c) => c.completed + c.scheduled > 0);
		const allMet = perClerkship.every((c) => c.unscheduled === 0);
		const scheduling_state: StudentStatus['scheduling_state'] = !hasAny
			? 'none'
			: allMet
				? 'full'
				: 'partial';

		return {
			student_id: sid,
			student_name: student.name,
			overall,
			per_clerkship: perClerkship,
			scheduling_state,
			conflict_count: conflictDatesByStudent.get(sid)?.size ?? 0
		};
	});
}

/** Status for a single student (convenience wrapper). */
export async function getStudentStatus(
	db: Kysely<DB>,
	scheduleId: string,
	studentId: string,
	today: string = todayUTC()
): Promise<StudentStatus | null> {
	const all = await getStudentStatuses(db, scheduleId, today);
	return all.find((s) => s.student_id === studentId) ?? null;
}

/** Overall completion percentage from counts (0–100). */
export function completionPercent(counts: RequirementCounts): number {
	if (counts.required === 0) return 0;
	return Math.round(((counts.completed + counts.scheduled) / counts.required) * 100);
}
