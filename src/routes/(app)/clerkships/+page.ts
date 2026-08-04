/**
 * Clerkships Page Load Function
 *
 * Fetches all clerkships from the API
 */

import type { PageLoad } from './$types';
import type { Clerkships } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [clerkshipsRes, activeRes] = await Promise.all([
			fetch('/api/clerkships'),
			fetch('/api/user/active-schedule')
		]);

		if (!clerkshipsRes.ok) {
			throw new Error('Failed to fetch clerkships');
		}

		const clerkshipsResult = await clerkshipsRes.json();
		const hasActiveSchedule = activeRes.ok
			? Boolean((await activeRes.json()).data?.schedule)
			: false;

		return {
			clerkships: clerkshipsResult.data as Clerkships[],
			hasActiveSchedule
		};
	} catch (error) {
		console.error('Error loading clerkships:', error);
		return {
			clerkships: [] as Clerkships[],
			hasActiveSchedule: false
		};
	}
};
