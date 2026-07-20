/**
 * Manual assignment creation (Step 09)
 *
 * POST /api/schedules/assignments
 *   Body (single):  { student_id, preceptor_id, clerkship_id, site_id?, date, locked?, dry_run?, force? }
 *   Body (bulk):    { student_id, preceptor_id, clerkship_id, site_id?, start_date, end_date,
 *                     weekdays?: number[], skip_blackouts?: boolean, locked?, dry_run?, force? }
 *
 * dry_run returns validation only. Hard violations always reject; soft
 * violations reject unless force=true (then they are returned as warnings).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { json } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import {
	createManualAssignment,
	createManualAssignmentsBulk
} from '$lib/features/schedules/services/assignment-service';
import { validateAssignmentCandidate } from '$lib/features/scheduling/services/assignment-validation';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-assignments');

const baseSchema = z.object({
	student_id: z.string().min(1),
	preceptor_id: z.string().min(1),
	clerkship_id: z.string().min(1),
	site_id: z.string().min(1).nullish(),
	locked: z.boolean().optional(),
	dry_run: z.boolean().optional(),
	force: z.boolean().optional()
});

const singleSchema = baseSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const bulkSchema = baseSchema.extend({
	start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	weekdays: z.array(z.number().int().min(0).max(6)).optional(),
	skip_blackouts: z.boolean().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	const isBulk = typeof (body as Record<string, unknown>)?.start_date === 'string';

	try {
		if (isBulk) {
			const input = bulkSchema.parse(body);
			if (input.dry_run) {
				// Validate the first in-range date as a representative preview.
				const preview = await validateAssignmentCandidate(db, scheduleId, {
					student_id: input.student_id,
					preceptor_id: input.preceptor_id,
					clerkship_id: input.clerkship_id,
					site_id: input.site_id ?? null,
					date: input.start_date
				});
				return successResponse({ valid: preview.valid, hard: preview.hard, soft: preview.soft });
			}
			const result = await createManualAssignmentsBulk(db, scheduleId, input, {
				force: input.force
			});
			return successResponse(result);
		}

		const input = singleSchema.parse(body);
		const candidate = {
			student_id: input.student_id,
			preceptor_id: input.preceptor_id,
			clerkship_id: input.clerkship_id,
			site_id: input.site_id ?? null,
			date: input.date
		};

		if (input.dry_run) {
			const v = await validateAssignmentCandidate(db, scheduleId, candidate);
			return successResponse({ valid: v.valid, hard: v.hard, soft: v.soft });
		}

		const result = await createManualAssignment(
			db,
			scheduleId,
			{ ...candidate, locked: input.locked },
			{
				force: input.force
			}
		);
		if (!result.ok) {
			return json(
				{
					success: false,
					error: {
						message:
							result.hard.length > 0
								? 'Assignment has conflicts that must be resolved'
								: 'Assignment has warnings; resubmit with force to override',
						hard: result.hard,
						soft: result.soft
					}
				},
				{ status: 422 }
			);
		}
		return successResponse({ assignment: result.assignment, warnings: result.warnings }, 201);
	} catch (err) {
		if (err instanceof z.ZodError) {
			return errorResponse('Invalid request', 400, err.issues);
		}
		log.error('Failed to create manual assignment', { error: err });
		return errorResponse('Failed to create assignment', 500);
	}
};
