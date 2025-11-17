/**
 * Schedule Editing Service Layer
 *
 * Functions for manual schedule editing operations
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';
import type { UpdateAssignmentInput } from '../schemas.js';
import { NotFoundError, ValidationError } from '$lib/api/errors';
import {
	getAssignmentById,
	updateAssignment as updateAssignmentBase,
	validateAssignment
} from './assignment-service';

/**
 * Result type for editing operations
 */
export interface EditResult {
	valid: boolean;
	errors: string[];
	assignment?: Selectable<ScheduleAssignments>;
}

/**
 * Reassign a student to a different preceptor
 * @param dryRun If true, validate only without saving
 */
export async function reassignToPreceptor(
	db: Kysely<DB>,
	assignmentId: string,
	newPreceptorId: string,
	dryRun: boolean = false
): Promise<EditResult> {
	// Get existing assignment
	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	// Validate the reassignment
	const validation = await validateAssignment(
		db,
		{
			student_id: assignment.student_id,
			preceptor_id: newPreceptorId,
			clerkship_id: assignment.clerkship_id,
			date: assignment.date,
			status: assignment.status
		},
		assignmentId
	);

	if (!validation.valid) {
		return {
			valid: false,
			errors: validation.errors
		};
	}

	// If dry run, return validation result without saving
	if (dryRun) {
		return {
			valid: true,
			errors: []
		};
	}

	// Update the assignment
	const updated = await updateAssignmentBase(db, assignmentId, {
		preceptor_id: newPreceptorId
	});

	return {
		valid: true,
		errors: [],
		assignment: updated
	};
}

/**
 * Change the date of an assignment
 * @param dryRun If true, validate only without saving
 */
export async function changeAssignmentDate(
	db: Kysely<DB>,
	assignmentId: string,
	newDate: string,
	dryRun: boolean = false
): Promise<EditResult> {
	// Get existing assignment
	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	// Validate the date change
	const validation = await validateAssignment(
		db,
		{
			student_id: assignment.student_id,
			preceptor_id: assignment.preceptor_id,
			clerkship_id: assignment.clerkship_id,
			date: newDate,
			status: assignment.status
		},
		assignmentId
	);

	if (!validation.valid) {
		return {
			valid: false,
			errors: validation.errors
		};
	}

	// If dry run, return validation result without saving
	if (dryRun) {
		return {
			valid: true,
			errors: []
		};
	}

	// Update the assignment
	const updated = await updateAssignmentBase(db, assignmentId, {
		date: newDate
	});

	return {
		valid: true,
		errors: [],
		assignment: updated
	};
}

/**
 * Swap the preceptors of two assignments
 * @param dryRun If true, validate only without saving
 */
export async function swapAssignments(
	db: Kysely<DB>,
	assignmentId1: string,
	assignmentId2: string,
	dryRun: boolean = false
): Promise<{
	valid: boolean;
	errors: string[];
	assignments?: Selectable<ScheduleAssignments>[];
}> {
	// Get both assignments
	const [assignment1, assignment2] = await Promise.all([
		getAssignmentById(db, assignmentId1),
		getAssignmentById(db, assignmentId2)
	]);

	if (!assignment1 || !assignment2) {
		throw new NotFoundError('Assignment');
	}

	// Validate swapped assignments
	const [validation1, validation2] = await Promise.all([
		validateAssignment(
			db,
			{
				student_id: assignment1.student_id,
				preceptor_id: assignment2.preceptor_id,
				clerkship_id: assignment1.clerkship_id,
				date: assignment1.date,
				status: assignment1.status
			},
			assignmentId1
		),
		validateAssignment(
			db,
			{
				student_id: assignment2.student_id,
				preceptor_id: assignment1.preceptor_id,
				clerkship_id: assignment2.clerkship_id,
				date: assignment2.date,
				status: assignment2.status
			},
			assignmentId2
		)
	]);

	const errors = [...validation1.errors, ...validation2.errors];

	if (errors.length > 0) {
		return {
			valid: false,
			errors
		};
	}

	// If dry run, return validation result without saving
	if (dryRun) {
		return {
			valid: true,
			errors: []
		};
	}

	// Swap preceptors
	const [updated1, updated2] = await Promise.all([
		updateAssignmentBase(db, assignmentId1, { preceptor_id: assignment2.preceptor_id }),
		updateAssignmentBase(db, assignmentId2, { preceptor_id: assignment1.preceptor_id })
	]);

	return {
		valid: true,
		errors: [],
		assignments: [updated1, updated2]
	};
}

/**
 * Validate proposed changes to an assignment
 */
export async function validateEdit(
	db: Kysely<DB>,
	assignmentId: string,
	updates: UpdateAssignmentInput
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
	// Get current assignment
	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	// Merge updates with current values
	const merged = {
		student_id: updates.student_id || assignment.student_id,
		preceptor_id: updates.preceptor_id || assignment.preceptor_id,
		clerkship_id: updates.clerkship_id || assignment.clerkship_id,
		date: updates.date || assignment.date,
		status: updates.status || assignment.status
	};

	// Validate merged assignment
	const validation = await validateAssignment(db, merged, assignmentId);

	return {
		valid: validation.valid,
		errors: validation.errors,
		warnings: [] // Can add warnings logic later
	};
}

/**
 * Bulk reassign multiple assignments to a new preceptor
 */
export async function bulkReassign(
	db: Kysely<DB>,
	assignmentIds: string[],
	newPreceptorId: string
): Promise<{ successful: string[]; failed: { id: string; errors: string[] }[] }> {
	const successful: string[] = [];
	const failed: { id: string; errors: string[] }[] = [];

	for (const assignmentId of assignmentIds) {
		try {
			const result = await reassignToPreceptor(db, assignmentId, newPreceptorId, false);

			if (result.valid) {
				successful.push(assignmentId);
			} else {
				failed.push({ id: assignmentId, errors: result.errors });
			}
		} catch (error) {
			failed.push({
				id: assignmentId,
				errors: [error instanceof Error ? error.message : 'Unknown error']
			});
		}
	}

	return { successful, failed };
}

/**
 * Clear all assignments (for regeneration)
 */
export async function clearAllAssignments(db: Kysely<DB>): Promise<number> {
	const result = await db.deleteFrom('schedule_assignments').executeTakeFirst();
	return Number(result.numDeletedRows || 0);
}
