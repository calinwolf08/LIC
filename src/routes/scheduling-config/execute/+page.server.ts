/**
 * Scheduling Execution Page - Server Load
 *
 * Loads students and clerkships for scheduling execution
 */

import { db } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Load all students
	const students = await db
		.selectFrom('students')
		.selectAll()
		.orderBy('name', 'asc')
		.execute();

	// Load all clerkships
	const clerkships = await db
		.selectFrom('clerkships')
		.selectAll()
		.orderBy('name', 'asc')
		.execute();

	return {
		students,
		clerkships,
	};
};
