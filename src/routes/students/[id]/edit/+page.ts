/**
 * Edit Student Page Load Function
 *
 * Fetches a single student for editing
 */

import type { PageLoad } from './$types';
import type { Students } from '$lib/db/types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		const response = await fetch(`/api/students/${params.id}`);

		if (!response.ok) {
			if (response.status === 404) {
				throw error(404, 'Student not found');
			}
			throw new Error('Failed to fetch student');
		}

		const result = await response.json();

		return {
			student: result.data as Students
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load student');
	}
};
