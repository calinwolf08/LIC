#!/usr/bin/env tsx
/**
 * Grant or revoke a user entitlement (e.g. "autogen" for Stage 2 auto-generation).
 *
 * Usage:
 *   npx tsx scripts/set-entitlement.ts <email> <entitlement> on|off
 *
 * Example:
 *   npx tsx scripts/set-entitlement.ts admin@example.com autogen on
 *
 * Uses a raw better-sqlite3 connection so it does not depend on SvelteKit's
 * `$env` module (which cannot be resolved outside the SvelteKit build).
 */

import Database from 'better-sqlite3';

const [, , email, entitlement, stateArg] = process.argv;

if (!email || !entitlement || !stateArg || !['on', 'off'].includes(stateArg)) {
	console.error('Usage: npx tsx scripts/set-entitlement.ts <email> <entitlement> on|off');
	process.exit(1);
}

const dbPath = process.env.DATABASE_PATH || './sqlite.db';
const db = new Database(dbPath);

const row = db.prepare('SELECT id, entitlements FROM user WHERE email = ?').get(email) as
	| { id: string; entitlements: string | null }
	| undefined;

if (!row) {
	console.error(`No user found with email "${email}"`);
	process.exit(1);
}

let current: string[] = [];
try {
	current = row.entitlements ? JSON.parse(row.entitlements) : [];
	if (!Array.isArray(current)) current = [];
} catch {
	current = [];
}

const set = new Set(current);
if (stateArg === 'on') set.add(entitlement);
else set.delete(entitlement);

const next = JSON.stringify([...set]);
db.prepare('UPDATE user SET entitlements = ? WHERE id = ?').run(next, row.id);

console.log(`Updated ${email}: entitlements = ${next}`);
db.close();
