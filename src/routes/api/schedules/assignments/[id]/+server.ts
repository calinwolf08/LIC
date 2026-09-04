/**
 * Schedule Assignment API - Individual Assignment Endpoints
 *
 * GET /api/schedules/assignments/[id] - Get single assignment
 * PATCH /api/schedules/assignments/[id] - Update assignment
 * DELETE /api/schedules/assignments/[id] - Delete assignment
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, notFoundResponse } from '$lib/api/responses';
import { NotFoundError, ValidationError, handleApiError } from '$lib/api/errors';
import {
	getAssignmentById,
	deleteAssignment,
	setAssignmentLock,
	isDateInPast
} from '$lib/features/schedules/services/assignment-service.js';
import { updateAssignmentChecked } from '$lib/features/schedules/services/editing-service.js';
import { assignmentIdSchema, updateAssignmentSchema } from '$lib/features/schedules/schemas.js';
import { requireActiveScheduleId, assertAssignmentInSchedule } from '$lib/api/schedule-context';
import { hasAutogen } from '$lib/server/entitlements';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:schedules:assignments:id');

/**
 * GET /api/schedules/assignments/[id]
 * Returns a single assignment
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	log.debug('Fetching assignment', { id: params.id });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		// Tenant boundary: 404 unless the assignment's student is in the schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertAssignmentInSchedule(db, scheduleId, id);

		const assignment = await getAssignmentById(db, id);

		if (!assignment) {
			log.warn('Assignment not found', { id });
			return notFoundResponse('Assignment');
		}

		log.info('Assignment fetched', {
			id,
			studentId: assignment.student_id,
			preceptorId: assignment.preceptor_id,
			date: assignment.date
		});

		return successResponse(assignment);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid assignment ID format', {
				id: params.id,
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch assignment', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/schedules/assignments/[id]
 * Updates an assignment
 */
export const PATCH: RequestHandler = async ({ params, request, url, locals }) => {
	const force = url.searchParams.get('force') === 'true';
	log.debug('Updating assignment', { id: params.id, force });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		// Ownership guard: 404 unless the assignment's student is in the schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertAssignmentInSchedule(db, scheduleId, id);

		const body = await request.json();

		// Handle the lock toggle separately (not part of updateAssignmentSchema).
		// Locking is a Stage 2 concept: ignore it from callers without `autogen`.
		if (typeof body?.locked === 'boolean' && hasAutogen(locals)) {
			await setAssignmentLock(db, id, body.locked);
		}

		// Pull the override envelope out before schema-parsing the field updates.
		const {
			locked: _locked,
			force: _force,
			override_codes,
			override_note,
			...rest
		} = body ?? {};
		if (Object.keys(rest).length === 0) {
			const current = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('id', '=', id)
				.executeTakeFirst();
			return successResponse(current);
		}

		const updates = updateAssignmentSchema.parse(rest);
		// The edit runs the single validator (Phase 1b.3). `?force=true` (used by
		// the dialog for a past-date edit) accepts all soft codes; explicit
		// override_codes accept individual ones.
		const result = await updateAssignmentChecked(
			db,
			id,
			{
				preceptor_id: updates.preceptor_id,
				clerkship_id: updates.clerkship_id,
				site_id: updates.site_id,
				elective_id: updates.elective_id,
				date: updates.date,
				status: updates.status
			},
			{ force, overrideCodes: override_codes, overrideNote: override_note }
		);

		if (!result.valid) {
			return json(
				{
					success: false,
					error: {
						message:
							result.hard.length > 0
								? 'Update has conflicts that must be resolved'
								: 'Update has warnings that must be accepted first',
						hard: result.hard,
						soft: result.soft
					}
				},
				{ status: 422 }
			);
		}

		log.info('Assignment updated', {
			id,
			updatedFields: Object.keys(updates)
		});

		return successResponse(result.assignment);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Assignment update validation failed', {
				id: params.id,
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment not found for update', { id: params.id });
			return notFoundResponse('Assignment');
		}

		if (error instanceof ValidationError) {
			log.warn('Assignment update validation error', {
				id: params.id,
				message: error.message
			});
			return validationErrorResponse(
				new ZodError([
					{
						code: 'custom',
						path: [],
						message: error.message
					}
				])
			);
		}

		log.error('Failed to update assignment', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/schedules/assignments/[id]?force=true
 *
 * Deletes an assignment. A past-dated assignment is protected by default: it
 * returns 409 carrying the `past_date` code so the UI can offer the explicit
 * "Remove anyway" override (Step 17/19).
 */
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const force = url.searchParams.get('force') === 'true';
	log.debug('Deleting assignment', { id: params.id, force });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		// Ownership guard: 404 unless the assignment's student is in the schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertAssignmentInSchedule(db, scheduleId, id);

		if (!force) {
			const existing = await getAssignmentById(db, id);
			if (!existing) return notFoundResponse('Assignment');
			if (isDateInPast(existing.date)) {
				log.info('Past-dated assignment deletion blocked', { id, date: existing.date });
				return json(
					{
						success: false,
						error: {
							message: `${existing.date} has already passed. Removing it needs an explicit override.`,
							code: 'past_date',
							details: { date: existing.date }
						}
					},
					{ status: 409 }
				);
			}
		}

		await deleteAssignment(db, id, force);

		log.info('Assignment deleted', { id, force });
		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid assignment ID format for deletion', {
				id: params.id,
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment not found for deletion', { id: params.id });
			return notFoundResponse('Assignment');
		}

		log.error('Failed to delete assignment', { id: params.id, error });
		return handleApiError(error);
	}
};
