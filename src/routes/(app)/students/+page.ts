/**
 * Students Page Load Function
 *
 * Fetches all students and their completion stats from the API
 */

import type { PageLoad } from './$types';
import type { Students } from '$lib/db/types';

interface CompletionStats {
	scheduledDays: number;
	requiredDays: number;
	percentage: number;
}

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Fetch students and completion stats in parallel
		const [studentsResponse, completionResponse] = await Promise.all([
			fetch('/api/students'),
			fetch('/api/students/completion-stats')
		]);

		if (!studentsResponse.ok) {
			throw new Error('Failed to fetch students');
		}

		const studentsResult = await studentsResponse.json();

		// Completion stats are optional - don't fail if unavailable
		let completionStats: Record<string, CompletionStats> = {};
		if (completionResponse.ok) {
			const completionResult = await completionResponse.json();
			completionStats = completionResult.data || {};
		}

		return {
			students: studentsResult.data as Students[],
			completionStats
		};
	} catch (error) {
		console.error('Error loading students:', error);
		return {
			students: [] as Students[],
			completionStats: {} as Record<string, CompletionStats>
		};
	}
};
