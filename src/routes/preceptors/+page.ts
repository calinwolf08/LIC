/**
 * Preceptors Page Load Function
 *
 * Fetches all preceptors from the API
 */

import type { PageLoad } from './$types';
import type { PreceptorsTable } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/preceptors');

		if (!response.ok) {
			throw new Error('Failed to fetch preceptors');
		}

		const result = await response.json();

		return {
			preceptors: result.data as PreceptorsTable[]
		};
	} catch (error) {
		console.error('Error loading preceptors:', error);
		return {
			preceptors: [] as PreceptorsTable[]
		};
	}
};
