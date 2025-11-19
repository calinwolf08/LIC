/**
 * Clerkship Configuration Detail Page - Server Load
 *
 * Loads complete configuration for a specific clerkship
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	// Fetch complete clerkship configuration from API
	const response = await fetch(`/api/scheduling-config/clerkships/${params.id}`);

	if (!response.ok) {
		throw error(404, 'Clerkship configuration not found');
	}

	const result = await response.json();

	return {
		clerkshipId: params.id,
		configuration: result.data,
	};
};
