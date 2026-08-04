#!/usr/bin/env tsx

/**
 * Reset the entire database back to an empty (but migrated) state. This is a
 * footgun, so it refuses to run in production without an explicit override and
 * requires confirmation otherwise.
 *
 * Usage:
 *   npm run db:reset -- --yes
 *   npm run db:reset -- --yes --seed
 *   npm run db:reset -- --dry-run
 *   DATABASE_PATH=./test-sqlite.db npm run db:reset -- --yes --seed
 *
 * Flags:
 *   --yes                skip the interactive confirmation
 *   --dry-run            print a per-table count of what would be deleted; write nothing
 *   --seed               run `db:seed` afterwards for a one-liner fresh environment
 *   --force-production   allow running when NODE_ENV=production (otherwise refused)
 */

import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { createDB } from '../connection';
import { resetAll } from './reset-lib';

function parseArgs(argv: string[]) {
	return {
		yes: argv.includes('--yes') || argv.includes('-y'),
		dryRun: argv.includes('--dry-run'),
		seed: argv.includes('--seed'),
		forceProduction: argv.includes('--force-production'),
	};
}

async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(question);
		return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
	} finally {
		rl.close();
	}
}

function printCounts(counts: Record<string, number>) {
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	const rows = Object.entries(counts).filter(([, n]) => n > 0);
	for (const [table, n] of rows) {
		console.log(`  ${table}: ${n}`);
	}
	console.log(`  total rows: ${total}`);
}

async function main() {
	const { yes, dryRun, seed, forceProduction } = parseArgs(process.argv.slice(2));

	if (process.env.NODE_ENV === 'production' && !forceProduction) {
		console.error('Refusing to reset the database with NODE_ENV=production.');
		console.error('Pass --force-production if you really mean it.');
		process.exit(1);
	}

	const dbPath = process.env.DATABASE_PATH || './sqlite.db';
	const db = createDB(dbPath);

	try {
		if (dryRun) {
			const result = await resetAll(db, { dryRun: true });
			console.log(`Dry run against ${dbPath}. Would delete:`);
			printCounts(result.counts);
			console.log('\nNo changes were made (--dry-run).');
			return;
		}

		if (!yes) {
			console.log(`This will delete ALL data in ${dbPath}.`);
			const ok = await confirm('Type "y" to proceed: ');
			if (!ok) {
				console.log('Aborted.');
				process.exit(1);
			}
		}

		const result = await resetAll(db);
		console.log(`Reset ${dbPath}. Deleted:`);
		printCounts(result.counts);
	} finally {
		await db.destroy();
	}

	if (seed) {
		console.log('\nSeeding...');
		execFileSync('npx', ['tsx', 'src/lib/db/scripts/seed.ts'], {
			stdio: 'inherit',
			env: process.env,
		});
	}
}

main().catch((error) => {
	console.error('reset-all failed:', error);
	process.exit(1);
});
