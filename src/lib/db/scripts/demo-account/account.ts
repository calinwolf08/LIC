/**
 * Create (or rebuild) the demo account, and clear its assignments.
 *
 * Seeding always starts from scratch: an existing demo account is removed with
 * `resetUser` (only data it exclusively owns) and created again, so a re-seed
 * also undoes any edits made while exploring. Clearing removes only the
 * account's assignments (and generation/planning history), keeping the setup.
 *
 * Imports are relative: this runs under plain tsx (also inside the Docker image).
 */

import type { Kysely } from 'kysely';
import type { PlanId } from '../../../billing/plans';
import type { BillingService } from '../../../server/billing/service';
import type { IdentityService } from '../../../server/identity/types';
import type { DB } from '../../types';
import { resetUser } from '../reset-lib';
import {
	buildScenario,
	DEMO_EMAIL_DOMAIN,
	demoAnchor,
	demoNamespace,
	type BuiltSchedule
} from './builder';
import { DEMO_SCENARIOS, type ScheduleScenario } from './scenarios';

export const DEFAULT_DEMO_EMAIL = `demo@${DEMO_EMAIL_DOMAIN}`;
export const DEMO_ORGANIZATION_NAME = 'Demo University LIC';

export class DemoAccountError extends Error {}

export interface SeedDemoOptions {
	email?: string;
	password: string;
	planId?: PlanId;
	/** Allow rebuilding an existing account outside the demo email domain. */
	force?: boolean;
	scenarios?: ScheduleScenario[];
	today?: Date;
}

export interface SeedDemoResult {
	email: string;
	userId: string;
	organizationId: string;
	planId: PlanId;
	replacedExisting: boolean;
	schedules: BuiltSchedule[];
}

function isDemoEmail(email: string): boolean {
	return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export async function seedDemoAccount(
	db: Kysely<DB>,
	services: { identity: IdentityService; billing: BillingService },
	options: SeedDemoOptions
): Promise<SeedDemoResult> {
	const email = (options.email ?? DEFAULT_DEMO_EMAIL).trim().toLowerCase();
	const planId = options.planId ?? 'pro';
	const scenarios = options.scenarios ?? DEMO_SCENARIOS;
	if (scenarios.length === 0) throw new DemoAccountError('No demo scenarios to seed');

	const existing = await db
		.selectFrom('user')
		.select('id')
		.where('email', '=', email)
		.executeTakeFirst();
	if (existing) {
		if (!isDemoEmail(email) && !options.force) {
			throw new DemoAccountError(
				`${email} already exists and is not a @${DEMO_EMAIL_DOMAIN} demo account. ` +
					'Re-seeding deletes the account and everything it owns; pass --force to do that.'
			);
		}
		await resetUser(db, email);
	}

	const { user } = await services.identity.signUpWithEmail({
		name: 'Demo Coordinator',
		email,
		password: options.password
	});
	const { id: organizationId } = await services.identity.createOrganization({
		name: DEMO_ORGANIZATION_NAME,
		ownerUserId: user.id
	});
	await services.billing.subscribe({
		organizationId,
		organizationName: DEMO_ORGANIZATION_NAME,
		billingEmail: email,
		planId,
		interval: 'year'
	});

	// The first scenario reuses the schedule created at sign-up (and stays
	// active); every other scenario gets a schedule of its own.
	const signUpSchedule = await db
		.selectFrom('user')
		.select('active_schedule_id')
		.where('id', '=', user.id)
		.executeTakeFirst();

	const start = demoAnchor(options.today);
	const namespace = demoNamespace(email, DEFAULT_DEMO_EMAIL);
	const schedules: BuiltSchedule[] = [];
	for (const [index, scenario] of scenarios.entries()) {
		let scheduleId = index === 0 ? signUpSchedule?.active_schedule_id : null;
		if (!scheduleId) {
			scheduleId = crypto.randomUUID();
			const ts = new Date().toISOString();
			await db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scenario.name,
					start_date: start,
					end_date: start,
					user_id: user.id,
					is_active: 0,
					created_at: ts,
					updated_at: ts
				})
				.execute();
		}
		schedules.push(await buildScenario(db, { scheduleId, scenario, start, namespace }));
	}

	await db
		.updateTable('user')
		.set({ active_schedule_id: schedules[0].scheduleId })
		.where('id', '=', user.id)
		.execute();

	return {
		email,
		userId: user.id,
		organizationId,
		planId,
		replacedExisting: Boolean(existing),
		schedules
	};
}

export interface ClearDemoResult {
	email: string;
	schedules: number;
	counts: { assignments: number; planPins: number; generationRuns: number };
	dryRun: boolean;
}

/**
 * Remove every assignment (plus planner drafts and generation history) from the
 * account's schedules. Students, preceptors, availability and settings stay.
 */
export async function clearDemoAssignments(
	db: Kysely<DB>,
	options: { email?: string; dryRun?: boolean } = {}
): Promise<ClearDemoResult> {
	const email = (options.email ?? DEFAULT_DEMO_EMAIL).trim().toLowerCase();
	const dryRun = options.dryRun ?? false;

	const user = await db
		.selectFrom('user')
		.select('id')
		.where('email', '=', email)
		.executeTakeFirst();
	if (!user) throw new DemoAccountError(`No account found for ${email}. Run demo:seed first.`);

	const scheduleIds = (
		await db.selectFrom('scheduling_periods').select('id').where('user_id', '=', user.id).execute()
	)
		.map((row) => row.id)
		.filter((value): value is string => Boolean(value));

	const counts = { assignments: 0, planPins: 0, generationRuns: 0 };
	if (scheduleIds.length === 0) return { email, schedules: 0, counts, dryRun };

	const countRows = async (
		table: 'schedule_assignments' | 'schedule_plan_pins' | 'generation_runs'
	) =>
		Number(
			(
				await db
					.selectFrom(table)
					.select((eb) => eb.fn.countAll<number>().as('c'))
					.where('schedule_id', 'in', scheduleIds)
					.executeTakeFirst()
			)?.c ?? 0
		);

	counts.assignments = await countRows('schedule_assignments');
	counts.planPins = await countRows('schedule_plan_pins');
	counts.generationRuns = await countRows('generation_runs');

	if (!dryRun) {
		await db.transaction().execute(async (trx) => {
			for (const table of [
				'schedule_assignments',
				'schedule_plan_pins',
				'generation_runs'
			] as const) {
				await trx.deleteFrom(table).where('schedule_id', 'in', scheduleIds).execute();
			}
		});
	}

	return { email, schedules: scheduleIds.length, counts, dryRun };
}
