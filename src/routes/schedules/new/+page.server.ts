/**
 * New Schedule Page Data Loader
 *
 * Loads all entities for selection in the wizard.
 * When source schedule is provided, also loads source's entities for pre-selection.
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ url }) => {
	const sourceScheduleId = url.searchParams.get('source');

	// Load all entities
	const [studentsRaw, preceptorsRaw, sitesRaw, healthSystemsRaw, clerkshipsRaw, teamsRaw, configurationsRaw] =
		await Promise.all([
			db.selectFrom('students').select(['id', 'name', 'email']).orderBy('name').execute(),
			db.selectFrom('preceptors').select(['id', 'name', 'email']).orderBy('name').execute(),
			db
				.selectFrom('sites')
				.leftJoin('health_systems', 'sites.health_system_id', 'health_systems.id')
				.select([
					'sites.id',
					'sites.name',
					'health_systems.name as health_system_name'
				])
				.orderBy('sites.name')
				.execute(),
			db.selectFrom('health_systems').select(['id', 'name']).orderBy('name').execute(),
			db
				.selectFrom('clerkships')
				.select(['id', 'name', 'clerkship_type'])
				.orderBy('name')
				.execute(),
			db
				.selectFrom('preceptor_teams')
				.leftJoin('clerkships', 'preceptor_teams.clerkship_id', 'clerkships.id')
				.select([
					'preceptor_teams.id',
					'preceptor_teams.name',
					'clerkships.name as clerkship_name'
				])
				.orderBy('preceptor_teams.name')
				.execute(),
			db
				.selectFrom('clerkship_configurations')
				.leftJoin('clerkships', 'clerkship_configurations.clerkship_id', 'clerkships.id')
				.select([
					'clerkship_configurations.id',
					'clerkships.name as clerkship_name'
				])
				.execute()
		]);

	// If copying from source, load source schedule details and its entities
	let sourceSchedule: { name: string; start_date: string; end_date: string } | null = null;
	let sourceEntityIds: {
		students: string[];
		preceptors: string[];
		sites: string[];
		healthSystems: string[];
		clerkships: string[];
		teams: string[];
	} | null = null;

	if (sourceScheduleId) {
		const [
			sourceScheduleData,
			sourceStudents,
			sourcePreceptors,
			sourceSites,
			sourceHealthSystems,
			sourceClerkships,
			sourceTeams
		] = await Promise.all([
			db
				.selectFrom('scheduling_periods')
				.select(['name', 'start_date', 'end_date'])
				.where('id', '=', sourceScheduleId)
				.executeTakeFirst(),
			db
				.selectFrom('schedule_students')
				.select('student_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute(),
			db
				.selectFrom('schedule_preceptors')
				.select('preceptor_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute(),
			db
				.selectFrom('schedule_sites')
				.select('site_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute(),
			db
				.selectFrom('schedule_health_systems')
				.select('health_system_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute(),
			db
				.selectFrom('schedule_clerkships')
				.select('clerkship_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute(),
			db
				.selectFrom('schedule_teams')
				.select('team_id')
				.where('schedule_id', '=', sourceScheduleId)
				.execute()
		]);

		if (sourceScheduleData) {
			sourceSchedule = {
				name: sourceScheduleData.name,
				start_date: sourceScheduleData.start_date,
				end_date: sourceScheduleData.end_date
			};
		}

		sourceEntityIds = {
			students: sourceStudents.map((s) => s.student_id),
			preceptors: sourcePreceptors.map((p) => p.preceptor_id),
			sites: sourceSites.map((s) => s.site_id),
			healthSystems: sourceHealthSystems.map((h) => h.health_system_id),
			clerkships: sourceClerkships.map((c) => c.clerkship_id),
			teams: sourceTeams.map((t) => t.team_id)
		};
	}

	// Filter out entities with null IDs and map to expected shape
	const students = studentsRaw
		.filter((s): s is typeof s & { id: string } => s.id !== null)
		.map((s) => ({ id: s.id, name: s.name, email: s.email }));

	const preceptors = preceptorsRaw
		.filter((p): p is typeof p & { id: string } => p.id !== null)
		.map((p) => ({ id: p.id, name: p.name, email: p.email }));

	const sites = sitesRaw
		.filter((s): s is typeof s & { id: string } => s.id !== null)
		.map((s) => ({ id: s.id, name: s.name, health_system_name: s.health_system_name }));

	const healthSystems = healthSystemsRaw
		.filter((h): h is typeof h & { id: string } => h.id !== null)
		.map((h) => ({ id: h.id, name: h.name }));

	const clerkships = clerkshipsRaw
		.filter((c): c is typeof c & { id: string } => c.id !== null)
		.map((c) => ({ id: c.id, name: c.name, clerkship_type: c.clerkship_type }));

	const teams = teamsRaw
		.filter((t): t is typeof t & { id: string } => t.id !== null)
		.map((t) => ({ id: t.id, name: t.name, clerkship_name: t.clerkship_name }));

	const configurations = configurationsRaw
		.filter((c): c is typeof c & { id: string } => c.id !== null)
		.map((c) => ({ id: c.id, clerkship_name: c.clerkship_name }));

	return {
		sourceScheduleId,
		sourceSchedule,
		sourceEntityIds,
		entityData: {
			students,
			preceptors,
			sites,
			healthSystems,
			clerkships,
			teams,
			configurations
		}
	};
};
