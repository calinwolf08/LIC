/**
 * Scheduling Configuration Page - Server Load
 *
 * Loads clerkships for configuration management
 */

import { db } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Load all clerkships
	const clerkships = await db
		.selectFrom('clerkships')
		.selectAll()
		.orderBy('name', 'asc')
		.execute();

	return {
		clerkships,
	};
};
