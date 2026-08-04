import { db } from '$lib/db';
import { SiteService } from '$lib/features/sites/services/site-service';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	const scheduleId = userId ? await getActiveScheduleId(userId) : null;

	// No active schedule → nothing to show (never fall back to a global list,
	// which would leak every tenant's locations).
	if (!scheduleId) {
		return { healthSystems: [], sites: [], hasActiveSchedule: false };
	}

	// The active schedule must actually exist (a dangling id after a delete still
	// reads as "no active schedule"), so the page can tell an unselected schedule
	// apart from a selected-but-empty one.
	const activeSchedule = await db
		.selectFrom('scheduling_periods')
		.select('id')
		.where('id', '=', scheduleId)
		.executeTakeFirst();
	if (!activeSchedule) {
		return { healthSystems: [], sites: [], hasActiveSchedule: false };
	}

	// Health systems and sites, both scoped to the active schedule through their
	// junction tables.
	const healthSystems = await db
		.selectFrom('health_systems')
		.innerJoin('schedule_health_systems', 'health_systems.id', 'schedule_health_systems.health_system_id')
		.where('schedule_health_systems.schedule_id', '=', scheduleId)
		.selectAll('health_systems')
		.orderBy('health_systems.name', 'asc')
		.execute();

	const sites = await new SiteService(db).getSitesBySchedule(scheduleId);

	const hsNameById = new Map(healthSystems.map((hs) => [hs.id, hs.name]));
	const sitesWithHealthSystems = sites.map((site) => ({
		...site,
		health_system_name: hsNameById.get(site.health_system_id) || 'Unknown'
	}));

	return {
		healthSystems,
		sites: sitesWithHealthSystems,
		hasActiveSchedule: true
	};
};
