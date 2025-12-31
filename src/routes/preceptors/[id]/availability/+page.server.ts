/**
 * Preceptor Availability Page - Server Load
 *
 * Loads the preceptor data with their associated sites for the availability management page
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { getPreceptorById, getPreceptorSites } from '$lib/features/preceptors/services/preceptor-service';

export const load: PageServerLoad = async ({ params }) => {
	const preceptorId = params.id;

	// Get preceptor
	const preceptor = await getPreceptorById(db, preceptorId);

	if (!preceptor || !preceptor.id) {
		throw error(404, 'Preceptor not found');
	}

	// Get site IDs for this preceptor
	const siteIds = await getPreceptorSites(db, preceptorId);

	// Get full site details
	const sites = await db
		.selectFrom('sites')
		.select(['id', 'name'])
		.where('id', 'in', siteIds.length > 0 ? siteIds : ['__none__'])
		.execute();

	return {
		preceptor: {
			id: preceptor.id,
			name: preceptor.name,
			sites: sites.map(s => ({ id: s.id!, name: s.name }))
		}
	};
};
