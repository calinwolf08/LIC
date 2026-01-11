/**
 * API endpoint to mark user's welcome modal as completed
 * POST /api/user/welcome-completed
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:user:welcome-completed');

/**
 * POST /api/user/welcome-completed
 * Marks the current user's welcome modal as completed
 */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		const userId = locals.session?.user?.id;
		if (!userId) {
			log.warn('No user session found');
			return errorResponse('Authentication required', 401);
		}

		await db
			.updateTable('user')
			.set({ welcome_completed: 1 })
			.where('id', '=', userId)
			.execute();

		log.info('Welcome completed for user', { userId });
		return successResponse({ success: true });
	} catch (error) {
		log.error('Failed to mark welcome as completed', { error });
		return errorResponse('Failed to update user', 500);
	}
};
