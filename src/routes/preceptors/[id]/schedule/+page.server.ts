/**
 * Preceptor Schedule Page - Server Load
 *
 * Loads the preceptor's schedule data including calendar and capacity
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const preceptorId = params.id;

	const response = await fetch(`/api/preceptors/${preceptorId}/schedule`);

	if (!response.ok) {
		if (response.status === 404) {
			throw error(404, 'Preceptor not found');
		}
		throw error(response.status, 'Failed to load preceptor schedule');
	}

	const result = await response.json();

	return {
		schedule: result.data,
		preceptorId
	};
};
