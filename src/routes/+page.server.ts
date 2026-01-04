/**
 * Dashboard Home Page - Server Load
 * Shows landing page for unauthenticated users, dashboard for authenticated users
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ locals }) => {
	// For unauthenticated users, return minimal data for landing page
	if (!locals.session?.user) {
		return {
			isAuthenticated: false,
			stats: null,
			activeSchedule: null
		};
	}

	// Get the user's active schedule for the welcome modal
	let activeSchedule: { id: string; name: string; start_date: string; end_date: string } | null =
		null;

	if (locals.session?.user?.id) {
		try {
			const user = await db
				.selectFrom('user')
				.select('active_schedule_id')
				.where('id', '=', locals.session.user.id)
				.executeTakeFirst();

			if (user?.active_schedule_id) {
				const schedule = await db
					.selectFrom('scheduling_periods')
					.select(['id', 'name', 'start_date', 'end_date'])
					.where('id', '=', user.active_schedule_id)
					.executeTakeFirst();

				if (schedule && schedule.id) {
					activeSchedule = {
						id: schedule.id,
						name: schedule.name,
						start_date: schedule.start_date,
						end_date: schedule.end_date
					};
				}
			}
		} catch (error) {
			// Ignore if active_schedule_id column doesn't exist yet
			console.warn('Could not load active schedule:', error);
		}
	}

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
	const totalRequiredDays = clerkships.reduce((sum, c) => sum + Number(c.required_days), 0);

	// Categorize students
	let fullyScheduled = 0;
	let partiallyScheduled = 0;
	let unscheduled = 0;

	for (const student of students) {
		const assignedDays = studentAssignments.get(student.id!) || 0;

		if (assignedDays >= totalRequiredDays) {
			fullyScheduled++;
		} else if (assignedDays > 0) {
			partiallyScheduled++;
		} else {
			unscheduled++;
		}
	}

	return {
		isAuthenticated: true,
		stats: {
			total_students: students.length,
			total_preceptors: preceptors.length,
			total_clerkships: clerkships.length,
			total_assignments: assignments.length,
			fully_scheduled_students: fullyScheduled,
			partially_scheduled_students: partiallyScheduled,
			unscheduled_students: unscheduled
		},
		activeSchedule
	};
};
