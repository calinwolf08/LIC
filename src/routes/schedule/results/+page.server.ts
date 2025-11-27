/**
 * Schedule Results Page - Server Load
 *
 * Loads the schedule generation results summary
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/schedule/summary');

	if (!response.ok) {
		throw error(response.status, 'Failed to load schedule summary');
	}

	const result = await response.json();

	return {
		summary: result.data
	};
};
