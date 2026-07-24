/**
 * Students Page Load Function
 *
 * Fetches all students and their requirement status (completed / scheduled /
 * unscheduled) from the status service.
 */

import type { PageLoad } from './$types';
import type { Students } from '$lib/db/types';
import type { StudentStatus } from '$lib/features/scheduling/services/requirement-status';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [studentsResponse, statusResponse] = await Promise.all([
			fetch('/api/students'),
			fetch('/api/schedules/status')
		]);

		if (!studentsResponse.ok) {
			throw new Error('Failed to fetch students');
		}

		const studentsResult = await studentsResponse.json();

		const statuses: Record<string, StudentStatus> = {};
		if (statusResponse.ok) {
			const statusResult = await statusResponse.json();
			for (const s of (statusResult.data ?? []) as StudentStatus[]) {
				statuses[s.student_id] = s;
			}
		}

		return {
			students: studentsResult.data as Students[],
			statuses
		};
	} catch (error) {
		console.error('Error loading students:', error);
		return {
			students: [] as Students[],
			statuses: {} as Record<string, StudentStatus>
		};
	}
};
