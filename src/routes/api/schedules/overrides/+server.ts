/**
 * GET /api/schedules/overrides (Step 17/32)
 *
 * Overrides in the active schedule, re-evaluated (active vs resolved), grouped
 * by consecutive days, filterable by code and paginated.
 *
 * Query params:
 *   - includeResolved=true   include exceptions that no longer apply (default: active only)
 *   - code=<override_code>    narrow to one code
 *   - page=<n>                1-based page (default 1)
 *   - pageSize=<n>            grouped rows per page (default 15, max 100)
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { listOverrides, groupOverrides } from '$lib/features/schedules/services/assignment-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-overrides');

export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	const includeResolved = url.searchParams.get('includeResolved') === 'true';
	const codeFilter = url.searchParams.get('code');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 15));

	try {
		let records = await listOverrides(db, scheduleId, { includeResolved });

		// Count by code across the current (active/included) set — powers the filter.
		const countsByCode: Record<string, number> = {};
		for (const r of records) {
			for (const c of r.codes) countsByCode[c] = (countsByCode[c] ?? 0) + 1;
		}

		if (codeFilter) records = records.filter((r) => r.codes.includes(codeFilter));

		const grouped = groupOverrides(records);
		const total = grouped.length;
		const start = (page - 1) * pageSize;
		const overrides = grouped.slice(start, start + pageSize);

		return successResponse({
			overrides,
			total,
			page,
			pageSize,
			countsByCode,
			includeResolved
		});
	} catch (err) {
		log.error('Failed to list overrides', { error: err });
		return errorResponse('Failed to load overrides', 500);
	}
};
