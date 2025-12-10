/**
 * Schedule Duplication Service
 *
 * Handles duplicating schedules with selected entities.
 * Does NOT copy entities - instead associates existing entities with the new schedule.
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, SchedulingPeriods } from '$lib/db/types';
import {
	createSchedulingPeriod,
	getScheduleEntities,
	addEntitiesToSchedule,
	type ScheduleEntityType,
} from '$lib/features/scheduling/services/scheduling-period-service';

/**
 * Options for which entities to duplicate to a new schedule
 */
export interface DuplicationOptions {
	/** Student IDs to include, or 'all' for all from source */
	students?: string[] | 'all';
	/** Preceptor IDs to include, or 'all' for all from source */
	preceptors?: string[] | 'all';
	/** Site IDs to include, or 'all' for all from source */
	sites?: string[] | 'all';
	/** Health system IDs to include, or 'all' for all from source */
	healthSystems?: string[] | 'all';
	/** Clerkship IDs to include, or 'all' for all from source */
	clerkships?: string[] | 'all';
	/** Team IDs to include, or 'all' for all from source */
	teams?: string[] | 'all';
	/** Configuration IDs to include, or 'all' for all from source */
	configurations?: string[] | 'all';
}

/**
 * Result of schedule duplication
 */
export interface DuplicationResult {
	schedule: Selectable<SchedulingPeriods>;
	entityCounts: {
		students: number;
		preceptors: number;
		sites: number;
		healthSystems: number;
		clerkships: number;
		teams: number;
		configurations: number;
	};
}

/**
 * Duplicate a schedule with selected entities
 *
 * @param db Database connection
 * @param sourceScheduleId ID of the schedule to duplicate from (optional)
 * @param name Name for the new schedule
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @param year Year number
 * @param options Which entities to include
 * @returns The newly created schedule with entity counts
 */
export async function duplicateToNewSchedule(
	db: Kysely<DB>,
	sourceScheduleId: string | null,
	name: string,
	startDate: string,
	endDate: string,
	year: number,
	options: DuplicationOptions
): Promise<DuplicationResult> {
	// Create the new schedule (not active by default)
	const newSchedule = await createSchedulingPeriod(db, {
		name,
		start_date: startDate,
		end_date: endDate,
		is_active: false,
	});

	// Update the year field separately since createSchedulingPeriod doesn't support it
	await db
		.updateTable('scheduling_periods')
		.set({ year })
		.where('id', '=', newSchedule.id!)
		.execute();

	const entityCounts = {
		students: 0,
		preceptors: 0,
		sites: 0,
		healthSystems: 0,
		clerkships: 0,
		teams: 0,
		configurations: 0,
	};

	// Helper to resolve entity IDs
	async function resolveEntityIds(
		entityType: ScheduleEntityType,
		selection: string[] | 'all' | undefined
	): Promise<string[]> {
		if (!selection) {
			return [];
		}

		if (selection === 'all') {
			if (!sourceScheduleId) {
				// If no source, get all entities from the entity table
				return await getAllEntityIds(db, entityType);
			}
			return await getScheduleEntities(db, sourceScheduleId, entityType);
		}

		return selection;
	}

	// Add students
	const studentIds = await resolveEntityIds('students', options.students);
	if (studentIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'students', studentIds);
		entityCounts.students = studentIds.length;
	}

	// Add preceptors
	const preceptorIds = await resolveEntityIds('preceptors', options.preceptors);
	if (preceptorIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'preceptors', preceptorIds);
		entityCounts.preceptors = preceptorIds.length;
	}

	// Add sites
	const siteIds = await resolveEntityIds('sites', options.sites);
	if (siteIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'sites', siteIds);
		entityCounts.sites = siteIds.length;
	}

	// Add health systems
	const healthSystemIds = await resolveEntityIds('health_systems', options.healthSystems);
	if (healthSystemIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'health_systems', healthSystemIds);
		entityCounts.healthSystems = healthSystemIds.length;
	}

	// Add clerkships
	const clerkshipIds = await resolveEntityIds('clerkships', options.clerkships);
	if (clerkshipIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'clerkships', clerkshipIds);
		entityCounts.clerkships = clerkshipIds.length;
	}

	// Add teams
	const teamIds = await resolveEntityIds('teams', options.teams);
	if (teamIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'teams', teamIds);
		entityCounts.teams = teamIds.length;
	}

	// Add configurations
	const configurationIds = await resolveEntityIds('configurations', options.configurations);
	if (configurationIds.length > 0) {
		await addEntitiesToSchedule(db, newSchedule.id!, 'configurations', configurationIds);
		entityCounts.configurations = configurationIds.length;
	}

	// Fetch the updated schedule with year
	const updatedSchedule = await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('id', '=', newSchedule.id!)
		.executeTakeFirstOrThrow();

	return {
		schedule: updatedSchedule,
		entityCounts,
	};
}

/**
 * Get all entity IDs from the base entity table
 */
async function getAllEntityIds(
	db: Kysely<DB>,
	entityType: ScheduleEntityType
): Promise<string[]> {
	const tableMap: Record<ScheduleEntityType, keyof DB> = {
		students: 'students',
		preceptors: 'preceptors',
		sites: 'sites',
		health_systems: 'health_systems',
		clerkships: 'clerkships',
		teams: 'preceptor_teams',
		configurations: 'clerkship_configurations',
	};

	const table = tableMap[entityType];
	const results = await db.selectFrom(table as any).select('id').execute();
	return results.map((r: any) => r.id).filter((id: string | null) => id !== null);
}

/**
 * Create a quick copy of a schedule with all entities
 */
export async function quickCopySchedule(
	db: Kysely<DB>,
	sourceScheduleId: string,
	newName: string,
	startDate: string,
	endDate: string,
	year: number
): Promise<DuplicationResult> {
	return await duplicateToNewSchedule(
		db,
		sourceScheduleId,
		newName,
		startDate,
		endDate,
		year,
		{
			students: 'all',
			preceptors: 'all',
			sites: 'all',
			healthSystems: 'all',
			clerkships: 'all',
			teams: 'all',
			configurations: 'all',
		}
	);
}
