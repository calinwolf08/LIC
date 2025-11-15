/**
 * Calendar Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getStudents } from '$lib/features/students/services/student-service';
import { getPreceptors } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkships } from '$lib/features/clerkships/services/clerkship-service';

export const load: PageServerLoad = async () => {
	// Load filter options
	const [students, preceptors, clerkships] = await Promise.all([
		getStudents(db),
		getPreceptors(db),
		getClerkships(db)
	]);

	return {
		students,
		preceptors,
		clerkships
	};
};
