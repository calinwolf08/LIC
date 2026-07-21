/**
 * Clerkship Detail Page - Server Load
 *
 * Loads the clerkship, its settings, associated + all sites, teams, and the
 * per-student requirement status (for the Overview aggregate).
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const clerkshipId = params.id;

	const [clerkshipRes, settingsRes, sitesRes, allSitesRes, teamsRes, statusRes] = await Promise.all([
		fetch(`/api/clerkships/${clerkshipId}`),
		fetch(`/api/clerkships/${clerkshipId}/settings`),
		fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`),
		fetch('/api/sites'),
		fetch(`/api/preceptors/teams?clerkshipId=${clerkshipId}`),
		fetch('/api/schedules/status')
	]);

	if (!clerkshipRes.ok) {
		throw error(404, 'Clerkship not found');
	}

	const clerkship = await clerkshipRes.json();
	const settings = settingsRes.ok ? await settingsRes.json() : { data: null };
	const sites = sitesRes.ok ? await sitesRes.json() : { data: [] };
	const allSites = allSitesRes.ok ? await allSitesRes.json() : { data: [] };
	const teams = teamsRes.ok ? await teamsRes.json() : { data: [] };
	const statuses = statusRes.ok ? (await statusRes.json()).data ?? [] : [];

	return {
		clerkship: clerkship.data,
		settings: settings.data,
		sites: sites.data || [],
		allSites: allSites.data || [],
		teams: teams.data || [],
		statuses
	};
};
