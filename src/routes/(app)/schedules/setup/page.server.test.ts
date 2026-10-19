/**
 * /schedules/setup — set the name and dates of the schedule the user already
 * has (onboarding's second step and the dashboard checklist's target).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

const holder: { db?: Kysely<DB> } = {};
vi.mock('$lib/db', () => ({
	get db() {
		return holder.db;
	}
}));

import { cleanupTestDatabase, createTestDatabaseWithMigrations } from '$lib/db/test-utils';
import { getSetupChecklist } from '$lib/features/scheduling/services/readiness';
import { DEFAULT_SCHEDULE_NAME } from '$lib/features/schedules/defaults';
import { actions, load } from './+page.server';

const TS = '2026-01-01T00:00:00.000Z';
const USER = 'setup-user';
const OTHER = 'other-user';

function locals(userId: string | null = USER): App.Locals {
	return {
		session: userId
			? { user: { id: userId, email: `${userId}@x.com`, name: userId }, activeOrganizationId: null }
			: null,
		organization: null,
		entitlements: []
	};
}

function post(fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return new Request('http://localhost/schedules/setup', { method: 'POST', body });
}

async function redirectOf(fn: () => unknown) {
	try {
		await fn();
	} catch (error) {
		if (isRedirect(error)) return error.location;
		throw error;
	}
	return null;
}

const submit = (request: Request, userId: string | null = USER) =>
	actions.default({ request, locals: locals(userId) } as never);

async function schedule(id: string) {
	return holder
		.db!.selectFrom('scheduling_periods')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirstOrThrow();
}

describe('/schedules/setup', () => {
	beforeAll(async () => {
		holder.db = await createTestDatabaseWithMigrations();
		const db = holder.db;
		for (const [id, name] of [
			[USER, 'Setup User'],
			[OTHER, 'Other User']
		]) {
			await db
				.insertInto('user')
				.values({
					id,
					name,
					email: `${id}@x.com`,
					emailVerified: 0,
					createdAt: TS,
					updatedAt: TS
				} as never)
				.execute();
		}
		// The schedule sign-up creates: default name, never saved since.
		for (const [id, owner] of [
			['sched-mine', USER],
			['sched-other', OTHER]
		]) {
			await db
				.insertInto('scheduling_periods')
				.values({
					id,
					name: DEFAULT_SCHEDULE_NAME,
					start_date: '2026-07-01',
					end_date: '2027-06-30',
					user_id: owner,
					is_active: 0,
					created_at: TS,
					updated_at: TS
				})
				.execute();
			await db
				.updateTable('user')
				.set({ active_schedule_id: id })
				.where('id', '=', owner)
				.execute();
		}
	});

	afterAll(async () => {
		if (holder.db) await cleanupTestDatabase(holder.db);
	});

	it('loads the active schedule, flagging the onboarding step', async () => {
		const data = await load({
			locals: locals(),
			url: new URL('http://localhost/schedules/setup?onboarding')
		} as never);
		expect(data).toEqual({
			schedule: {
				id: 'sched-mine',
				name: DEFAULT_SCHEDULE_NAME,
				start_date: '2026-07-01',
				end_date: '2027-06-30'
			},
			onboarding: true
		});
	});

	it('sends a signed-out visitor to login', async () => {
		expect(
			await redirectOf(() =>
				load({ locals: locals(null), url: new URL('http://localhost/schedules/setup') } as never)
			)
		).toBe('/login');
	});

	it('rejects a blank name and an end before the start, changing nothing', async () => {
		const result = (await submit(
			post({ name: '  ', start_date: '2026-09-01', end_date: '2026-08-01' })
		)) as { status: number; data: { errors: Record<string, string[]> } };
		expect(result.status).toBe(400);
		expect(result.data.errors.name).toEqual(['Schedule name is required']);
		expect(result.data.errors.end_date).toEqual([
			'The end date must be on or after the start date'
		]);
		expect((await schedule('sched-mine')).name).toBe(DEFAULT_SCHEDULE_NAME);
	});

	it('the checklist step is open until the default schedule is saved', async () => {
		const items = await getSetupChecklist(holder.db!, 'sched-mine', false);
		expect(items.find((i) => i.id === 'schedule-dates')).toMatchObject({
			done: false,
			href: '/schedules/setup'
		});
	});

	it('saves the active schedule — keeping the default name is fine — and completes the step', async () => {
		expect(
			await redirectOf(() =>
				submit(
					post({ name: DEFAULT_SCHEDULE_NAME, start_date: '2026-08-03', end_date: '2027-05-28' })
				)
			)
		).toBe('/dashboard');

		const saved = await schedule('sched-mine');
		expect(saved).toMatchObject({ start_date: '2026-08-03', end_date: '2027-05-28' });
		const items = await getSetupChecklist(holder.db!, 'sched-mine', false);
		expect(items.find((i) => i.id === 'schedule-dates')?.done).toBe(true);
	});

	it('only ever touches the signed-in user’s own active schedule', async () => {
		await redirectOf(() =>
			submit(
				post({
					id: 'sched-other',
					name: 'Hijack',
					start_date: '2026-08-03',
					end_date: '2026-09-01'
				})
			)
		);
		expect((await schedule('sched-other')).name).toBe(DEFAULT_SCHEDULE_NAME);
		expect((await schedule('sched-mine')).name).toBe('Hijack');
	});
});
