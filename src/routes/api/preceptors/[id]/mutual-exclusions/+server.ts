/**
 * Preceptor Mutual Exclusions API (client feedback L2)
 *
 * GET  /api/preceptors/[id]/mutual-exclusions - the preceptor ids this preceptor is
 *      marked not to share a student-day with.
 * PUT  /api/preceptors/[id]/mutual-exclusions - replace that set (symmetric).
 *
 * A rule between two preceptors is stored once, canonically (smaller id first), so
 * it applies in both directions. Assigning a student to both preceptors on one day
 * raises the soft `mutual_exclusion` warning; the paid auto-gen tier avoids it.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas.js';
import { canonicalPair } from '$lib/features/scheduling/services/mutual-exclusion';
import { createServerLogger } from '$lib/utils/logger.server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:preceptors:mutual-exclusions');

const putSchema = z.object({ preceptor_ids: z.array(z.string()).default([]) });

/** The other preceptor in each rule involving `id`. */
async function partnersOf(id: string): Promise<string[]> {
	const rows = await db
		.selectFrom('preceptor_mutual_exclusions')
		.select(['preceptor_a_id', 'preceptor_b_id'])
		.where((eb) => eb.or([eb('preceptor_a_id', '=', id), eb('preceptor_b_id', '=', id)]))
		.execute();
	return rows.map((r) => (r.preceptor_a_id === id ? r.preceptor_b_id : r.preceptor_a_id));
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { id } = preceptorIdSchema.parse({ id: params.id });
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', id);
		return successResponse({ preceptor_ids: await partnersOf(id) });
	} catch (error) {
		if (error instanceof ZodError) return errorResponse('Invalid preceptor id', 400);
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { id } = preceptorIdSchema.parse({ id: params.id });
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', id);

		const { preceptor_ids } = putSchema.parse(await request.json());
		// A preceptor cannot be mutually exclusive with itself.
		const unique = [...new Set(preceptor_ids)].filter((p) => p !== id);

		// Every partner must be a preceptor in the caller's active schedule (tenant
		// boundary + only real, in-scope preceptors).
		for (const preceptorId of unique) {
			await assertEntityInSchedule(db, scheduleId, 'preceptor', preceptorId);
		}

		await db.transaction().execute(async (trx) => {
			// Replace only this preceptor's rules, leaving rules between other pairs.
			await trx
				.deleteFrom('preceptor_mutual_exclusions')
				.where((eb) => eb.or([eb('preceptor_a_id', '=', id), eb('preceptor_b_id', '=', id)]))
				.execute();
			if (unique.length > 0) {
				await trx
					.insertInto('preceptor_mutual_exclusions')
					.values(
						unique.map((partner) => {
							const [a, b] = canonicalPair(id, partner);
							return { id: nanoid(), preceptor_a_id: a, preceptor_b_id: b };
						})
					)
					.execute();
			}
		});

		log.info('Mutual exclusions updated', { preceptorId: id, count: unique.length });
		return successResponse({ preceptor_ids: unique });
	} catch (error) {
		if (error instanceof ZodError) return errorResponse('Invalid request', 400);
		return handleApiError(error);
	}
};
