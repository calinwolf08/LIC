/**
 * Client-side service for elective operations
 * All API logic in testable functions
 *
 * Electives link directly to clerkships (not through requirements).
 */

import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';

export interface ElectiveFormData {
	name: string;
	specialty: string | null;
	minimumDays: number;
	isRequired: boolean;
}

export interface ElectiveWithDetails extends ClerkshipElective {
	sites?: Array<{ id: string; name: string }>;
	preceptors?: Array<{ id: string; name: string }>;
}

export interface ElectiveDaysSummary {
	clerkshipRequiredDays: number;
	totalElectiveDays: number;
	remainingDays: number;
	nonElectiveDays: number;
}

/**
 * Fetch electives for a clerkship
 */
export async function fetchElectivesByClerkship(
	clerkshipId: string
): Promise<ClerkshipElective[]> {
	const response = await fetch(
		`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to fetch electives');
	}

	const result = await response.json();
	return result.data || [];
}

/**
 * Fetch elective days summary for a clerkship
 */
export async function fetchElectiveDaysSummary(
	clerkshipId: string
): Promise<ElectiveDaysSummary> {
	const response = await fetch(
		`/api/scheduling-config/electives/summary?clerkshipId=${clerkshipId}`
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to fetch elective days summary');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Fetch single elective with details
 */
export async function fetchElectiveWithDetails(
	electiveId: string
): Promise<ElectiveWithDetails> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}?details=true`
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to fetch elective');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Create new elective for a clerkship
 */
export async function createElective(
	clerkshipId: string,
	data: ElectiveFormData
): Promise<ClerkshipElective> {
	const response = await fetch(
		`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to create elective');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Update elective
 */
export async function updateElective(
	electiveId: string,
	data: Partial<ElectiveFormData>
): Promise<ClerkshipElective> {
	const response = await fetch(`/api/scheduling-config/electives/${electiveId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to update elective');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Delete elective
 */
export async function deleteElective(electiveId: string): Promise<void> {
	const response = await fetch(`/api/scheduling-config/electives/${electiveId}`, {
		method: 'DELETE'
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to delete elective');
	}
}

/**
 * Add site to elective
 */
export async function addSiteToElective(
	electiveId: string,
	siteId: string
): Promise<void> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}/sites`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ siteId })
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to add site');
	}
}

/**
 * Remove site from elective
 */
export async function removeSiteFromElective(
	electiveId: string,
	siteId: string
): Promise<void> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}/sites?siteId=${siteId}`,
		{
			method: 'DELETE'
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to remove site');
	}
}

/**
 * Add preceptor to elective
 */
export async function addPreceptorToElective(
	electiveId: string,
	preceptorId: string
): Promise<void> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}/preceptors`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ preceptorId })
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to add preceptor');
	}
}

/**
 * Remove preceptor from elective
 */
export async function removePreceptorFromElective(
	electiveId: string,
	preceptorId: string
): Promise<void> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}/preceptors?preceptorId=${preceptorId}`,
		{
			method: 'DELETE'
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to remove preceptor');
	}
}

/**
 * Fetch available preceptors for an elective (filtered by elective's sites)
 */
export async function fetchAvailablePreceptorsForElective(
	electiveId: string
): Promise<Array<{ id: string; name: string; siteId: string; siteName: string }>> {
	const response = await fetch(
		`/api/scheduling-config/electives/${electiveId}/available-preceptors`
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || 'Failed to fetch available preceptors');
	}

	const result = await response.json();
	return result.data || [];
}
