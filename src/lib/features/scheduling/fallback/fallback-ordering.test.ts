/**
 * Phase 3.4: global-fallback-only preceptors are ordered last within a tier.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { FallbackPreceptorResolver } from './preceptor-resolver';

const HS = 'hs-1';
const CLERK = 'clerk-1';
const TEAM = 'team-1';

describe('FallbackPreceptorResolver — global-fallback-only ordering', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		const ts = new Date().toISOString();
		await db
			.insertInto('health_systems')
			.values({ id: HS, name: 'HS', created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('clerkships')
			.values({
				id: CLERK,
				name: 'Med',
				clerkship_type: 'inpatient',
				required_days: 10,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// p-fallback is global-fallback-only with a BETTER (lower) priority; p-normal
		// is a regular member. Fallback-only must still sort after the normal member.
		await db
			.insertInto('preceptors')
			.values([
				{
					id: 'p-fallback',
					name: 'Fallback',
					email: 'f@x.com',
					health_system_id: HS,
					is_global_fallback_only: 1,
					created_at: ts,
					updated_at: ts
				},
				{
					id: 'p-normal',
					name: 'Normal',
					email: 'n@x.com',
					health_system_id: HS,
					is_global_fallback_only: 0,
					created_at: ts,
					updated_at: ts
				}
			])
			.execute();
		await db
			.insertInto('preceptor_teams')
			.values({ id: TEAM, clerkship_id: CLERK, name: 'Team', created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('preceptor_team_members')
			.values([
				{ id: 'tm-f', team_id: TEAM, preceptor_id: 'p-fallback', priority: 0, created_at: ts },
				{ id: 'tm-n', team_id: TEAM, preceptor_id: 'p-normal', priority: 1, created_at: ts }
			])
			.execute();
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('orders the non-fallback-only preceptor first even with a worse priority', async () => {
		const resolver = new FallbackPreceptorResolver(db);
		const ordered = await resolver.getOrderedFallbackPreceptors(CLERK, TEAM, HS, false);
		expect(ordered.map((p) => p.id)).toEqual(['p-normal', 'p-fallback']);
	});
});
