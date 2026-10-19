#!/usr/bin/env tsx
/**
 * Demo account CLI — see docs/DEMO-ACCOUNT.md.
 *
 *   npm run demo:seed -- --password=<pw> [--email=demo@demo.lic.test] [--plan=pro|standard] [--force]
 *   npm run demo:clear -- [--email=demo@demo.lic.test] [--dry-run]
 *
 * Targets the database selected by DATABASE_URL / DATABASE_PATH, like every
 * other db command. The password may also come from DEMO_PASSWORD.
 */

import { parseArgs } from 'util';
import { isPlanId } from '../../../billing/plans';
import { createBilling } from '../../../server/billing';
import { createIdentity } from '../../../server/identity';
import { describeDbConfig, resolveDbConfig } from '../../config';
import { createDB } from '../../connection';
import { clearDemoAssignments, DEFAULT_DEMO_EMAIL, seedDemoAccount } from './account';

const USAGE = `Usage:
  npm run demo:seed  -- --password=<password> [--email=${DEFAULT_DEMO_EMAIL}] [--plan=pro|standard] [--force]
  npm run demo:clear -- [--email=${DEFAULT_DEMO_EMAIL}] [--dry-run]`;

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const { values } = parseArgs({
		args: rest,
		options: {
			email: { type: 'string' },
			password: { type: 'string' },
			plan: { type: 'string' },
			force: { type: 'boolean' },
			'dry-run': { type: 'boolean' }
		}
	});

	const config = resolveDbConfig(process.env);
	const db = createDB(config);
	console.log(`Database: ${describeDbConfig(config)}`);

	try {
		if (command === 'seed') {
			const password = values.password ?? process.env.DEMO_PASSWORD;
			if (!password || password.length < 8) {
				throw new Error(
					'A password of at least 8 characters is required (--password or DEMO_PASSWORD).'
				);
			}
			const plan = values.plan ?? 'pro';
			if (!isPlanId(plan)) throw new Error(`Unknown plan "${plan}" (standard or pro).`);

			const result = await seedDemoAccount(
				db,
				{
					identity: createIdentity({ db, dialect: config.dialect }),
					billing: createBilling({ db })
				},
				{ email: values.email, password, planId: plan, force: values.force }
			);

			console.log(
				`\n${result.replacedExisting ? 'Rebuilt' : 'Created'} demo account ${result.email} (plan: ${result.planId})`
			);
			for (const s of result.schedules) {
				const summary = Object.entries(s.counts)
					.map(([k, n]) => `${n} ${k}`)
					.join(', ');
				console.log(`  • ${s.name}  ${s.start} → ${s.end}\n      ${summary}`);
			}
			console.log(`\nSign in as ${result.email}. "${result.schedules[0].name}" is active.`);
		} else if (command === 'clear-assignments') {
			const result = await clearDemoAssignments(db, {
				email: values.email,
				dryRun: values['dry-run']
			});
			const verb = result.dryRun ? 'Would remove' : 'Removed';
			console.log(
				`${verb} ${result.counts.assignments} assignment(s), ${result.counts.planPins} planner draft(s) ` +
					`and ${result.counts.generationRuns} generation run(s) across ${result.schedules} schedule(s) of ${result.email}.`
			);
		} else {
			console.log(USAGE);
			process.exitCode = command ? 1 : 0;
		}
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error(`\n✖ ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
