/**
 * POST /api/schedules/assignments/side-effects (Step 17/18)
 *
 * Applies the follow-up actions an override conversation offers — raise a
 * preceptor's student limit, mark them available, move another student off a
 * day — as an explicit, separately audited call. Creation bundles the same
 * effects into its own transaction; this endpoint exists for the edit path,
 * where there is no create to bundle them with.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import {
	applyOverrideSideEffects,
	type OverrideSideEffect
} from '$lib/features/schedules/services/assignment-service';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-assignments-side-effects');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
	side_effects: z
		.array(
			z.discriminatedUnion('kind', [
				z.object({
					kind: z.literal('bump_preceptor_capacity'),
					preceptor_id: z.string().min(1),
					by: z.number().int().min(1).optional()
				}),
				z.object({
					kind: z.literal('mark_preceptor_available'),
					preceptor_id: z.string().min(1),
					site_id: z.string().min(1),
					dates: z.array(z.string().regex(DATE)).min(1)
				}),
				z.object({
					kind: z.literal('remove_conflicting_assignment'),
					assignment_id: z.string().min(1)
				})
			])
		)
		.min(1)
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

	try {
		const input = schema.parse(body);
		await db.transaction().execute(async (trx) => {
			await applyOverrideSideEffects(trx, input.side_effects as OverrideSideEffect[]);
		});
		return successResponse({ applied: input.side_effects.length });
	} catch (err) {
		if (err instanceof z.ZodError) return errorResponse('Invalid request', 400, err.issues);
		log.error('Failed to apply override side effects', { error: err });
		return errorResponse('Failed to apply the requested changes', 500);
	}
};
