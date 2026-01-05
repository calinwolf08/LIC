#!/usr/bin/env npx tsx
/**
 * Seed Scenario CLI
 *
 * Seeds the database with predefined scenarios for manual testing.
 * Each scenario provides a complete set of entities needed to generate schedules.
 *
 * Usage:
 *   npm run seed:scenario -- --email=user@example.com --scenario=multi-team
 *   npm run seed:scenario -- --list
 *   npm run seed:scenario -- --help
 */

import { parseArgs } from 'util';
import { db } from './db';
import { clearAllEntities, getUserByEmail, getAvailableScenarios } from './helpers';

// Import scenarios
import { multiTeamScenario } from './scenarios/multi-team';
import { capacityLimitedScenario } from './scenarios/capacity-limited';
import { electivesScenario } from './scenarios/electives';
import { partialAvailabilityScenario } from './scenarios/partial-availability';

const scenarios: Record<string, (userId: string, scheduleId: string) => Promise<void>> = {
	'multi-team': multiTeamScenario,
	'capacity-limited': capacityLimitedScenario,
	'electives': electivesScenario,
	'partial-availability': partialAvailabilityScenario,
};

async function main() {
	const { values } = parseArgs({
		options: {
			email: { type: 'string', short: 'e' },
			scenario: { type: 'string', short: 's' },
			list: { type: 'boolean', short: 'l' },
			help: { type: 'boolean', short: 'h' },
		},
	});

	if (values.help) {
		printHelp();
		process.exit(0);
	}

	if (values.list) {
		console.log('\nAvailable scenarios:\n');
		for (const name of Object.keys(scenarios)) {
			const description = getAvailableScenarios()[name] || '';
			console.log(`  ${name.padEnd(20)} ${description}`);
		}
		console.log('');
		process.exit(0);
	}

	if (!values.email) {
		console.error('Error: --email is required');
		console.error('Usage: npm run seed:scenario -- --email=user@example.com --scenario=multi-team');
		process.exit(1);
	}

	if (!values.scenario) {
		console.error('Error: --scenario is required');
		console.error('Available scenarios:', Object.keys(scenarios).join(', '));
		process.exit(1);
	}

	const scenarioFn = scenarios[values.scenario];
	if (!scenarioFn) {
		console.error(`Error: Unknown scenario "${values.scenario}"`);
		console.error('Available scenarios:', Object.keys(scenarios).join(', '));
		process.exit(1);
	}

	try {
		// Get user and their active schedule
		console.log(`\nLooking up user: ${values.email}`);
		const user = await getUserByEmail(values.email);

		if (!user) {
			console.error(`Error: User with email "${values.email}" not found.`);
			console.error('Please sign up first at http://localhost:5173/register');
			process.exit(1);
		}

		if (!user.active_schedule_id) {
			console.error('Error: User has no active schedule.');
			console.error('Please create a schedule first.');
			process.exit(1);
		}

		console.log(`Found user: ${user.name || user.email} (${user.id})`);
		console.log(`Active schedule: ${user.active_schedule_id}`);

		// Clear existing entities
		console.log('\nClearing existing entities...');
		await clearAllEntities(user.id);
		console.log('Entities cleared.');

		// Run scenario
		console.log(`\nSeeding scenario: ${values.scenario}`);
		await scenarioFn(user.id, user.active_schedule_id);

		console.log('\nScenario seeded successfully!');
		console.log('You can now go to the Calendar page and generate a schedule.');
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	} finally {
		await db.destroy();
	}
}

function printHelp() {
	console.log(`
Seed Scenario CLI - Seeds database with test scenarios for manual validation

Usage:
  npm run seed:scenario -- --email=<email> --scenario=<name>
  npm run seed:scenario -- --list
  npm run seed:scenario -- --help

Options:
  -e, --email     Email of the user to seed data for (required)
  -s, --scenario  Name of the scenario to seed (required)
  -l, --list      List available scenarios
  -h, --help      Show this help message

Examples:
  npm run seed:scenario -- --email=test@example.com --scenario=multi-team
  npm run seed:scenario -- -e test@example.com -s capacity-limited

Notes:
  - You must sign up for an account first before running seed scripts
  - Each scenario clears all existing entities (except your user and schedule)
  - After seeding, go to Calendar page and click "Generate Schedule"
`);
}

main();
