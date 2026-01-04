/**
 * Health System Detail Page Load Function
 *
 * Loads health system details and dependencies
 */

import type { PageLoad } from './$types';
import type { HealthSystems } from '$lib/db/types';
import { error } from '@sveltejs/kit';

interface DependencyDetails {
	sites: Array<{ id: string; name: string; address?: string | null }>;
	preceptors: Array<{ id: string; name: string; email?: string | null }>;
	studentOnboarding: Array<{ studentId: string; studentName: string }>;
}

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		// Load health system and dependencies in parallel
		const [hsResponse, depsResponse] = await Promise.all([
			fetch(`/api/health-systems/${params.id}`),
			fetch(`/api/health-systems/${params.id}/dependencies`)
		]);

		if (!hsResponse.ok) {
			if (hsResponse.status === 404) {
				throw error(404, 'Health system not found');
			}
			throw new Error('Failed to fetch health system');
		}

		const hsResult = await hsResponse.json();
		const healthSystem = hsResult.data as HealthSystems;

		// Parse dependencies
		let dependencies: DependencyDetails = {
			sites: [],
			preceptors: [],
			studentOnboarding: []
		};

		let dependencyCounts = { sites: 0, preceptors: 0, studentOnboarding: 0, total: 0 };

		if (depsResponse.ok) {
			const depsResult = await depsResponse.json();
			if (depsResult.data) {
				dependencyCounts = depsResult.data;
			}
		}

		// Fetch detailed dependency lists
		const [sitesResponse, preceptorsResponse] = await Promise.all([
			fetch(`/api/sites?health_system_id=${params.id}`),
			fetch(`/api/preceptors?health_system_id=${params.id}`)
		]);

		if (sitesResponse.ok) {
			const sitesResult = await sitesResponse.json();
			dependencies.sites = (sitesResult.data || []).map((s: any) => ({
				id: s.id,
				name: s.name,
				address: s.address
			}));
		}

		if (preceptorsResponse.ok) {
			const preceptorsResult = await preceptorsResponse.json();
			dependencies.preceptors = (preceptorsResult.data || []).map((p: any) => ({
				id: p.id,
				name: p.name,
				email: p.email
			}));
		}

		// Calculate if we can delete
		const canDelete = dependencyCounts.sites === 0 && dependencyCounts.preceptors === 0;

		let deleteTooltip = '';
		if (!canDelete) {
			const parts = ['Cannot delete: This health system has:'];
			if (dependencyCounts.sites > 0) {
				parts.push(`• ${dependencyCounts.sites} site${dependencyCounts.sites > 1 ? 's' : ''}`);
			}
			if (dependencyCounts.preceptors > 0) {
				parts.push(`• ${dependencyCounts.preceptors} preceptor${dependencyCounts.preceptors > 1 ? 's' : ''}`);
			}
			parts.push('', 'Remove or reassign these before deleting.');
			deleteTooltip = parts.join('\n');
		}

		return {
			healthSystem,
			dependencies,
			dependencyCounts,
			canDelete,
			deleteTooltip
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load health system');
	}
};
