/**
 * Student Schedule Page - Server Load
 *
 * Loads the student's schedule data including calendar and progress
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const studentId = params.id;

	const response = await fetch(`/api/students/${studentId}/schedule`);

	if (!response.ok) {
		if (response.status === 404) {
			throw error(404, 'Student not found');
		}
		throw error(response.status, 'Failed to load student schedule');
	}

	const result = await response.json();

	return {
		schedule: result.data,
		studentId
	};
};
