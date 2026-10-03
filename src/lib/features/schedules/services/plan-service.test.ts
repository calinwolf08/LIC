import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	listPins,
	addPins,
	updatePin,
	deletePin,
	clearPins,
	evaluatePlan,
	commitPlan
} from './plan-service';

const SCHED = 'sched-1';
const OTHER_SCHED = 'sched-2';
const STU = 'stu-1';
const STU2 = 'stu-2';
const HS = 'hs-1';
const P1 = 'prec-1';
const P2 = 'prec-2';
const CLERK = 'clerk-1';
const SITE = 'site-1';
const U1 = 'user-1';
const U2 = 'user-2';

// Future weekdays (commit runs create-time checks, so past dates would be skipped by
// past_date). Three distinct weekdays a few days out, all inside RANGE below.
function futureWeekdays(count: number, startAt = 3): string[] {
	const out: string[] = [];
	let n = startAt;
	while (out.length < count) {
		const d = new Date();
		d.setUTCDate(d.getUTCDate() + n);
		const dow = d.getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
		n++;
	}
	return out;
}
function datePlus(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
const [D1, D2, D3] = futureWeekdays(3);
const RANGE_START = datePlus(-1);
const RANGE_END = datePlus(60);

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	for (const id of [SCHED, OTHER_SCHED]) {
		await db
			.insertInto('scheduling_periods')
			.values({
				id,
				name: id,
				start_date: RANGE_START,
				end_date: RANGE_END,
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}
	await db.insertInto('health_systems').values({ id: HS, name: 'HS', created_at: ts, updated_at: ts }).execute();
	await db
		.insertInto('students')
		.values([
			{ id: STU, name: 'A', email: 'a@x.com', created_at: ts, updated_at: ts },
			{ id: STU2, name: 'B', email: 'b@x.com', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('preceptors')
		.values([
			{ id: P1, name: 'P1', email: 'p1@x.com', max_students: 1, health_system_id: HS, created_at: ts, updated_at: ts },
			{ id: P2, name: 'P2', email: 'p2@x.com', max_students: 5, health_system_id: HS, created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('clerkships')
		.values({ id: CLERK, name: 'FM', clerkship_type: 'outpatient', required_days: 5, created_at: ts, updated_at: ts })
		.execute();
	await db.insertInto('sites').values({ id: SITE, name: 'Clinic', health_system_id: HS, created_at: ts, updated_at: ts }).execute();
	await db.insertInto('clerkship_sites').values({ clerkship_id: CLERK, site_id: SITE, created_at: ts }).execute();
	// Both students in the schedule, both onboarded at HS → a clean clinical pin raises nothing.
	await db
		.insertInto('schedule_students')
		.values([
			{ id: 'ss1', schedule_id: SCHED, student_id: STU, created_at: ts },
			{ id: 'ss2', schedule_id: SCHED, student_id: STU2, created_at: ts }
		])
		.execute();
	await db
		.insertInto('student_health_system_onboarding')
		.values([
			{ id: 'o1', student_id: STU, health_system_id: HS, is_completed: 1, created_at: ts, updated_at: ts },
			{ id: 'o2', student_id: STU2, health_system_id: HS, is_completed: 1, created_at: ts, updated_at: ts }
		])
		.execute();
}

const clinicalPin = {
	student_id: STU,
	preceptor_id: P1,
	clerkship_id: CLERK,
	site_id: SITE
};

describe('plan-service CRUD + scoping', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('stages one pin per date and lists them back', async () => {
		const created = await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1, D2] });
		expect(created).toHaveLength(2);
		const listed = await listPins(db, SCHED, U1);
		expect(listed.map((p) => p.date).sort()).toEqual([D1, D2]);
		expect(listed.every((p) => p.kind === 'clinical' && p.session === 'full')).toBe(true);
	});

	it('scopes pins to (schedule, user)', async () => {
		await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1] });
		await addPins(db, SCHED, U2, { ...clinicalPin, dates: [D2] });
		await addPins(db, OTHER_SCHED, U1, { ...clinicalPin, dates: [D3] });
		expect((await listPins(db, SCHED, U1)).map((p) => p.date)).toEqual([D1]);
		expect((await listPins(db, SCHED, U2)).map((p) => p.date)).toEqual([D2]);
		expect((await listPins(db, OTHER_SCHED, U1)).map((p) => p.date)).toEqual([D3]);
	});

	it('updates a pin, and refuses a pin outside the caller scope', async () => {
		const [pin] = await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1] });
		const updated = await updatePin(db, SCHED, U1, pin.id, { preceptor_id: P2, session: 'am' });
		expect(updated?.preceptor_id).toBe(P2);
		expect(updated?.session).toBe('am');
		// Wrong user can't touch it.
		expect(await updatePin(db, SCHED, U2, pin.id, { session: 'pm' })).toBeNull();
	});

	it('deletes one pin and clears the whole draft', async () => {
		const [a, b] = await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1, D2] });
		expect(await deletePin(db, SCHED, U2, a.id)).toBe(false); // wrong user
		expect(await deletePin(db, SCHED, U1, a.id)).toBe(true);
		expect((await listPins(db, SCHED, U1)).map((p) => p.id)).toEqual([b.id]);
		expect(await clearPins(db, SCHED, U1)).toBe(1);
		expect(await listPins(db, SCHED, U1)).toHaveLength(0);
	});

	it('stores a non-clinical pin without preceptor / clerkship / site', async () => {
		const [pin] = await addPins(db, SCHED, U1, {
			student_id: STU,
			preceptor_id: P1, // supplied, but a free_day drops it
			clerkship_id: CLERK,
			site_id: SITE,
			kind: 'free_day',
			dates: [D1]
		});
		expect(pin.kind).toBe('free_day');
		expect(pin.preceptor_id).toBeNull();
		expect(pin.clerkship_id).toBeNull();
		expect(pin.site_id).toBeNull();
	});
});

describe('evaluatePlan (dry run)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	async function commit(id: string, student: string, date: string, preceptor = P1) {
		const ts = new Date().toISOString();
		await db
			.insertInto('schedule_assignments')
			.values({
				id,
				student_id: student,
				preceptor_id: preceptor,
				clerkship_id: CLERK,
				site_id: SITE,
				date,
				status: 'scheduled',
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}

	it('reports no conflict for a clean pin, committable', async () => {
		const [pin] = await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1] });
		const res = await evaluatePlan(db, SCHED, U1);
		expect(res.violations).toHaveLength(0);
		expect(res.pinStatus[pin.id].committable).toBe(true);
	});

	// P2 (capacity 5) isolates these on session_clash alone — P1 (capacity 1) would
	// also raise preceptor_capacity on the shared preceptor-day.
	const clashPin = { student_id: STU, preceptor_id: P2, clerkship_id: CLERK, site_id: SITE };

	it('surfaces a session clash against a committed day and marks the pin non-committable', async () => {
		await commit('c1', STU, D1, P2);
		const [pin] = await addPins(db, SCHED, U1, { ...clashPin, dates: [D1] });
		const res = await evaluatePlan(db, SCHED, U1);
		expect(res.counts['session_clash']).toBe(1);
		expect(res.pinStatus[pin.id].unresolved).toContain('session_clash');
		expect(res.pinStatus[pin.id].committable).toBe(false);
	});

	it('an accepted override on the pin makes the same clash committable', async () => {
		await commit('c1', STU, D1, P2);
		const [pin] = await addPins(db, SCHED, U1, {
			...clashPin,
			dates: [D1],
			override_codes: ['session_clash']
		});
		const res = await evaluatePlan(db, SCHED, U1);
		// The raw conflict is still reported…
		expect(res.counts['session_clash']).toBe(1);
		// …but the pin accepted it, so it would commit.
		expect(res.pinStatus[pin.id].unresolved).not.toContain('session_clash');
		expect(res.pinStatus[pin.id].committable).toBe(true);
	});

	it('detects a pin-vs-pin clash (two full-day pins, same student-date)', async () => {
		const pins = await addPins(db, SCHED, U1, { ...clashPin, dates: [D2, D2] });
		const res = await evaluatePlan(db, SCHED, U1);
		expect(res.counts['session_clash']).toBe(1);
		// Both pins are implicated.
		for (const pin of pins) expect(res.pinStatus[pin.id].soft.some((v) => v.code === 'session_clash')).toBe(true);
	});

	it('detects a capacity breach across pins on a preceptor with no committed assignments', async () => {
		// P1 has max_students 1 and no committed rows: proves pin-only entity context loads.
		await addPins(db, SCHED, U1, { student_id: STU, preceptor_id: P1, clerkship_id: CLERK, site_id: SITE, dates: [D3] });
		await addPins(db, SCHED, U1, { student_id: STU2, preceptor_id: P1, clerkship_id: CLERK, site_id: SITE, dates: [D3] });
		const res = await evaluatePlan(db, SCHED, U1);
		expect(res.counts['preceptor_capacity']).toBe(1);
	});
});

describe('commitPlan', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	const committed = () =>
		db.selectFrom('schedule_assignments').selectAll().where('schedule_id', '=', SCHED).execute();

	it('persists clean pins and clears them from the draft', async () => {
		await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1, D2] });
		const res = await commitPlan(db, SCHED, U1);
		expect(res.committed).toBe(2);
		expect(res.skipped).toBe(0);
		expect((await committed()).map((a) => a.date).sort()).toEqual([D1, D2]);
		// Committed pins leave the draft.
		expect(await listPins(db, SCHED, U1)).toHaveLength(0);
	});

	it('skips a pin with an unresolved soft conflict, keeping it in the draft', async () => {
		// Commit a clean pin on D1, then a second full-day pin on D1 for the same
		// student clashes — and is not accepted, so it is skipped.
		await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1] });
		await commitPlan(db, SCHED, U1);

		const [clash] = await addPins(db, SCHED, U1, {
			student_id: STU,
			preceptor_id: P2,
			clerkship_id: CLERK,
			site_id: SITE,
			dates: [D1]
		});
		const res = await commitPlan(db, SCHED, U1);
		expect(res.committed).toBe(0);
		expect(res.skipped).toBe(1);
		expect(res.results[0]).toMatchObject({ pinId: clash.id, created: false, reason: 'soft' });
		expect(res.results[0].codes).toContain('session_clash');
		// The skipped pin is still in the draft for the coordinator to fix.
		expect((await listPins(db, SCHED, U1)).map((p) => p.id)).toEqual([clash.id]);
		// Only the first (clean) assignment exists.
		expect(await committed()).toHaveLength(1);
	});

	it('commits a conflicting pin once its soft code is accepted', async () => {
		await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D1] });
		await commitPlan(db, SCHED, U1);
		await addPins(db, SCHED, U1, {
			student_id: STU,
			preceptor_id: P2,
			clerkship_id: CLERK,
			site_id: SITE,
			dates: [D1],
			override_codes: ['session_clash']
		});
		const res = await commitPlan(db, SCHED, U1);
		expect(res.committed).toBe(1);
		expect(await committed()).toHaveLength(2);
		// The accepted override is recorded on the row.
		const rows = await committed();
		const second = rows.find((r) => r.date === D1 && r.preceptor_id === P2);
		expect(JSON.parse(second!.override_codes)).toContain('session_clash');
	});

	it('commits the committable pins and leaves the rest in a mixed batch', async () => {
		// Clean pin on D2 + an unaccepted clash pair on D1 (second one skipped).
		await addPins(db, SCHED, U1, { ...clinicalPin, dates: [D2] });
		await addPins(db, SCHED, U1, { student_id: STU, preceptor_id: P2, clerkship_id: CLERK, site_id: SITE, dates: [D1] });
		await addPins(db, SCHED, U1, { student_id: STU, preceptor_id: P2, clerkship_id: CLERK, site_id: SITE, dates: [D1] });
		const res = await commitPlan(db, SCHED, U1);
		// D2 commits; the first D1 commits; the second D1 clashes with it → skipped.
		expect(res.committed).toBe(2);
		expect(res.skipped).toBe(1);
		expect((await listPins(db, SCHED, U1))).toHaveLength(1); // the skipped one remains
	});
});
