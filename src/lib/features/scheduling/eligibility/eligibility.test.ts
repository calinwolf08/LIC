import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	getEligiblePreceptorIds,
	clerkshipHasWorkablePreceptor,
	getClerkshipSiteIds,
	getTeamMemberPreceptorIds,
	getTeamServeableClerkships
} from './eligibility';

const HS = 'hs-1';
const CLERK = 'clerk-1';
const SCHED = 'sched-1';

async function baseSeed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHED,
			name: 'Demo',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: HS, name: 'General', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values([
			{ id: 'site-1', name: 'Clinic 1', health_system_id: HS, created_at: ts, updated_at: ts },
			{ id: 'site-2', name: 'Clinic 2', health_system_id: HS, created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERK,
			name: 'Med',
			clerkship_type: 'outpatient',
			required_days: 5,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

async function addPreceptor(db: Kysely<DB>, id: string, inSchedule = true) {
	const ts = new Date().toISOString();
	await db
		.insertInto('preceptors')
		.values({
			id,
			name: id,
			email: `${id}@x.com`,
			max_students: 1,
			health_system_id: HS,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	if (inSchedule) {
		await db
			.insertInto('schedule_preceptors')
			.values({ id: `sp-${id}`, schedule_id: SCHED, preceptor_id: id, created_at: ts })
			.execute();
	}
}

async function addAvailability(db: Kysely<DB>, precId: string, siteId: string, date: string) {
	const ts = new Date().toISOString();
	await db
		.insertInto('preceptor_availability')
		.values({
			id: `av-${precId}-${date}-${siteId}`,
			preceptor_id: precId,
			site_id: siteId,
			date,
			is_available: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

async function addTeam(db: Kysely<DB>, teamId: string, memberIds: string[]) {
	const ts = new Date().toISOString();
	await db
		.insertInto('preceptor_teams')
		.values({ id: teamId, clerkship_id: CLERK, name: teamId, created_at: ts, updated_at: ts })
		.execute();
	let priority = 0;
	for (const preceptorId of memberIds) {
		await db
			.insertInto('preceptor_team_members')
			.values({
				id: `tm-${teamId}-${preceptorId}`,
				team_id: teamId,
				preceptor_id: preceptorId,
				priority: priority++,
				created_at: ts
			})
			.execute();
	}
}

describe('eligibility predicate (03 §6)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await baseSeed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('uses team membership when the clerkship has a team', async () => {
		await addPreceptor(db, 'p1');
		await addPreceptor(db, 'p2');
		await addAvailability(db, 'p2', 'site-1', '2025-03-03'); // p2 has availability but no team
		await addTeam(db, 'team-1', ['p1']); // only p1 is on the team

		const eligible = await getEligiblePreceptorIds(db, CLERK, { scheduleId: SCHED });
		expect([...eligible]).toEqual(['p1']);
	});

	it('falls back to preceptors with availability when the clerkship has no team (F-19)', async () => {
		await addPreceptor(db, 'p1');
		await addPreceptor(db, 'p2');
		await addAvailability(db, 'p1', 'site-1', '2025-03-03');
		// p2 has no availability → not eligible in the no-team branch.

		const eligible = await getEligiblePreceptorIds(db, CLERK, { scheduleId: SCHED });
		expect([...eligible]).toEqual(['p1']);
	});

	it('restricts the no-team fallback to the clerkship allowed sites', async () => {
		await addPreceptor(db, 'p1');
		await addPreceptor(db, 'p2');
		await addAvailability(db, 'p1', 'site-1', '2025-03-03');
		await addAvailability(db, 'p2', 'site-2', '2025-03-03');
		// Clerkship only offered at site-1.
		const ts = new Date().toISOString();
		await db
			.insertInto('clerkship_sites')
			.values({ clerkship_id: CLERK, site_id: 'site-1', created_at: ts })
			.execute();

		const allowed = await getClerkshipSiteIds(db, CLERK);
		expect([...allowed]).toEqual(['site-1']);

		const eligible = await getEligiblePreceptorIds(db, CLERK, { scheduleId: SCHED });
		expect([...eligible]).toEqual(['p1']);
	});

	it('always intersects with the schedule preceptors', async () => {
		await addPreceptor(db, 'p1'); // in schedule
		await addPreceptor(db, 'p2', false); // NOT in schedule
		await addAvailability(db, 'p1', 'site-1', '2025-03-03');
		await addAvailability(db, 'p2', 'site-1', '2025-03-03');

		const eligible = await getEligiblePreceptorIds(db, CLERK, { scheduleId: SCHED });
		expect([...eligible]).toEqual(['p1']);
	});

	it('clerkshipHasWorkablePreceptor requires availability in the date range', async () => {
		await addPreceptor(db, 'p1');
		await addTeam(db, 'team-1', ['p1']);
		await addAvailability(db, 'p1', 'site-1', '2026-06-01'); // outside the checked window

		expect(
			await clerkshipHasWorkablePreceptor(db, CLERK, {
				scheduleId: SCHED,
				startDate: '2025-01-01',
				endDate: '2025-12-31'
			})
		).toBe(false);

		await addAvailability(db, 'p1', 'site-1', '2025-03-03'); // inside the window
		expect(
			await clerkshipHasWorkablePreceptor(db, CLERK, {
				scheduleId: SCHED,
				startDate: '2025-01-01',
				endDate: '2025-12-31'
			})
		).toBe(true);
	});

	it('getTeamMemberPreceptorIds returns members for the clerkship', async () => {
		await addPreceptor(db, 'p1');
		await addPreceptor(db, 'p2');
		await addTeam(db, 'team-1', ['p1', 'p2']);
		const members = await getTeamMemberPreceptorIds(db, CLERK);
		expect([...members].sort()).toEqual(['p1', 'p2']);
	});

	// G3/G4: serveable clerkships = clerkships EVERY member can cover; overlap is
	// false when members share none.
	describe('getTeamServeableClerkships', () => {
		async function seedTwoClerkships(db: Kysely<DB>) {
			const ts = new Date().toISOString();
			// CLERK (from baseSeed) is offered at site-1; add CLERK2 at site-2.
			await db
				.insertInto('clerkships')
				.values({
					id: 'clerk-2',
					name: 'Surgery',
					clerkship_type: 'outpatient',
					required_days: 5,
					created_at: ts,
					updated_at: ts
				})
				.execute();
			await db
				.insertInto('clerkship_sites')
				.values([
					{ clerkship_id: CLERK, site_id: 'site-1', created_at: ts },
					{ clerkship_id: 'clerk-2', site_id: 'site-2', created_at: ts }
				])
				.execute();
			await db
				.insertInto('schedule_clerkships')
				.values([
					{ id: 'sc-1', schedule_id: SCHED, clerkship_id: CLERK, created_at: ts },
					{ id: 'sc-2', schedule_id: SCHED, clerkship_id: 'clerk-2', created_at: ts }
				])
				.execute();
		}

		it('flags no overlap when members serve different clerkships', async () => {
			await seedTwoClerkships(db);
			await addPreceptor(db, 'p1');
			await addPreceptor(db, 'p2');
			await addAvailability(db, 'p1', 'site-1', '2025-03-03'); // p1 → CLERK only
			await addAvailability(db, 'p2', 'site-2', '2025-03-04'); // p2 → clerk-2 only

			const result = await getTeamServeableClerkships(db, SCHED, ['p1', 'p2']);
			expect(result.serveable).toHaveLength(0);
			expect(result.overlap).toBe(false);
		});

		it('lists the shared clerkship when members overlap', async () => {
			await seedTwoClerkships(db);
			await addPreceptor(db, 'p1');
			await addPreceptor(db, 'p2');
			await addAvailability(db, 'p1', 'site-1', '2025-03-03'); // both at site-1 → CLERK
			await addAvailability(db, 'p2', 'site-1', '2025-03-04');

			const result = await getTeamServeableClerkships(db, SCHED, ['p1', 'p2']);
			expect(result.serveable.map((c) => c.id)).toEqual([CLERK]);
			expect(result.overlap).toBe(true);
		});

		it('a one-member team trivially overlaps', async () => {
			await seedTwoClerkships(db);
			await addPreceptor(db, 'p1');
			await addAvailability(db, 'p1', 'site-1', '2025-03-03');
			const result = await getTeamServeableClerkships(db, SCHED, ['p1']);
			expect(result.overlap).toBe(true);
		});
	});
});
