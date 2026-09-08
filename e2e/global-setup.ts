/**
 * Playwright global setup: assert the seeded database invariants every journey
 * relies on, so a broken seed fails in one clear message instead of as forty
 * red tests.
 *
 * The database itself is created and seeded by the `webServer` command in
 * `playwright.config.ts` (fresh file → migrations → seed → build → preview); by
 * the time this runs the server is up and the file exists.
 */

import { openTestDb, entitlementsOf, userByEmail } from './fixtures/db';
import { ADMIN, BASIC } from './fixtures/users';

function fail(msg: string): never {
	throw new Error(`[e2e global-setup] seed invariant violated: ${msg}`);
}

export default async function globalSetup() {
	const db = openTestDb();
	try {
		const admin = await userByEmail(db, ADMIN.email);
		if (!admin) fail(`missing seeded user ${ADMIN.email}`);
		if (!admin.active_schedule_id) fail(`${ADMIN.email} has no active schedule`);
		if (!(await entitlementsOf(db, ADMIN.email)).includes('autogen')) {
			fail(`${ADMIN.email} is not entitled to autogen`);
		}

		const basic = await userByEmail(db, BASIC.email);
		if (!basic) fail(`missing seeded user ${BASIC.email}`);
		if (!basic.active_schedule_id) fail(`${BASIC.email} has no active schedule`);
		if ((await entitlementsOf(db, BASIC.email)).includes('autogen')) {
			fail(`${BASIC.email} must NOT be entitled to autogen`);
		}

		const scheduleId = admin.active_schedule_id!;
		const count = async (table: Parameters<typeof db.selectFrom>[0]) =>
			Number(
				(
					await db
						.selectFrom(table)
						.select((eb) => eb.fn.countAll<number>().as('n'))
						.executeTakeFirst()
				)?.n ?? 0
			);

		if ((await count('preceptor_availability')) === 0) {
			fail('no materialised preceptor_availability rows (engine cannot generate)');
		}
		if ((await count('clerkship_electives')) < 2) {
			fail('expected the seeded Cardiology/Dermatology electives on Internal Medicine');
		}
		if ((await count('blackout_dates')) < 2) fail('expected two seeded blackout dates');

		const locked = await db
			.selectFrom('schedule_assignments')
			.select('id')
			.where('schedule_id', '=', scheduleId)
			.where('locked', '=', 1)
			.executeTakeFirst();
		if (!locked) fail('expected one seeded locked assignment in the admin schedule');

		const students = await db
			.selectFrom('schedule_students')
			.select('student_id')
			.where('schedule_id', '=', scheduleId)
			.execute();
		const healthSystems = await db
			.selectFrom('schedule_health_systems')
			.select('health_system_id')
			.where('schedule_id', '=', scheduleId)
			.execute();
		const onboarded = await db
			.selectFrom('student_health_system_onboarding')
			.select(['student_id', 'health_system_id'])
			.where('is_completed', '=', 1)
			.execute();
		const pairs = new Set(onboarded.map((o) => `${o.student_id}|${o.health_system_id}`));
		const missing = students.flatMap((s) =>
			healthSystems
				.filter((h) => !pairs.has(`${s.student_id}|${h.health_system_id}`))
				.map((h) => `${s.student_id}@${h.health_system_id}`)
		);
		if (missing.length !== 1) {
			fail(
				`expected exactly one un-onboarded (student, health system) pair, found ${missing.length}`
			);
		}

		console.log('[e2e global-setup] seed invariants OK');
	} finally {
		await db.destroy();
	}
}
