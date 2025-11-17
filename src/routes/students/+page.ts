/**
 * Students Page Load Function
 *
 * Fetches all students from the API
 */

import type { PageLoad } from './$types';
import type { Students } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/students');

		if (!response.ok) {
			throw new Error('Failed to fetch students');
		}

		const result = await response.json();

		return {
			students: result.data as Students[]
		};
	} catch (error) {
		console.error('Error loading students:', error);
		return {
			students: [] as Students[]
		};
	}
};
