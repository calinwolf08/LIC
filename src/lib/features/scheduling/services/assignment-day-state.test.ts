import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { getDayStates, expandDateRange } from './assignment-day-state';

const SCHEDULE = 'sched-1';
const STUDENT = 'stu-1';
const STUDENT2 = 'stu-2';
const PRECEPTOR = 'prec-1';
const CLERKSHIP = 'clerk-1';
const SITE = 'site-1';
const SITE2 = 'site-2';

const RANGE_START = '2030-03-01';
const RANGE_END = '2030-03-31';
const TODAY = '2030-03-10';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHEDULE,
			name: 'Test',
			start_date: RANGE_START,
			end_date: RANGE_END,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: 'hs-1', name: 'HS', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values([
			{ id: SITE, name: 'North', health_system_id: 'hs-1', created_at: ts, updated_at: ts },
			{ id: SITE2, name: 'South', health_system_id: 'hs-1', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('students')
		.values([
			{ id: STUDENT, name: 'Alice', email: 'a@x.com', created_at: ts, updated_at: ts },
			{ id: STUDENT2, name: 'Bob', email: 'b@x.com', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: PRECEPTOR,
			name: 'Dr P',
			email: 'p@x.com',
			max_students: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERKSHIP,
			name: 'Medicine',
			clerkship_type: 'outpatient',
			required_days: 10,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

async function setAvailability(
	db: Kysely<DB>,
	date: string,
	isAvailable: 0 | 1,
	siteId = SITE
): Promise<void> {
	const ts = new Date().toISOString();
	await db
		.insertInto('preceptor_availability')
		.values({
			id: `av-${siteId}-${date}`,
			preceptor_id: PRECEPTOR,
			site_id: siteId,
			date,
			is_available: isAvailable,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

async function assign(
	db: Kysely<DB>,
	id: string,
	studentId: string,
	date: string,
	preceptorId = PRECEPTOR
): Promise<void> {
	const ts = new Date().toISOString();
	await db
		.insertInto('schedule_assignments')
		.values({
			id,
			student_id: studentId,
			preceptor_id: preceptorId,
			clerkship_id: CLERKSHIP,
			date,
			status: 'scheduled',
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

const query = { preceptorId: PRECEPTOR, studentId: STUDENT, from: '2030-03-05', to: '2030-03-15' };

function on(days: Awaited<ReturnType<typeof getDayStates>>, date: string) {
	return days.find((d) => d.date === date)!;
}

describe('expandDateRange', () => {
	it('is inclusive of both ends', () => {
		expect(expandDateRange('2030-03-01', '2030-03-03')).toEqual([
			'2030-03-01',
			'2030-03-02',
			'2030-03-03'
		]);
	});

	it('crosses month boundaries', () => {
		expect(expandDateRange('2030-01-30', '2030-02-02')).toEqual([
			'2030-01-30',
			'2030-01-31',
			'2030-02-01',
			'2030-02-02'
		]);
	});

	it('returns nothing when the range is inverted', () => {
		expect(expandDateRange('2030-03-05', '2030-03-01')).toEqual([]);
	});
});

describe('getDayStates', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('returns one entry per date in the requested range', async () => {
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(days).toHaveLength(11);
		expect(days[0].date).toBe('2030-03-05');
		expect(days[10].date).toBe('2030-03-15');
	});

	it('classifies available / unavailable / unset', async () => {
		await setAvailability(db, '2030-03-06', 1);
		await setAvailability(db, '2030-03-07', 0);
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-06').state).toBe('available');
		expect(on(days, '2030-03-07').state).toBe('unavailable');
		expect(on(days, '2030-03-08').state).toBe('unset');
	});

	it('lets a blackout win over an explicit available', async () => {
		const ts = new Date().toISOString();
		await setAvailability(db, '2030-03-06', 1);
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-1', date: '2030-03-06', created_at: ts })
			.execute();
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-06').state).toBe('blackout');
	});

	it('scopes availability to the selected site', async () => {
		await setAvailability(db, '2030-03-06', 1, SITE);
		await setAvailability(db, '2030-03-06', 0, SITE2);

		const atNorth = await getDayStates(db, SCHEDULE, { ...query, siteId: SITE }, TODAY);
		expect(on(atNorth, '2030-03-06').state).toBe('available');

		const atSouth = await getDayStates(db, SCHEDULE, { ...query, siteId: SITE2 }, TODAY);
		expect(on(atSouth, '2030-03-06').state).toBe('unavailable');

		// With no site, available anywhere counts as available.
		const anywhere = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(anywhere, '2030-03-06').state).toBe('available');
	});

	it('lists the students already occupying the preceptor', async () => {
		await assign(db, 'a-1', STUDENT2, '2030-03-09');
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-09').preceptorBookings).toEqual([
			{ assignmentId: 'a-1', studentId: STUDENT2, studentName: 'Bob' }
		]);
		expect(on(days, '2030-03-08').preceptorBookings).toEqual([]);
	});

	it('respects max_students for preceptorAtCapacity', async () => {
		await assign(db, 'a-1', STUDENT2, '2030-03-09');
		let days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-09').preceptorAtCapacity).toBe(true);

		await db
			.updateTable('preceptors')
			.set({ max_students: 2 })
			.where('id', '=', PRECEPTOR)
			.execute();
		days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-09').preceptorAtCapacity).toBe(false);
	});

	it('marks studentBusy on any day the student already has an assignment', async () => {
		// A different preceptor entirely — "busy" is about the student, not this preceptor.
		const ts = new Date().toISOString();
		await db
			.insertInto('preceptors')
			.values({ id: 'prec-2', name: 'Dr Q', email: 'q@x.com', created_at: ts, updated_at: ts })
			.execute();
		await assign(db, 'a-2', STUDENT, '2030-03-11', 'prec-2');
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, '2030-03-11').studentBusy).toBe(true);
		expect(on(days, '2030-03-12').studentBusy).toBe(false);
	});

	it('treats today as not past, and yesterday as past', async () => {
		const days = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(days, TODAY).isPast).toBe(false);
		expect(on(days, '2030-03-09').isPast).toBe(true);
		expect(on(days, '2030-03-11').isPast).toBe(false);
	});

	it('flags dates outside the schedule range', async () => {
		const days = await getDayStates(
			db,
			SCHEDULE,
			{ ...query, from: '2030-02-27', to: '2030-03-02' },
			TODAY
		);
		expect(on(days, '2030-02-27').inRange).toBe(false);
		expect(on(days, '2030-02-28').inRange).toBe(false);
		expect(on(days, '2030-03-01').inRange).toBe(true);
		expect(on(days, '2030-03-02').inRange).toBe(true);
	});

	it('excludeId drops the edited assignment from studentBusy, bookings and capacity', async () => {
		// max_students defaults to 1 (see seed). One assignment on 03-11 for STUDENT
		// with PRECEPTOR fills the slot and marks the student busy.
		await assign(db, 'edit-me', STUDENT, '2030-03-11');

		// Without excludeId the day reads busy / booked / at capacity.
		const before = await getDayStates(db, SCHEDULE, query, TODAY);
		expect(on(before, '2030-03-11').studentBusy).toBe(true);
		expect(on(before, '2030-03-11').preceptorBookings).toHaveLength(1);
		expect(on(before, '2030-03-11').preceptorAtCapacity).toBe(true);

		// Excluding that very assignment clears all three (edit mode).
		const after = await getDayStates(
			db,
			SCHEDULE,
			{ ...query, excludeId: 'edit-me' },
			TODAY
		);
		expect(on(after, '2030-03-11').studentBusy).toBe(false);
		expect(on(after, '2030-03-11').preceptorBookings).toHaveLength(0);
		expect(on(after, '2030-03-11').preceptorAtCapacity).toBe(false);
	});

	it('excludeId only excludes that assignment — a second booking still counts', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('students')
			.values({ id: 'stu-3', name: 'Cara', email: 'c@x.com', created_at: ts, updated_at: ts })
			.execute();
		await assign(db, 'edit-me', STUDENT, '2030-03-11');
		await assign(db, 'other', 'stu-3', '2030-03-11');

		const after = await getDayStates(
			db,
			SCHEDULE,
			{ ...query, excludeId: 'edit-me' },
			TODAY
		);
		// The other student's booking remains, so the slot is still occupied.
		expect(on(after, '2030-03-11').preceptorBookings).toHaveLength(1);
		expect(on(after, '2030-03-11').preceptorBookings[0].studentId).toBe('stu-3');
	});

	it('works with no preceptor selected (everything unset, nothing at capacity)', async () => {
		const days = await getDayStates(
			db,
			SCHEDULE,
			{ studentId: STUDENT, from: '2030-03-05', to: '2030-03-07' },
			TODAY
		);
		expect(days.every((d) => d.state === 'unset')).toBe(true);
		expect(days.every((d) => !d.preceptorAtCapacity)).toBe(true);
		expect(days.every((d) => d.preceptorBookings.length === 0)).toBe(true);
	});
});
