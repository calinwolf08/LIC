/**
 * Preceptor Detail Page Load
 *
 * Loads the preceptor, its resolved schedule (availability + assignments +
 * capacity), and the health-system/site lists for the inline edit form.
 */

import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
	const [preceptorRes, scheduleRes, healthSystemsRes, sitesRes] = await Promise.all([
		fetch(`/api/preceptors/${params.id}`),
		fetch(`/api/preceptors/${params.id}/schedule`),
		fetch('/api/health-systems'),
		fetch('/api/sites')
	]);

	if (!preceptorRes.ok) {
		// 400 (malformed id) reads as not-found for the user (e2e finding P1-d).
		if (preceptorRes.status === 404 || preceptorRes.status === 400)
			throw error(404, 'Preceptor not found');
		throw error(preceptorRes.status, 'Failed to load preceptor');
	}

	const preceptor = (await preceptorRes.json()).data;
	const schedule = scheduleRes.ok ? (await scheduleRes.json()).data : null;
	const healthSystems = healthSystemsRes.ok ? ((await healthSystemsRes.json()).data ?? []) : [];
	const sites = sitesRes.ok ? ((await sitesRes.json()).data ?? []) : [];

	return { preceptor, schedule, healthSystems, sites, preceptorId: params.id };
};
