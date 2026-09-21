/**
 * Direct reads (and a few deliberate writes) against the e2e SQLite database.
 *
 * Journeys assert on three layers: what the user sees, what the API says, and —
 * where it matters — what the row holds (`source`, `override_codes`, `locked`,
 * `elective_id`, `schedule_id`). A UI that shows the right thing over wrong data
 * is a bug this layer exists to catch.
 *
 * Writes are limited to test-harness concerns that have no UI by design:
 * granting/revoking the `autogen` entitlement. Everything else goes through the
 * app.
 */

import type { Kysely } from 'kysely';
import { createDB } from '../../src/lib/db/connection';
import type { DB } from '../../src/lib/db/types';

export const TEST_DB_PATH = process.env.DATABASE_PATH ?? './test-sqlite.db';

export function openTestDb(): Kysely<DB> {
	return createDB(TEST_DB_PATH);
}

/** Retry on SQLITE_BUSY/LOCKED — the preview server shares this file. */
export async function withRetry<T>(op: () => Promise<T>, attempts = 8): Promise<T> {
	let last: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await op();
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED') throw err;
			last = err;
			await new Promise((r) => setTimeout(r, 100 * 2 ** i));
		}
	}
	throw last;
}

export async function userByEmail(db: Kysely<DB>, email: string) {
	return db.selectFrom('user').selectAll().where('email', '=', email).executeTakeFirst();
}

export async function entitlementsOf(db: Kysely<DB>, email: string): Promise<string[]> {
	const u = await userByEmail(db, email);
	if (!u) throw new Error(`No user ${email}`);
	try {
		const parsed = JSON.parse(u.entitlements ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Replace a user's entitlement list. Takes effect on their next request. */
export async function setEntitlements(db: Kysely<DB>, email: string, list: string[]) {
	const u = await userByEmail(db, email);
	if (!u) throw new Error(`No user ${email}`);
	await withRetry(() =>
		db
			.updateTable('user')
			.set({ entitlements: JSON.stringify(list) })
			.where('id', '=', u.id)
			.execute()
	);
}

export const grantAutogen = (db: Kysely<DB>, email: string) =>
	setEntitlements(db, email, ['autogen']);
export const revokeAutogen = (db: Kysely<DB>, email: string) => setEntitlements(db, email, []);

export async function assignmentRow(db: Kysely<DB>, id: string) {
	return db.selectFrom('schedule_assignments').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function assignmentsForSchedule(db: Kysely<DB>, scheduleId: string) {
	return db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('schedule_id', '=', scheduleId)
		.orderBy('date')
		.orderBy('student_id')
		.execute();
}

export function parseCodes(raw: string | null | undefined): string[] {
	try {
		const v = JSON.parse(raw ?? '[]');
		return Array.isArray(v) ? [...v].sort() : [];
	} catch {
		return [];
	}
}

export interface TenantSnapshot {
	email: string;
	schedules: Array<{
		id: string;
		name: string;
		counts: Record<string, number>;
		assignments: Array<{
			id: string;
			student_id: string;
			preceptor_id: string;
			date: string;
			source: string;
			locked: number;
			override_codes: string[];
		}>;
	}>;
}

/**
 * Everything a tenant owns, in a shape `toEqual` can compare before/after an
 * action taken by another tenant. Blackout dates are deliberately absent: the
 * table is global (no owner column) — see the e2e plan §1.2.
 */
export async function snapshotTenant(db: Kysely<DB>, email: string): Promise<TenantSnapshot> {
	const u = await userByEmail(db, email);
	if (!u) throw new Error(`No user ${email}`);
	const schedules = await db
		.selectFrom('scheduling_periods')
		.select(['id', 'name'])
		.where('user_id', '=', u.id)
		.orderBy('id')
		.execute();

	const junctions = [
		'schedule_students',
		'schedule_preceptors',
		'schedule_clerkships',
		'schedule_sites',
		'schedule_health_systems',
		'schedule_teams'
	] as const;

	const out: TenantSnapshot = { email, schedules: [] };
	for (const s of schedules) {
		const counts: Record<string, number> = {};
		for (const j of junctions) {
			const row = await db
				.selectFrom(j)
				.select((eb) => eb.fn.countAll<number>().as('n'))
				.where('schedule_id', '=', s.id!)
				.executeTakeFirst();
			counts[j] = Number(row?.n ?? 0);
		}
		const rows = await assignmentsForSchedule(db, s.id!);
		out.schedules.push({
			id: s.id!,
			name: s.name,
			counts,
			assignments: rows.map((r) => ({
				id: r.id!,
				student_id: r.student_id,
				preceptor_id: r.preceptor_id,
				date: r.date,
				source: r.source,
				locked: r.locked,
				override_codes: parseCodes(r.override_codes)
			}))
		});
	}
	return out;
}
