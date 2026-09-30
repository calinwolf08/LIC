/**
 * Schedule distribution API (client feedback K1)
 *
 * POST /api/schedules/distribute
 *   Body: { recipients: [{ type, id }], mode?: 'preview' | 'send' }
 *
 * Generates per-recipient, minimum-necessary views of the active schedule
 * (docs/plans/ferpa-scoping.md). `preview` (default) returns the redacted views
 * only. `send` additionally writes one audit row per recipient. Every recipient
 * must belong to the caller's active schedule — a recipient outside it is
 * rejected before any student data is read (tenant scope, §5).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { isApiError } from '$lib/api/errors';
import {
	buildRecipientViews,
	recordDistribution,
	type Recipient
} from '$lib/features/schedules/services/distribution-service';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:schedules:distribute');

const bodySchema = z.object({
	recipients: z
		.array(
			z.object({
				type: z.enum(['preceptor', 'student', 'site']),
				id: z.string().min(1)
			})
		)
		.min(1, 'Select at least one recipient')
		.max(200),
	mode: z.enum(['preview', 'send']).optional()
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
		const { recipients, mode = 'preview' } = bodySchema.parse(body);

		// De-duplicate (a recipient selected twice is one send).
		const seen = new Set<string>();
		const unique: Recipient[] = [];
		for (const r of recipients) {
			const key = `${r.type}:${r.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			unique.push(r);
		}

		// Tenant scope: every recipient must be in the caller's active schedule.
		// Throws NotFoundError (→ 404) on the first miss, before any data is read.
		for (const r of unique) {
			await assertEntityInSchedule(db, scheduleId, r.type, r.id);
		}

		const views = await buildRecipientViews(db, scheduleId, unique);

		if (mode === 'send') {
			const records = await recordDistribution(db, scheduleId, userId, views);
			log.info('Schedule distributed', {
				scheduleId,
				recipientCount: records.length,
				totalDays: records.reduce((sum, r) => sum + r.dayCount, 0)
			});
			return successResponse({ sent: true, records });
		}

		return successResponse({ sent: false, views });
	} catch (err) {
		if (err instanceof ZodError) return errorResponse('Invalid request', 400, err.issues);
		if (isApiError(err)) return errorResponse(err.message, err.status, err.details);
		log.error('Failed to distribute schedule', { error: err });
		return errorResponse('Failed to distribute schedule', 500);
	}
};
