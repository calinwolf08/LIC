/**
 * Step 17 API coverage: the eligibility / day-state / requirement-preview /
 * overrides endpoints plus the extended create and force-delete contracts.
 *
 * The handlers are invoked directly against a migrated in-memory database, so
 * auth, schedule scoping, validation and response shape are all exercised
 * without a live server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';

const holder = vi.hoisted(() => ({ current: null as unknown as Kysely<DB> }));

vi.mock('$lib/db', () => ({
	get db() {
		return holder.current;
	}
}));

const optionsRoute = await import('./options/+server');
const dayStatesRoute = await import('./day-states/+server');
const requirementRoute = await import('./requirement-preview/+server');
const overridesRoute = await import('../overrides/+server');
const createRoute = await import('./+server');
const idRoute = await import('./[id]/+server');

const USER_A = 'user-a';
const USER_B = 'user-b';
const SCHEDULE_A = 'sched-a';
const SCHEDULE_B = 'sched-b';

const STUDENT = 'stu-1';
const PRECEPTOR = 'prec-1';
const CLERKSHIP = 'clerk-1';
const SITE = 'site-1';

const RANGE_START = '2030-01-01';
const RANGE_END = '2030-12-31';
const FUTURE = '2030-06-15';

function locals(userId: string | null, entitlements: string[] = []): App.Locals {
	return {
		session: userId ? ({ user: { id: userId } } as never) : null,
		entitlements
	} as App.Locals;
}

function getEvent(path: string, userLocals: App.Locals, params: Record<string, string> = {}) {
	const url = new URL(`http://localhost${path}`);
	return { url, locals: userLocals, params } as never;
}

function postEvent(body: unknown, userLocals: App.Locals) {
	return {
		request: new Request('http://localhost/api/schedules/assignments', {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' }
		}),
		locals: userLocals,
		url: new URL('http://localhost/api/schedules/assignments')
	} as never;
}

async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();

	await db
		.insertInto('scheduling_periods')
		.values([
			{
				id: SCHEDULE_A,
				name: 'A',
				start_date: RANGE_START,
				end_date: RANGE_END,
				user_id: USER_A,
				created_at: ts,
				updated_at: ts
			},
			{
				id: SCHEDULE_B,
				name: 'B',
				start_date: RANGE_START,
				end_date: RANGE_END,
				user_id: USER_B,
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	await db
		.insertInto('user')
		.values([
			{
				id: USER_A,
				name: 'A',
				email: 'a@x.com',
				emailVerified: 0,
				createdAt: ts,
				updatedAt: ts,
				active_schedule_id: SCHEDULE_A
			},
			{
				id: USER_B,
				name: 'B',
				email: 'b@x.com',
				emailVerified: 0,
				createdAt: ts,
				updatedAt: ts,
				active_schedule_id: SCHEDULE_B
			}
		])
		.execute();

	await db
		.insertInto('health_systems')
		.values({ id: 'hs-1', name: 'Metro Health', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({ id: SITE, name: 'North', health_system_id: 'hs-1', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('students')
		.values({ id: STUDENT, name: 'Alice', email: 's@x.com', created_at: ts, updated_at: ts })
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
			name: 'Pediatrics',
			clerkship_type: 'outpatient',
			required_days: 5,
			created_at: ts,
			updated_at: ts
		})
		.execute();

	// Everything belongs to schedule A only.
	await db
		.insertInto('schedule_students')
		.values({ id: 'ss-1', schedule_id: SCHEDULE_A, student_id: STUDENT, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values({ id: 'sp-1', schedule_id: SCHEDULE_A, preceptor_id: PRECEPTOR, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values({ id: 'sc-1', schedule_id: SCHEDULE_A, clerkship_id: CLERKSHIP, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_sites')
		.values({ id: 'sst-1', schedule_id: SCHEDULE_A, site_id: SITE, created_at: ts })
		.execute();
}

describe('Step 17 assignment APIs', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		holder.current = db;
		await seed(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('GET /api/schedules/assignments/options', () => {
		it('requires authentication', async () => {
			const res = await optionsRoute.GET(getEvent('/options', locals(null)));
			expect(res.status).toBe(401);
		});

		it('requires an active schedule', async () => {
			await db
				.updateTable('user')
				.set({ active_schedule_id: null })
				.where('id', '=', USER_A)
				.execute();
			const res = await optionsRoute.GET(getEvent('/options', locals(USER_A)));
			expect(res.status).toBe(400);
		});

		it('returns annotated lists for the caller schedule', async () => {
			const res = await optionsRoute.GET(getEvent('/options', locals(USER_A)));
			expect(res.status).toBe(200);
			const json = await body<{ success: boolean; data: Record<string, unknown[]> }>(res);
			expect(json.success).toBe(true);
			expect(json.data.clerkships).toHaveLength(1);
			expect(json.data.preceptors).toHaveLength(1);
			expect(json.data.sites).toHaveLength(1);
		});

		it('does not expose another user schedule entities', async () => {
			const res = await optionsRoute.GET(getEvent('/options', locals(USER_B)));
			const json = await body<{ data: Record<string, unknown[]> }>(res);
			expect(json.data.clerkships).toEqual([]);
			expect(json.data.preceptors).toEqual([]);
			expect(json.data.sites).toEqual([]);
		});

		it('narrows on a partial selection', async () => {
			const res = await optionsRoute.GET(
				getEvent(`/options?clerkshipId=${CLERKSHIP}`, locals(USER_A))
			);
			const json = await body<{ data: { preceptors: { eligible: boolean; reason?: string }[] } }>(
				res
			);
			// The preceptor is on no team for this clerkship — marked, not hidden.
			expect(json.data.preceptors).toHaveLength(1);
			expect(json.data.preceptors[0].eligible).toBe(false);
			expect(json.data.preceptors[0].reason).toContain('Pediatrics');
		});
	});

	describe('GET /api/schedules/assignments/day-states', () => {
		it('requires authentication', async () => {
			const res = await dayStatesRoute.GET(getEvent('/day-states', locals(null)));
			expect(res.status).toBe(401);
		});

		it('rejects a missing or malformed range', async () => {
			expect((await dayStatesRoute.GET(getEvent('/day-states', locals(USER_A)))).status).toBe(400);
			expect(
				(await dayStatesRoute.GET(getEvent('/day-states?from=nope&to=2030-01-02', locals(USER_A))))
					.status
			).toBe(400);
		});

		it('returns one entry per date', async () => {
			const res = await dayStatesRoute.GET(
				getEvent(
					`/day-states?from=2030-06-01&to=2030-06-03&preceptorId=${PRECEPTOR}&studentId=${STUDENT}`,
					locals(USER_A)
				)
			);
			expect(res.status).toBe(200);
			const json = await body<{ data: { days: { date: string; inRange: boolean }[] } }>(res);
			expect(json.data.days).toHaveLength(3);
			expect(json.data.days.every((d) => d.inRange)).toBe(true);
		});
	});

	describe('GET /api/schedules/assignments/requirement-preview', () => {
		it('requires authentication', async () => {
			const res = await requirementRoute.GET(getEvent('/requirement-preview', locals(null)));
			expect(res.status).toBe(401);
		});

		it('rejects missing ids', async () => {
			const res = await requirementRoute.GET(
				getEvent(`/requirement-preview?studentId=${STUDENT}`, locals(USER_A))
			);
			expect(res.status).toBe(400);
		});

		it('rejects a negative count', async () => {
			const res = await requirementRoute.GET(
				getEvent(
					`/requirement-preview?studentId=${STUDENT}&clerkshipId=${CLERKSHIP}&count=-1`,
					locals(USER_A)
				)
			);
			expect(res.status).toBe(400);
		});

		it('returns the projected impact', async () => {
			const res = await requirementRoute.GET(
				getEvent(
					`/requirement-preview?studentId=${STUDENT}&clerkshipId=${CLERKSHIP}&count=2`,
					locals(USER_A)
				)
			);
			const json = await body<{ data: { required: number; selected: number } }>(res);
			expect(json.data.required).toBe(5);
			expect(json.data.selected).toBe(2);
		});
	});

	describe('POST /api/schedules/assignments', () => {
		const payload = {
			student_id: STUDENT,
			preceptor_id: PRECEPTOR,
			clerkship_id: CLERKSHIP,
			date: FUTURE
		};

		it('requires authentication', async () => {
			const res = await createRoute.POST(postEvent(payload, locals(null)));
			expect(res.status).toBe(401);
		});

		it('rejects an invalid body', async () => {
			const res = await createRoute.POST(postEvent({ student_id: STUDENT }, locals(USER_A)));
			expect(res.status).toBe(400);
		});

		it('creates and returns the assignment', async () => {
			const res = await createRoute.POST(postEvent(payload, locals(USER_A)));
			expect(res.status).toBe(201);
			const json = await body<{ data: { assignment: { date: string } } }>(res);
			expect(json.data.assignment.date).toBe(FUTURE);
		});

		it('ignores `locked` from a caller without the autogen entitlement', async () => {
			const res = await createRoute.POST(postEvent({ ...payload, locked: true }, locals(USER_A)));
			const json = await body<{ data: { assignment: { locked: number } } }>(res);
			expect(json.data.assignment.locked).toBe(0);
		});

		it('honours `locked` for an entitled caller', async () => {
			const res = await createRoute.POST(
				postEvent({ ...payload, locked: true }, locals(USER_A, ['autogen']))
			);
			const json = await body<{ data: { assignment: { locked: number } } }>(res);
			expect(json.data.assignment.locked).toBe(1);
		});

		it('creates an explicit list of days', async () => {
			const res = await createRoute.POST(
				postEvent(
					{ ...payload, date: undefined, dates: ['2030-06-15', '2030-06-17'] },
					locals(USER_A)
				)
			);
			expect(res.status).toBe(200);
			const json = await body<{ data: { createdCount: number } }>(res);
			expect(json.data.createdCount).toBe(2);
		});

		it('returns 422 with the soft codes when an override is needed', async () => {
			const res = await createRoute.POST(
				postEvent({ ...payload, date: '2020-01-02' }, locals(USER_A))
			);
			expect(res.status).toBe(422);
			const json = await body<{ error: { soft: { code: string }[] } }>(res);
			expect(json.error.soft.some((v) => v.code === 'past_date')).toBe(true);
		});

		it('accepts the override and persists the codes', async () => {
			const res = await createRoute.POST(
				postEvent(
					{
						...payload,
						date: '2020-01-02',
						override_codes: ['past_date', 'outside_schedule'],
						override_note: 'backfilled'
					},
					locals(USER_A)
				)
			);
			expect(res.status).toBe(201);
			const overrides = await overridesRoute.GET(getEvent('/overrides', locals(USER_A)));
			const json = await body<{ data: { overrides: { codes: string[]; note: string }[] } }>(
				overrides
			);
			expect(json.data.overrides).toHaveLength(1);
			expect(json.data.overrides[0].codes.sort()).toEqual(['outside_schedule', 'past_date']);
			expect(json.data.overrides[0].note).toBe('backfilled');
		});

		it('applies a requested side effect in the same call', async () => {
			await createRoute.POST(
				postEvent(
					{
						...payload,
						side_effects: [{ kind: 'bump_preceptor_capacity', preceptor_id: PRECEPTOR }]
					},
					locals(USER_A)
				)
			);
			const p = await db
				.selectFrom('preceptors')
				.select('max_students')
				.where('id', '=', PRECEPTOR)
				.executeTakeFirst();
			expect(p?.max_students).toBe(2);
		});

		it('rolls a side effect back when the assignment is rejected', async () => {
			const res = await createRoute.POST(
				postEvent(
					{
						...payload,
						date: '2020-01-02',
						side_effects: [{ kind: 'bump_preceptor_capacity', preceptor_id: PRECEPTOR }]
					},
					locals(USER_A)
				)
			);
			expect(res.status).toBe(422);
			const p = await db
				.selectFrom('preceptors')
				.select('max_students')
				.where('id', '=', PRECEPTOR)
				.executeTakeFirst();
			expect(p?.max_students).toBe(1);
		});
	});

	describe('GET /api/schedules/overrides', () => {
		it('requires authentication', async () => {
			const res = await overridesRoute.GET(getEvent('/overrides', locals(null)));
			expect(res.status).toBe(401);
		});

		it('is empty for a schedule with no overrides', async () => {
			const res = await overridesRoute.GET(getEvent('/overrides', locals(USER_B)));
			const json = await body<{ data: { overrides: unknown[] } }>(res);
			expect(json.data.overrides).toEqual([]);
		});
	});

	describe('DELETE /api/schedules/assignments/[id]', () => {
		async function insertPast(): Promise<string> {
			const ts = new Date().toISOString();
			const id = crypto.randomUUID();
			await db
				.insertInto('schedule_assignments')
				.values({
					id,
					student_id: STUDENT,
					preceptor_id: PRECEPTOR,
					clerkship_id: CLERKSHIP,
					date: '2020-01-02',
					status: 'scheduled',
					created_at: ts,
					updated_at: ts
				})
				.execute();
			return id;
		}

		it('returns 409 with the past_date code without force', async () => {
			const id = await insertPast();
			const res = await idRoute.DELETE(
				getEvent(`/api/schedules/assignments/${id}`, locals(USER_A), { id })
			);
			expect(res.status).toBe(409);
			const json = await body<{ error: { code: string } }>(res);
			expect(json.error.code).toBe('past_date');
		});

		it('deletes with ?force=true', async () => {
			const id = await insertPast();
			const res = await idRoute.DELETE(
				getEvent(`/api/schedules/assignments/${id}?force=true`, locals(USER_A), { id })
			);
			expect(res.status).toBe(200);
			const remaining = await db
				.selectFrom('schedule_assignments')
				.select('id')
				.where('id', '=', id)
				.executeTakeFirst();
			expect(remaining).toBeUndefined();
		});

		it('deletes a future assignment without force', async () => {
			const ts = new Date().toISOString();
			const futureId = crypto.randomUUID();
			await db
				.insertInto('schedule_assignments')
				.values({
					id: futureId,
					student_id: STUDENT,
					preceptor_id: PRECEPTOR,
					clerkship_id: CLERKSHIP,
					date: FUTURE,
					status: 'scheduled',
					created_at: ts,
					updated_at: ts
				})
				.execute();
			const res = await idRoute.DELETE(
				getEvent(`/api/schedules/assignments/${futureId}`, locals(USER_A), { id: futureId })
			);
			expect(res.status).toBe(200);
		});
	});
});
