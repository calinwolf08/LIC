import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { getEligibleOptions, type EligibilityOption } from './assignment-eligibility';

const SCHEDULE = 'sched-1';
const OTHER_SCHEDULE = 'sched-2';

const PEDS = 'clerk-peds';
const SURGERY = 'clerk-surgery';
const LEE = 'prec-lee';
const PATEL = 'prec-patel';
const NORTH = 'site-north';
const SOUTH = 'site-south';

/**
 * Fixture:
 *   Dr Lee   — teams: Pediatrics       sites: North
 *   Dr Patel — teams: Surgery          sites: South
 *   Pediatrics — allowed sites: North  (restricted)
 *   Surgery    — no clerkship_sites rows (unrestricted)
 * Plus one clerkship/preceptor/site belonging to another schedule entirely.
 */
async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();

	await db
		.insertInto('scheduling_periods')
		.values([
			{
				id: SCHEDULE,
				name: 'Mine',
				start_date: '2030-01-01',
				end_date: '2030-12-31',
				created_at: ts,
				updated_at: ts
			},
			{
				id: OTHER_SCHEDULE,
				name: 'Theirs',
				start_date: '2030-01-01',
				end_date: '2030-12-31',
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	await db
		.insertInto('health_systems')
		.values({ id: 'hs-1', name: 'Metro Health', created_at: ts, updated_at: ts })
		.execute();

	await db
		.insertInto('sites')
		.values([
			{ id: NORTH, name: 'North Clinic', health_system_id: 'hs-1', created_at: ts, updated_at: ts },
			{ id: SOUTH, name: 'South Clinic', health_system_id: 'hs-1', created_at: ts, updated_at: ts },
			{
				id: 'site-elsewhere',
				name: 'Elsewhere',
				health_system_id: 'hs-1',
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	await db
		.insertInto('clerkships')
		.values([
			{
				id: PEDS,
				name: 'Pediatrics',
				clerkship_type: 'outpatient',
				required_days: 10,
				created_at: ts,
				updated_at: ts
			},
			{
				id: SURGERY,
				name: 'Surgery',
				clerkship_type: 'inpatient',
				required_days: 10,
				created_at: ts,
				updated_at: ts
			},
			{
				id: 'clerk-elsewhere',
				name: 'Radiology',
				clerkship_type: 'outpatient',
				required_days: 5,
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	await db
		.insertInto('preceptors')
		.values([
			{ id: LEE, name: 'Dr Lee', email: 'lee@x.com', created_at: ts, updated_at: ts },
			{ id: PATEL, name: 'Dr Patel', email: 'patel@x.com', created_at: ts, updated_at: ts },
			{
				id: 'prec-elsewhere',
				name: 'Dr Elsewhere',
				email: 'e@x.com',
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	// Schedule membership
	await db
		.insertInto('schedule_clerkships')
		.values([
			{ id: 'sc-1', schedule_id: SCHEDULE, clerkship_id: PEDS, created_at: ts },
			{ id: 'sc-2', schedule_id: SCHEDULE, clerkship_id: SURGERY, created_at: ts },
			{ id: 'sc-3', schedule_id: OTHER_SCHEDULE, clerkship_id: 'clerk-elsewhere', created_at: ts }
		])
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values([
			{ id: 'sp-1', schedule_id: SCHEDULE, preceptor_id: LEE, created_at: ts },
			{ id: 'sp-2', schedule_id: SCHEDULE, preceptor_id: PATEL, created_at: ts },
			{ id: 'sp-3', schedule_id: OTHER_SCHEDULE, preceptor_id: 'prec-elsewhere', created_at: ts }
		])
		.execute();
	await db
		.insertInto('schedule_sites')
		.values([
			{ id: 'ss-1', schedule_id: SCHEDULE, site_id: NORTH, created_at: ts },
			{ id: 'ss-2', schedule_id: SCHEDULE, site_id: SOUTH, created_at: ts },
			{ id: 'ss-3', schedule_id: OTHER_SCHEDULE, site_id: 'site-elsewhere', created_at: ts }
		])
		.execute();

	// Teams carry the clerkship link
	await db
		.insertInto('preceptor_teams')
		.values([
			{ id: 'team-peds', clerkship_id: PEDS, name: 'Peds team', created_at: ts, updated_at: ts },
			{
				id: 'team-surgery',
				clerkship_id: SURGERY,
				name: 'Surgery team',
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();
	await db
		.insertInto('preceptor_team_members')
		.values([
			{ id: 'tm-1', team_id: 'team-peds', preceptor_id: LEE, created_at: ts },
			{ id: 'tm-2', team_id: 'team-surgery', preceptor_id: PATEL, created_at: ts }
		])
		.execute();

	await db
		.insertInto('preceptor_sites')
		.values([
			{ preceptor_id: LEE, site_id: NORTH, created_at: ts },
			{ preceptor_id: PATEL, site_id: SOUTH, created_at: ts }
		])
		.execute();

	// Pediatrics is restricted to North; Surgery has no restriction.
	await db
		.insertInto('clerkship_sites')
		.values([{ clerkship_id: PEDS, site_id: NORTH, created_at: ts }])
		.execute();
}

function find(list: EligibilityOption[], id: string): EligibilityOption | undefined {
	return list.find((o) => o.id === id);
}

describe('getEligibleOptions', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('returns everything eligible for an empty selection', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, {});
		expect(r.clerkships).toHaveLength(2);
		expect(r.preceptors).toHaveLength(2);
		expect(r.sites).toHaveLength(2);
		expect(r.clerkships.every((o) => o.eligible)).toBe(true);
		expect(r.preceptors.every((o) => o.eligible)).toBe(true);
		expect(r.sites.every((o) => o.eligible)).toBe(true);
	});

	it('omits entities that belong to another schedule entirely', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, {});
		expect(find(r.clerkships, 'clerk-elsewhere')).toBeUndefined();
		expect(find(r.preceptors, 'prec-elsewhere')).toBeUndefined();
		expect(find(r.sites, 'site-elsewhere')).toBeUndefined();
	});

	it('marks a preceptor with no team for the clerkship ineligible, with a reason', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { clerkshipId: PEDS });
		const patel = find(r.preceptors, PATEL)!;
		expect(patel.eligible).toBe(false);
		expect(patel.reason).toContain('Pediatrics');
		// …and does not hide them
		expect(find(r.preceptors, LEE)!.eligible).toBe(true);
	});

	it('marks a site outside the clerkship allowlist ineligible', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { clerkshipId: PEDS });
		expect(find(r.sites, SOUTH)!.eligible).toBe(false);
		expect(find(r.sites, SOUTH)!.reason).toContain('Pediatrics');
		expect(find(r.sites, NORTH)!.eligible).toBe(true);
	});

	it('treats a clerkship with no clerkship_sites rows as unrestricted', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { clerkshipId: SURGERY });
		expect(find(r.sites, NORTH)!.eligible).toBe(true);
		expect(find(r.sites, SOUTH)!.eligible).toBe(true);
	});

	it('marks a site the selected preceptor does not work at ineligible', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { preceptorId: LEE });
		expect(find(r.sites, SOUTH)!.eligible).toBe(false);
		expect(find(r.sites, SOUTH)!.reason).toContain('Dr Lee');
		expect(find(r.sites, NORTH)!.eligible).toBe(true);
	});

	it('marks a preceptor who does not work at the selected site ineligible', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { siteId: NORTH });
		expect(find(r.preceptors, PATEL)!.eligible).toBe(false);
		expect(find(r.preceptors, PATEL)!.reason).toContain('North Clinic');
		expect(find(r.preceptors, LEE)!.eligible).toBe(true);
	});

	it('narrows clerkships from the selected preceptor', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { preceptorId: LEE });
		expect(find(r.clerkships, PEDS)!.eligible).toBe(true);
		expect(find(r.clerkships, SURGERY)!.eligible).toBe(false);
		expect(find(r.clerkships, SURGERY)!.reason).toContain('Dr Lee');
	});

	it('narrows clerkships from the selected site', async () => {
		// Pediatrics is only offered at North, so South rules it out.
		const r = await getEligibleOptions(db, SCHEDULE, { siteId: SOUTH });
		expect(find(r.clerkships, PEDS)!.eligible).toBe(false);
		expect(find(r.clerkships, PEDS)!.reason).toContain('South Clinic');
		expect(find(r.clerkships, SURGERY)!.eligible).toBe(true);
	});

	it('combines constraints from several selections at once', async () => {
		const r = await getEligibleOptions(db, SCHEDULE, { clerkshipId: PEDS, siteId: NORTH });
		expect(find(r.preceptors, LEE)!.eligible).toBe(true);
		expect(find(r.preceptors, PATEL)!.eligible).toBe(false);
	});

	it('treats a preceptor on no team as unrestricted, not as unassignable', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('preceptors')
			.values({ id: 'prec-new', name: 'Dr New', email: 'new@x.com', created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('schedule_preceptors')
			.values({ id: 'sp-new', schedule_id: SCHEDULE, preceptor_id: 'prec-new', created_at: ts })
			.execute();

		// Nobody has said what this preceptor teaches, so nothing rules them out.
		const byClerkship = await getEligibleOptions(db, SCHEDULE, { clerkshipId: PEDS });
		expect(find(byClerkship.preceptors, 'prec-new')!.eligible).toBe(true);

		// …and no site rows means they are not tied to a site either.
		const bySite = await getEligibleOptions(db, SCHEDULE, { siteId: SOUTH });
		expect(find(bySite.preceptors, 'prec-new')!.eligible).toBe(true);

		// Selecting them leaves every clerkship and site open.
		const byPreceptor = await getEligibleOptions(db, SCHEDULE, { preceptorId: 'prec-new' });
		expect(byPreceptor.clerkships.every((c) => c.eligible)).toBe(true);
		expect(byPreceptor.sites.every((s) => s.eligible)).toBe(true);
	});

	it('returns empty lists for a schedule with no entities', async () => {
		const r = await getEligibleOptions(db, 'sched-empty', {});
		expect(r).toEqual({ clerkships: [], preceptors: [], sites: [], electives: [] });
	});
});
