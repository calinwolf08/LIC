/**
 * Clerkships Page Load Function
 *
 * Fetches all clerkships from the API
 */

import type { PageLoad } from './$types';
import type { Clerkships } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/clerkships');

		if (!response.ok) {
			throw new Error('Failed to fetch clerkships');
		}

		const result = await response.json();

		return {
			clerkships: result.data as Clerkships[]
		};
	} catch (error) {
		console.error('Error loading clerkships:', error);
		return {
			clerkships: [] as Clerkships[]
		};
	}
};
