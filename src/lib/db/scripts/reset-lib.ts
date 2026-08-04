/**
 * Shared data-reset logic used by the `db:reset-user` and `db:reset` CLI
 * scripts and their tests. Keeping the FK-safe deletion order in one place
 * means the scripts and the isolation tests exercise the same implementation.
 *
 * Ownership model (see docs/spec/plan/25-dev-data-commands.md):
 * - `scheduling_periods.user_id` is the owner column.
 * - Entities (students, preceptors, clerkships, sites, health_systems and the
 *   `preceptor_teams` / `clerkship_configurations` "team"/"configuration" rows)
 *   have no `user_id`; they belong to a schedule through the `schedule_*`
 *   junction tables. An entity is only deleted when it has no remaining
 *   junction row in ANY schedule — entities shared with another user survive.
 * - `schedule_assignments` has no `schedule_id`; assignments attach to a
 *   student and scope transitively via `schedule_students`.
 * - better-auth owns `user`, `session`, `account`, `verification`.
 */

import type { Kysely } from 'kysely';
import type { DB } from '../types';

export class ResetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ResetError';
	}
}

export type ResetCounts = Record<string, number>;

export interface ResetUserResult {
	userId: string;
	email: string;
	scheduleIds: string[];
	counts: ResetCounts;
	dryRun: boolean;
}

export interface ResetUserOptions {
	dryRun?: boolean;
}

// A connection that can be a top-level Kysely instance or a transaction.
type Conn = Kysely<DB>;

/**
 * Ids of entities linked to the given schedules via `junction`.`col` that are
 * NOT also linked to any schedule outside that set — i.e. exclusively owned by
 * the caller's schedules and therefore safe to delete.
 */
async function orphanIds(
	db: Conn,
	junction: keyof DB,
	col: string,
	scheduleIds: string[]
): Promise<string[]> {
	if (scheduleIds.length === 0) return [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyDb = db as any;
	const linked = await anyDb
		.selectFrom(junction)
		.select(col)
		.distinct()
		.where('schedule_id', 'in', scheduleIds)
		.execute();
	const ids: string[] = linked.map((r: Record<string, unknown>) => r[col]).filter(Boolean);
	if (ids.length === 0) return [];
	const shared = await anyDb
		.selectFrom(junction)
		.select(col)
		.distinct()
		.where('schedule_id', 'not in', scheduleIds)
		.where(col, 'in', ids)
		.execute();
	const sharedSet = new Set(shared.map((r: Record<string, unknown>) => r[col]));
	return ids.filter((id) => !sharedSet.has(id));
}

/**
 * Delete a user and everything it exclusively owns, leaving shared entities and
 * all other users untouched. In `dryRun` mode nothing is written; the returned
 * counts report what would be removed per table.
 */
export async function resetUser(
	db: Kysely<DB>,
	email: string,
	options: ResetUserOptions = {}
): Promise<ResetUserResult> {
	const dryRun = options.dryRun ?? false;

	const user = await db
		.selectFrom('user')
		.select(['id', 'email'])
		.where('email', '=', email)
		.executeTakeFirst();
	if (!user) {
		throw new ResetError(`No user found with email: ${email}`);
	}
	const userId = user.id;

	const scheduleRows = await db
		.selectFrom('scheduling_periods')
		.select('id')
		.where('user_id', '=', userId)
		.execute();
	const scheduleIds = scheduleRows.map((r) => r.id).filter((id): id is string => Boolean(id));

	// Compute orphan (exclusively-owned) entity id sets up front, before any
	// deletion, so the same sets drive both the dry-run counts and the writes.
	const orphanStudents = await orphanIds(db, 'schedule_students', 'student_id', scheduleIds);
	let orphanClerkships = await orphanIds(db, 'schedule_clerkships', 'clerkship_id', scheduleIds);
	let orphanHealthSystems = await orphanIds(
		db,
		'schedule_health_systems',
		'health_system_id',
		scheduleIds
	);
	let orphanPreceptors = await orphanIds(db, 'schedule_preceptors', 'preceptor_id', scheduleIds);
	let orphanSites = await orphanIds(db, 'schedule_sites', 'site_id', scheduleIds);
	const orphanTeams = await orphanIds(db, 'schedule_teams', 'team_id', scheduleIds);
	const orphanConfigs = await orphanIds(
		db,
		'schedule_configurations',
		'configuration_id',
		scheduleIds
	);

	// Electives are not schedule-linked; they belong to an orphaned clerkship.
	let orphanElectives: string[] = [];
	if (orphanClerkships.length > 0) {
		const rows = await db
			.selectFrom('clerkship_electives')
			.select('id')
			.where('clerkship_id', 'in', orphanClerkships)
			.execute();
		orphanElectives = rows.map((r) => r.id).filter((id): id is string => Boolean(id));
	}

	// Assignments are only removed for exclusively-owned (orphan) students. An
	// assignment belonging to a student shared with another user survives — and
	// so must every entity it references, even if that entity looks orphaned by
	// the junction tables. Subtract those still-referenced ids from the orphan
	// sets so we never delete a preceptor/site/clerkship out from under a
	// surviving assignment (which would also break FK integrity).
	{
		let survivingQuery = db
			.selectFrom('schedule_assignments')
			.select(['preceptor_id', 'clerkship_id', 'site_id', 'elective_id']);
		if (orphanStudents.length > 0) {
			survivingQuery = survivingQuery.where('student_id', 'not in', orphanStudents);
		}
		const surviving = await survivingQuery.execute();
		const keepPreceptors = new Set(surviving.map((a) => a.preceptor_id).filter(Boolean));
		const keepClerkships = new Set(surviving.map((a) => a.clerkship_id).filter(Boolean));
		const keepSites = new Set(surviving.map((a) => a.site_id).filter(Boolean));
		const keepElectives = new Set(surviving.map((a) => a.elective_id).filter(Boolean));
		orphanPreceptors = orphanPreceptors.filter((id) => !keepPreceptors.has(id));
		orphanClerkships = orphanClerkships.filter((id) => !keepClerkships.has(id));
		orphanSites = orphanSites.filter((id) => !keepSites.has(id));
		orphanElectives = orphanElectives.filter((id) => !keepElectives.has(id));
	}

	// Health systems are the parent of preceptors and sites (FK). Any health
	// system still referenced by a preceptor or site we are NOT deleting must be
	// kept, or we would orphan/break those survivors. Compute the health systems
	// pinned by surviving preceptors/sites and drop them from the orphan set.
	{
		const survivingSites = await db
			.selectFrom('sites')
			.select('health_system_id')
			.$if(orphanSites.length > 0, (qb) => qb.where('id', 'not in', orphanSites))
			.execute();
		const survivingPrec = await db
			.selectFrom('preceptors')
			.select('health_system_id')
			.$if(orphanPreceptors.length > 0, (qb) => qb.where('id', 'not in', orphanPreceptors))
			.execute();
		const pinnedHS = new Set<string>();
		for (const r of survivingSites) if (r.health_system_id) pinnedHS.add(r.health_system_id);
		for (const r of survivingPrec) if (r.health_system_id) pinnedHS.add(r.health_system_id);
		orphanHealthSystems = orphanHealthSystems.filter((id) => !pinnedHS.has(id));
	}

	const counts: ResetCounts = {};

	const doWork = async (conn: Conn) => {
		const del = async (
			table: keyof DB,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			where: (qb: any) => any,
			skip = false
		) => {
			counts[table] = counts[table] ?? 0;
			if (skip) return;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anyConn = conn as any;
			const row = await where(
				anyConn.selectFrom(table).select(conn.fn.countAll<number>().as('c'))
			).executeTakeFirst();
			const n = Number(row?.c ?? 0);
			counts[table] += n;
			if (!dryRun && n > 0) {
				await where(anyConn.deleteFrom(table)).execute();
			}
		};

		const noStudents = orphanStudents.length === 0;
		const noClerkships = orphanClerkships.length === 0;
		const noHealthSystems = orphanHealthSystems.length === 0;
		const noPreceptors = orphanPreceptors.length === 0;
		const noSites = orphanSites.length === 0;
		const noTeams = orphanTeams.length === 0;
		const noConfigs = orphanConfigs.length === 0;
		const noElectives = orphanElectives.length === 0;
		const noSchedules = scheduleIds.length === 0;

		// 1. Assignments for exclusively-owned students (shared students keep theirs).
		await del(
			'schedule_assignments',
			(qb) => qb.where('student_id', 'in', orphanStudents),
			noStudents
		);

		// 2. Junction rows for this user's schedules.
		await del('schedule_students', (qb) => qb.where('schedule_id', 'in', scheduleIds), noSchedules);
		await del(
			'schedule_clerkships',
			(qb) => qb.where('schedule_id', 'in', scheduleIds),
			noSchedules
		);
		await del(
			'schedule_health_systems',
			(qb) => qb.where('schedule_id', 'in', scheduleIds),
			noSchedules
		);
		await del(
			'schedule_preceptors',
			(qb) => qb.where('schedule_id', 'in', scheduleIds),
			noSchedules
		);
		await del('schedule_sites', (qb) => qb.where('schedule_id', 'in', scheduleIds), noSchedules);
		await del('schedule_teams', (qb) => qb.where('schedule_id', 'in', scheduleIds), noSchedules);
		await del(
			'schedule_configurations',
			(qb) => qb.where('schedule_id', 'in', scheduleIds),
			noSchedules
		);

		// 3. Elective dependents (reference orphan electives / preceptors / sites).
		await del(
			'elective_preceptors',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('elective_id', 'in', orphanElectives.length ? orphanElectives : ['']),
						eb('preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
					])
				),
			noElectives && noPreceptors
		);
		await del(
			'elective_sites',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('elective_id', 'in', orphanElectives.length ? orphanElectives : ['']),
						eb('site_id', 'in', orphanSites.length ? orphanSites : ['']),
					])
				),
			noElectives && noSites
		);
		await del(
			'clerkship_electives',
			(qb) => qb.where('clerkship_id', 'in', orphanClerkships),
			noClerkships
		);

		// 4. Preceptor dependents.
		await del(
			'preceptor_availability',
			(qb) => qb.where('preceptor_id', 'in', orphanPreceptors),
			noPreceptors
		);
		await del(
			'preceptor_availability_patterns',
			(qb) => qb.where('preceptor_id', 'in', orphanPreceptors),
			noPreceptors
		);
		await del(
			'preceptor_capacity_rules',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
						eb('clerkship_id', 'in', orphanClerkships.length ? orphanClerkships : ['']),
					])
				),
			noPreceptors && noClerkships
		);
		await del(
			'preceptor_fallbacks',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('primary_preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
						eb('fallback_preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
						eb('clerkship_id', 'in', orphanClerkships.length ? orphanClerkships : ['']),
					])
				),
			noPreceptors && noClerkships
		);
		await del(
			'preceptor_sites',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
						eb('site_id', 'in', orphanSites.length ? orphanSites : ['']),
					])
				),
			noPreceptors && noSites
		);
		await del(
			'preceptor_team_members',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('preceptor_id', 'in', orphanPreceptors.length ? orphanPreceptors : ['']),
						eb('team_id', 'in', orphanTeams.length ? orphanTeams : ['']),
					])
				),
			noPreceptors && noTeams
		);

		// 5. Site dependents.
		await del(
			'site_availability',
			(qb) => qb.where('site_id', 'in', orphanSites),
			noSites
		);
		await del(
			'site_availability_patterns',
			(qb) => qb.where('site_id', 'in', orphanSites),
			noSites
		);
		await del(
			'site_capacity_rules',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('site_id', 'in', orphanSites.length ? orphanSites : ['']),
						eb('clerkship_id', 'in', orphanClerkships.length ? orphanClerkships : ['']),
					])
				),
			noSites && noClerkships
		);
		await del(
			'clerkship_sites',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('clerkship_id', 'in', orphanClerkships.length ? orphanClerkships : ['']),
						eb('site_id', 'in', orphanSites.length ? orphanSites : ['']),
					])
				),
			noClerkships && noSites
		);
		await del(
			'team_sites',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('team_id', 'in', orphanTeams.length ? orphanTeams : ['']),
						eb('site_id', 'in', orphanSites.length ? orphanSites : ['']),
					])
				),
			noTeams && noSites
		);

		// 6. Configuration + student dependents.
		await del(
			'clerkship_configurations',
			(qb) => qb.where('id', 'in', orphanConfigs),
			noConfigs
		);
		await del(
			'student_health_system_onboarding',
			(qb) =>
				qb.where((eb: any) =>
					eb.or([
						eb('student_id', 'in', orphanStudents.length ? orphanStudents : ['']),
						eb('health_system_id', 'in', orphanHealthSystems.length ? orphanHealthSystems : ['']),
					])
				),
			noStudents && noHealthSystems
		);

		// 7. Orphan entities (children of health_systems first).
		await del('preceptor_teams', (qb) => qb.where('id', 'in', orphanTeams), noTeams);
		await del('students', (qb) => qb.where('id', 'in', orphanStudents), noStudents);
		await del('preceptors', (qb) => qb.where('id', 'in', orphanPreceptors), noPreceptors);
		await del('sites', (qb) => qb.where('id', 'in', orphanSites), noSites);
		await del('clerkships', (qb) => qb.where('id', 'in', orphanClerkships), noClerkships);
		await del('health_systems', (qb) => qb.where('id', 'in', orphanHealthSystems), noHealthSystems);

		// 8. The schedules themselves.
		await del('scheduling_periods', (qb) => qb.where('user_id', '=', userId));

		// 9. better-auth rows.
		await del('session', (qb) => qb.where('userId', '=', userId));
		await del('account', (qb) => qb.where('userId', '=', userId));
		await del('verification', (qb) => qb.where('identifier', '=', email));
		await del('user', (qb) => qb.where('id', '=', userId));
	};

	if (dryRun) {
		await doWork(db);
	} else {
		await db.transaction().execute((trx) => doWork(trx));
	}

	return { userId, email: user.email, scheduleIds, counts, dryRun };
}

/**
 * Every table in FK-safe (children-first) deletion order. Used by `resetAll`.
 */
const ALL_TABLES_DELETE_ORDER: (keyof DB)[] = [
	'schedule_assignments',
	'elective_preceptors',
	'elective_sites',
	'clerkship_electives',
	'preceptor_availability',
	'preceptor_availability_patterns',
	'preceptor_capacity_rules',
	'preceptor_fallbacks',
	'preceptor_sites',
	'preceptor_team_members',
	'site_availability',
	'site_availability_patterns',
	'site_capacity_rules',
	'clerkship_sites',
	'team_sites',
	'clerkship_configurations',
	'student_health_system_onboarding',
	'schedule_students',
	'schedule_clerkships',
	'schedule_health_systems',
	'schedule_preceptors',
	'schedule_sites',
	'schedule_teams',
	'schedule_configurations',
	'blackout_dates',
	'global_elective_defaults',
	'global_inpatient_defaults',
	'global_outpatient_defaults',
	'preceptor_teams',
	'teams',
	'students',
	'preceptors',
	'sites',
	'clerkships',
	'health_systems',
	'scheduling_periods',
	'session',
	'account',
	'verification',
	'user',
];

export interface ResetAllResult {
	counts: ResetCounts;
	dryRun: boolean;
}

/**
 * Delete every row from every table, returning the database to an empty (but
 * migrated) state. In `dryRun` mode nothing is written.
 */
export async function resetAll(
	db: Kysely<DB>,
	options: { dryRun?: boolean } = {}
): Promise<ResetAllResult> {
	const dryRun = options.dryRun ?? false;
	const counts: ResetCounts = {};

	const doWork = async (conn: Conn) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyConn = conn as any;
		for (const table of ALL_TABLES_DELETE_ORDER) {
			const row = await anyConn
				.selectFrom(table)
				.select(conn.fn.countAll<number>().as('c'))
				.executeTakeFirst();
			counts[table] = Number(row?.c ?? 0);
			if (!dryRun && counts[table] > 0) {
				await anyConn.deleteFrom(table).execute();
			}
		}
	};

	if (dryRun) {
		await doWork(db);
	} else {
		await db.transaction().execute((trx) => doWork(trx));
	}

	return { counts, dryRun };
}
