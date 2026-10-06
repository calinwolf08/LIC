import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	buildRecipientView,
	buildRecipientViews,
	recordDistribution
} from './distribution-service';

const SCHED = 'sched-d';
const OTHER_SCHED = 'sched-other';

// Two students, two preceptors, one shared site, one clerkship.
const STU_A = 'stu-a';
const STU_B = 'stu-b';
const PREC_1 = 'prec-1';
const PREC_2 = 'prec-2';
const SITE = 'site-1';
const CLERK = 'clerk-1';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values([
			{ id: SCHED, name: 'S', start_date: '2026-01-01', end_date: '2026-12-31', created_at: ts, updated_at: ts },
			{ id: OTHER_SCHED, name: 'O', start_date: '2026-01-01', end_date: '2026-12-31', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('students')
		.values([
			{ id: STU_A, name: 'Alice A', email: 'alice@x.com', created_at: ts, updated_at: ts },
			{ id: STU_B, name: 'Bob B', email: 'bob@x.com', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('preceptors')
		.values([
			{ id: PREC_1, name: 'Dr One', email: 'one@x.com', max_students: 5, created_at: ts, updated_at: ts },
			{ id: PREC_2, name: 'Dr Two', email: 'two@x.com', max_students: 5, created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: 'hs-1', name: 'General', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({ id: SITE, name: 'Metro', health_system_id: 'hs-1', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('clerkships')
		.values({ id: CLERK, name: 'Medicine', clerkship_type: 'outpatient', required_days: 5, created_at: ts, updated_at: ts })
		.execute();
}

async function addAssignment(
	db: Kysely<DB>,
	id: string,
	opts: {
		student: string;
		preceptor: string | null;
		date: string;
		scheduleId?: string;
		kind?: string;
		note?: string;
	}
) {
	const ts = new Date().toISOString();
	await db
		.insertInto('schedule_assignments')
		.values({
			id,
			student_id: opts.student,
			preceptor_id: opts.preceptor,
			clerkship_id: opts.kind && opts.kind !== 'clinical' ? null : CLERK,
			site_id: opts.preceptor ? SITE : null,
			schedule_id: opts.scheduleId ?? SCHED,
			date: opts.date,
			status: 'scheduled',
			kind: opts.kind ?? 'clinical',
			override_note: opts.note ?? null,
			override_codes: opts.note ? '["preceptor_unavailable"]' : '[]',
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

describe('distribution-service (K1 / FERPA)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
		// Alice with Dr One; Bob with Dr Two; both at the shared site. A note on one row.
		await addAssignment(db, 'a1', { student: STU_A, preceptor: PREC_1, date: '2026-03-02', note: 'sensitive note' });
		await addAssignment(db, 'a2', { student: STU_B, preceptor: PREC_2, date: '2026-03-03' });
		// A free day for Alice (non-clinical, no preceptor/site).
		await addAssignment(db, 'a3', { student: STU_A, preceptor: null, date: '2026-03-04', kind: 'free_day' });
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it("a preceptor sees ONLY their own students' days, with no notes (FERPA)", async () => {
		const view = (await buildRecipientView(db, SCHED, { type: 'preceptor', id: PREC_1 }))!;
		expect(view.recipientName).toBe('Dr One');
		// Only Alice's clinical day with Dr One — not Bob's, not the free day.
		expect(view.days).toHaveLength(1);
		expect(view.days[0]).toMatchObject({ date: '2026-03-02', studentName: 'Alice A' });
		// No cross-student identity.
		expect(view.days.some((d) => d.studentName === 'Bob B')).toBe(false);
		// Never any note / preceptor email / override data.
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('sensitive note');
		expect(serialized).not.toContain('preceptor_unavailable');
		// A preceptor view carries no student email.
		expect(view.recipientEmail).toBeUndefined();
		expect(serialized).not.toContain('alice@x.com');
	});

	it('a student sees ONLY their own days incl. non-clinical, and their own email', async () => {
		const view = (await buildRecipientView(db, SCHED, { type: 'student', id: STU_A }))!;
		expect(view.recipientName).toBe('Alice A');
		expect(view.recipientEmail).toBe('alice@x.com');
		// Alice's clinical day + her free day — never Bob's.
		expect(view.days.map((d) => d.date).sort()).toEqual(['2026-03-02', '2026-03-04']);
		expect(view.days.some((d) => d.kind === 'free_day')).toBe(true);
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('Bob B');
		expect(serialized).not.toContain('bob@x.com');
		expect(serialized).not.toContain('sensitive note');
	});

	it('a site sees days at that site with student names but no emails or notes', async () => {
		const view = (await buildRecipientView(db, SCHED, { type: 'site', id: SITE }))!;
		expect(view.recipientName).toBe('Metro');
		// Both clinical days are at the shared site; the free day (no site) is excluded.
		expect(view.days.map((d) => d.date).sort()).toEqual(['2026-03-02', '2026-03-03']);
		expect(view.days.every((d) => !!d.preceptorName)).toBe(true);
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('@x.com'); // no emails
		expect(serialized).not.toContain('sensitive note');
	});

	it('scopes strictly to the schedule — assignments in another schedule never leak', async () => {
		// Same preceptor, different schedule, different day.
		await addAssignment(db, 'x1', { student: STU_B, preceptor: PREC_1, date: '2026-06-01', scheduleId: OTHER_SCHED });
		const view = (await buildRecipientView(db, SCHED, { type: 'preceptor', id: PREC_1 }))!;
		expect(view.days).toHaveLength(1); // still only the in-schedule day
		expect(view.days.some((d) => d.date === '2026-06-01')).toBe(false);
	});

	it('returns an empty-but-valid view for a recipient with no assignments', async () => {
		// PREC_2 has a day, but a fresh preceptor with none:
		const ts = new Date().toISOString();
		await db
			.insertInto('preceptors')
			.values({ id: 'prec-3', name: 'Dr Three', email: 't3@x.com', max_students: 1, created_at: ts, updated_at: ts })
			.execute();
		const view = (await buildRecipientView(db, SCHED, { type: 'preceptor', id: 'prec-3' }))!;
		expect(view.recipientName).toBe('Dr Three');
		expect(view.days).toEqual([]);
	});

	it('returns null for an unknown recipient id', async () => {
		expect(await buildRecipientView(db, SCHED, { type: 'preceptor', id: 'nope' })).toBeNull();
	});

	it('records one audit row per recipient (ids + counts only) on send', async () => {
		const views = await buildRecipientViews(db, SCHED, [
			{ type: 'preceptor', id: PREC_1 },
			{ type: 'student', id: STU_A }
		]);
		const records = await recordDistribution(db, SCHED, 'user-1', views);
		expect(records).toHaveLength(2);

		const rows = await db
			.selectFrom('schedule_distributions')
			.selectAll()
			.where('schedule_id', '=', SCHED)
			.execute();
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.sender_user_id === 'user-1')).toBe(true);
		const prec = rows.find((r) => r.recipient_type === 'preceptor')!;
		expect(prec.recipient_id).toBe(PREC_1);
		expect(prec.day_count).toBe(1);
		// The audit row stores no student data.
		const serialized = JSON.stringify(rows);
		expect(serialized).not.toContain('Alice');
		expect(serialized).not.toContain('sensitive note');
	});
});
