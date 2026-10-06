/**
 * Preceptor Detail Page Load
 *
 * Loads the preceptor, its resolved schedule (availability + assignments +
 * capacity), and the health-system/site lists for the inline edit form.
 */

import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
	const [preceptorRes, scheduleRes, healthSystemsRes, sitesRes, preceptorsRes, exclusionsRes] =
		await Promise.all([
			fetch(`/api/preceptors/${params.id}`),
			fetch(`/api/preceptors/${params.id}/schedule`),
			fetch('/api/health-systems'),
			fetch('/api/sites'),
			fetch('/api/preceptors'),
			fetch(`/api/preceptors/${params.id}/mutual-exclusions`)
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
	// Other preceptors in the active schedule + this preceptor's mutual-exclusion set (L2).
	const allPreceptors = preceptorsRes.ok ? ((await preceptorsRes.json()).data ?? []) : [];
	const otherPreceptors = (allPreceptors as Array<{ id: string; name: string }>).filter(
		(p) => p.id !== params.id
	);
	const mutualExclusionIds = exclusionsRes.ok
		? ((await exclusionsRes.json()).data?.preceptor_ids ?? [])
		: [];

	return {
		preceptor,
		schedule,
		healthSystems,
		sites,
		preceptorId: params.id,
		otherPreceptors,
		mutualExclusionIds
	};
};
