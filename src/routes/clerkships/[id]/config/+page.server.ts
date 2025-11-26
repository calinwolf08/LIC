/**
 * Clerkship Configuration Page - Server Load
 *
 * Loads clerkship details, settings, sites (associated and all), and teams
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const clerkshipId = params.id;

	// Fetch clerkship, settings, sites, all sites, and teams in parallel
	const [clerkshipRes, settingsRes, sitesRes, allSitesRes, teamsRes] = await Promise.all([
		fetch(`/api/clerkships/${clerkshipId}`),
		fetch(`/api/clerkships/${clerkshipId}/settings`),
		fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`),
		fetch('/api/sites'),
		fetch(`/api/preceptors/teams?clerkshipId=${clerkshipId}`)
	]);

	if (!clerkshipRes.ok) {
		throw error(404, 'Clerkship not found');
	}

	const clerkship = await clerkshipRes.json();
	const settings = settingsRes.ok ? await settingsRes.json() : { data: null };
	const sites = sitesRes.ok ? await sitesRes.json() : { data: [] };
	const allSites = allSitesRes.ok ? await allSitesRes.json() : { data: [] };
	const teams = teamsRes.ok ? await teamsRes.json() : { data: [] };

	return {
		clerkship: clerkship.data,
		settings: settings.data,
		sites: sites.data || [],
		allSites: allSites.data || [],
		teams: teams.data || []
	};
};
