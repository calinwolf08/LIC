import type { Selectable } from 'kysely';
import type { Students, Clerkships } from '$lib/db/types';
import type { SchedulingContext, UnmetRequirement } from '../types';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling:requirement-tracker');

/**
 * Get the clerkship that a student needs most urgently
 *
 * Returns the clerkship with the most remaining days needed.
 * If tied, returns the first one.
 *
 * @param studentId - Student to check
 * @param context - Scheduling context
 * @returns The most needed clerkship, or null if all requirements met
 */
export function getMostNeededClerkship(
	studentId: string,
	context: SchedulingContext
): Selectable<Clerkships> | null {
	const studentReqs = context.studentRequirements.get(studentId);
	if (!studentReqs) return null;

	let maxNeeded = 0;
	let mostNeededClerkshipId: string | null = null;

	for (const [clerkshipId, daysNeeded] of studentReqs.entries()) {
		if (daysNeeded > maxNeeded) {
			maxNeeded = daysNeeded;
			mostNeededClerkshipId = clerkshipId;
		}
	}

	if (!mostNeededClerkshipId || maxNeeded === 0) {
		return null;
	}

	return context.clerkships.find((c) => c.id === mostNeededClerkshipId) || null;
}

/**
 * Get all students who still need assignments
 *
 * @param context - Scheduling context
 * @returns Array of students with unmet requirements
 */
export function getStudentsNeedingAssignments(
	context: SchedulingContext
): Selectable<Students>[] {
	return context.students.filter((student) => {
		const requirements = context.studentRequirements.get(student.id!);
		if (!requirements) return false;

		// Check if any requirement has days remaining
		for (const daysNeeded of requirements.values()) {
			if (daysNeeded > 0) {
				return true;
			}
		}
		return false;
	});
}

/**
 * Check which student requirements were not fully met
 *
 * @param context - Scheduling context with final assignments
 * @returns Array of unmet requirements
 */
export function checkUnmetRequirements(context: SchedulingContext): UnmetRequirement[] {
	log.debug('Checking unmet requirements', {
		studentCount: context.students.length,
		clerkshipCount: context.clerkships.length
	});

	const unmet: UnmetRequirement[] = [];

	for (const student of context.students) {
		const requirements = context.studentRequirements.get(student.id!);
		if (!requirements) continue;

		for (const [clerkshipId, daysNeeded] of requirements.entries()) {
			if (daysNeeded > 0) {
				const clerkship = context.clerkships.find((c) => c.id === clerkshipId);
				if (!clerkship) continue;

				const assignedDays = Number(clerkship.required_days) - daysNeeded;

				unmet.push({
					studentId: student.id!,
					studentName: student.name,
					clerkshipId: clerkship.id!,
					clerkshipName: clerkship.name,
					requiredDays: Number(clerkship.required_days),
					assignedDays,
					remainingDays: daysNeeded,
				});
			}
		}
	}

	if (unmet.length > 0) {
		log.warn('Unmet requirements found', {
			unmetCount: unmet.length,
			totalStudents: context.students.length
		});
	} else {
		log.info('All requirements met', {
			studentCount: context.students.length
		});
	}

	return unmet;
}

/**
 * Initialize student requirements map
 *
 * Creates a map of studentId -> clerkshipId -> days needed
 *
 * @param students - All students
 * @param clerkships - All clerkships with required_days
 * @returns Map of student requirements
 */
export function initializeStudentRequirements(
	students: Selectable<Students>[],
	clerkships: Selectable<Clerkships>[]
): Map<string, Map<string, number>> {
	log.debug('Initializing student requirements', {
		studentCount: students.length,
		clerkshipCount: clerkships.length
	});

	const requirements = new Map<string, Map<string, number>>();

	for (const student of students) {
		const studentReqs = new Map<string, number>();
		for (const clerkship of clerkships) {
			studentReqs.set(clerkship.id!, Number(clerkship.required_days));
		}
		requirements.set(student.id!, studentReqs);
	}

	const totalDays = students.length * clerkships.reduce((sum, c) => sum + Number(c.required_days), 0);

	log.info('Student requirements initialized', {
		studentCount: students.length,
		clerkshipCount: clerkships.length,
		totalDaysRequired: totalDays
	});

	return requirements;
}
