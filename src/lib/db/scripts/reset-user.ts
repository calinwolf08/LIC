#!/usr/bin/env tsx

/**
 * Reset a single user account: delete the user and everything it exclusively
 * owns, leaving other accounts (and any entities shared with them) untouched.
 *
 * Usage:
 *   npm run db:reset-user -- --email=someone@example.com
 *   npm run db:reset-user -- --email=someone@example.com --dry-run
 *   npm run db:reset-user -- --email=someone@example.com --yes
 *   DATABASE_PATH=./test-sqlite.db npm run db:reset-user -- --email=admin@example.com --yes
 *
 * Flags:
 *   --email=<addr>  (required) the account to remove
 *   --dry-run       print a per-table count of what would be deleted; write nothing
 *   --yes           skip the interactive confirmation
 */

import { createInterface } from 'node:readline/promises';
import { createDB } from '../connection';
import { resetUser, ResetError } from './reset-lib';

function parseArgs(argv: string[]) {
	let email: string | undefined;
	let dryRun = false;
	let yes = false;
	for (const arg of argv) {
		if (arg.startsWith('--email=')) email = arg.slice('--email='.length);
		else if (arg === '--dry-run') dryRun = true;
		else if (arg === '--yes' || arg === '-y') yes = true;
	}
	return { email, dryRun, yes };
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
	const rows = Object.entries(counts).filter(([, n]) => n > 0);
	if (rows.length === 0) {
		console.log('  (nothing to delete)');
		return;
	}
	const width = Math.max(...rows.map(([t]) => t.length));
	for (const [table, n] of rows) {
		console.log(`  ${table.padEnd(width)}  ${n}`);
	}
}

async function main() {
	const { email, dryRun, yes } = parseArgs(process.argv.slice(2));

	if (!email) {
		console.error('Error: --email=<address> is required');
		console.error('Usage: npm run db:reset-user -- --email=someone@example.com [--dry-run] [--yes]');
		process.exit(1);
	}

	const db = createDB(process.env.DATABASE_PATH || './sqlite.db');

	try {
		if (dryRun) {
			const result = await resetUser(db, email, { dryRun: true });
			console.log(`Dry run for ${email} (user ${result.userId}). Would delete:`);
			printCounts(result.counts);
			console.log('\nNo changes were made (--dry-run).');
			return;
		}

		if (!yes) {
			// Show the plan first so the confirmation is informed.
			const preview = await resetUser(db, email, { dryRun: true });
			console.log(`About to permanently delete ${email} (user ${preview.userId}) and:`);
			printCounts(preview.counts);
			const ok = await confirm('\nType "y" to proceed: ');
			if (!ok) {
				console.log('Aborted.');
				process.exit(1);
			}
		}

		const result = await resetUser(db, email);
		console.log(`Deleted ${email} (user ${result.userId}). Removed:`);
		printCounts(result.counts);
	} catch (error) {
		if (error instanceof ResetError) {
			console.error(`Error: ${error.message}`);
			process.exit(1);
		}
		throw error;
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('reset-user failed:', error);
	process.exit(1);
});
