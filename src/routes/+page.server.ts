/**
 * Dashboard Home Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async () => {
	// Fetch all counts
	const [students, preceptors, clerkships, assignments] = await Promise.all([
		db.selectFrom('students').selectAll().execute(),
		db.selectFrom('preceptors').selectAll().execute(),
		db.selectFrom('clerkships').selectAll().execute(),
		db.selectFrom('schedule_assignments').selectAll().execute()
	]);

	// Calculate student scheduling status
	const studentAssignments = new Map<string, number>();
	for (const assignment of assignments) {
		const count = studentAssignments.get(assignment.student_id) || 0;
		studentAssignments.set(assignment.student_id, count + 1);
	}

	// Calculate total required days per student
	const totalRequiredDays = clerkships.reduce((sum, c) => sum + c.required_days, 0);

	// Categorize students
	let fullyScheduled = 0;
	let partiallyScheduled = 0;
	let unscheduled = 0;

	for (const student of students) {
		const assignedDays = studentAssignments.get(student.id) || 0;

		if (assignedDays >= totalRequiredDays) {
			fullyScheduled++;
		} else if (assignedDays > 0) {
			partiallyScheduled++;
		} else {
			unscheduled++;
		}
	}

	return {
		stats: {
			total_students: students.length,
			total_preceptors: preceptors.length,
			total_clerkships: clerkships.length,
			total_assignments: assignments.length,
			fully_scheduled_students: fullyScheduled,
			partially_scheduled_students: partiallyScheduled,
			unscheduled_students: unscheduled
		}
	};
};
