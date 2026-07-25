/**
 * Site Detail Page Load
 *
 * Loads a site and the health-system list for the inline edit form.
 */

import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
	const [siteRes, hsRes] = await Promise.all([
		fetch(`/api/sites/${params.id}`),
		fetch('/api/health-systems')
	]);

	if (!siteRes.ok) {
		if (siteRes.status === 404) throw error(404, 'Site not found');
		throw error(siteRes.status, 'Failed to load site');
	}

	const site = (await siteRes.json()).data;
	const healthSystems = hsRes.ok
		? ((await hsRes.json()).data ?? [])
				.filter((hs: { id: string | null }) => hs.id)
				.map((hs: { id: string; name: string }) => ({ id: hs.id, name: hs.name }))
		: [];

	return { site, healthSystems, siteId: params.id };
};
