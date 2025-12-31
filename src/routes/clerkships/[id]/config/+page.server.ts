/**
 * Clerkship Configuration Page - Server Load
 *
 * Loads clerkship details, settings, sites (associated and all), and teams
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const clerkshipId = params.id;

	// Fetch clerkship, settings, sites, all sites, teams, requirements, and preceptors in parallel
	const [clerkshipRes, settingsRes, sitesRes, allSitesRes, teamsRes, requirementsRes, preceptorsRes] = await Promise.all([
		fetch(`/api/clerkships/${clerkshipId}`),
		fetch(`/api/clerkships/${clerkshipId}/settings`),
		fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`),
		fetch('/api/sites'),
		fetch(`/api/preceptors/teams?clerkshipId=${clerkshipId}`),
		fetch(`/api/clerkships/${clerkshipId}/requirements`),
		fetch('/api/preceptors')
	]);

	if (!clerkshipRes.ok) {
		throw error(404, 'Clerkship not found');
	}

	const clerkship = await clerkshipRes.json();
	const settings = settingsRes.ok ? await settingsRes.json() : { data: null };
	const sites = sitesRes.ok ? await sitesRes.json() : { data: [] };
	const allSites = allSitesRes.ok ? await allSitesRes.json() : { data: [] };
	const teams = teamsRes.ok ? await teamsRes.json() : { data: [] };
	const requirements = requirementsRes.ok ? await requirementsRes.json() : { data: [] };
	const preceptors = preceptorsRes.ok ? await preceptorsRes.json() : { data: [] };

	// Find the requirement matching the clerkship type for electives
	const clerkshipType = clerkship.data?.clerkship_type;
	const requirement = requirements.data?.find((r: any) => r.requirement_type === clerkshipType);

	return {
		clerkship: clerkship.data,
		settings: settings.data,
		sites: sites.data || [],
		allSites: allSites.data || [],
		teams: teams.data || [],
		requirementId: requirement?.id || null,
		allPreceptors: preceptors.data || []
	};
};
