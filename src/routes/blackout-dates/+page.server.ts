/**
 * Blackout Dates Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getBlackoutDates } from '$lib/features/blackout-dates/services/blackout-date-service';

export const load: PageServerLoad = async () => {
	const blackoutDates = await getBlackoutDates(db);

	return {
		blackoutDates
	};
};
