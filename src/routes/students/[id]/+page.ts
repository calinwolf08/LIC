/**
 * Student Detail Page Load Function
 *
 * Loads student data, onboarding status, and schedule information
 */

import type { PageLoad } from './$types';
import type { Students } from '$lib/db/types';
import { error } from '@sveltejs/kit';

interface OnboardingRecord {
	id: string;
	student_id: string;
	health_system_id: string;
	is_completed: number;
	completed_date: string | null;
}

interface HealthSystem {
	id: string;
	name: string;
}

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		// Load all required data in parallel
		const [studentRes, healthSystemsRes, onboardingRes, scheduleRes] = await Promise.all([
			fetch(`/api/students/${params.id}`),
			fetch('/api/health-systems'),
			fetch('/api/student-onboarding'),
			fetch(`/api/students/${params.id}/schedule`)
		]);

		if (!studentRes.ok) {
			if (studentRes.status === 404) {
				throw error(404, 'Student not found');
			}
			throw new Error('Failed to fetch student');
		}

		const studentResult = await studentRes.json();
		const student = studentResult.data as Students;

		// Health systems may not exist yet
		let healthSystems: HealthSystem[] = [];
		if (healthSystemsRes.ok) {
			const hsResult = await healthSystemsRes.json();
			healthSystems = hsResult.data || [];
		}

		// Build onboarding map for this student
		let onboardingStatus: Map<string, OnboardingRecord> = new Map();
		if (onboardingRes.ok) {
			const onboardingResult = await onboardingRes.json();
			const allRecords = (onboardingResult.data || []) as OnboardingRecord[];

			// Filter to this student's records
			for (const record of allRecords) {
				if (record.student_id === params.id) {
					onboardingStatus.set(record.health_system_id, record);
				}
			}
		}

		// Schedule data (may not exist if no scheduling period)
		let schedule = null;
		if (scheduleRes.ok) {
			const scheduleResult = await scheduleRes.json();
			schedule = scheduleResult.data;
		}

		return {
			student,
			healthSystems,
			onboardingStatus: Object.fromEntries(onboardingStatus),
			schedule,
			studentId: params.id
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load student');
	}
};
