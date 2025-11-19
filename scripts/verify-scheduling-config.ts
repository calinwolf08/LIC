/**
 * Verify Sample Configurations
 *
 * This script verifies that sample scheduling configurations were created correctly
 * and displays a summary of what was configured.
 *
 * Run with: tsx scripts/verify-scheduling-config.ts
 */

import { db } from '../src/lib/db';

async function verify() {
	console.log('🔍 Verifying sample scheduling configurations...\n');

	// Health Systems
	const healthSystems = await db
		.selectFrom('health_systems')
		.selectAll()
		.execute();

	console.log(`📍 Health Systems: ${healthSystems.length}`);
	for (const hs of healthSystems) {
		const sites = await db
			.selectFrom('sites')
			.selectAll()
			.where('health_system_id', '=', hs.id)
			.execute();

		console.log(`  - ${hs.name} (${sites.length} sites)`);
		for (const site of sites) {
			console.log(`    • ${site.name}`);
		}
	}
	console.log();

	// Clerkship Requirements
	const requirements = await db
		.selectFrom('clerkship_requirements')
		.selectAll()
		.execute();

	console.log(`📋 Clerkship Requirements: ${requirements.length}`);
	for (const req of requirements) {
		const clerkship = await db
			.selectFrom('clerkships')
			.select('name')
			.where('id', '=', req.clerkship_id)
			.executeTakeFirst();

		console.log(`  - ${clerkship?.name}: ${req.requirement_type} (${req.required_days} days)`);
		console.log(`    Strategy: ${req.override_assignment_strategy || 'inherit'}`);

		if (req.requirement_type === 'elective') {
			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('requirement_id', '=', req.id)
				.execute();

			if (electives.length > 0) {
				console.log(`    Electives:`);
				for (const elective of electives) {
					console.log(`      • ${elective.name} (${elective.minimum_days} days min)`);
				}
			}
		}
	}
	console.log();

	// Capacity Rules
	const capacityRules = await db
		.selectFrom('preceptor_capacity_rules')
		.selectAll()
		.execute();

	console.log(`🎯 Capacity Rules: ${capacityRules.length}`);
	for (const rule of capacityRules) {
		const preceptor = await db
			.selectFrom('preceptors')
			.select('name')
			.where('id', '=', rule.preceptor_id)
			.executeTakeFirst();

		let scope = 'General';
		if (rule.clerkship_id && rule.requirement_type) {
			scope = 'Clerkship+Type (Most Specific)';
		} else if (rule.clerkship_id) {
			scope = 'Clerkship-Specific';
		} else if (rule.requirement_type) {
			scope = 'Requirement-Type';
		}

		console.log(`  - ${preceptor?.name}: ${rule.max_students_per_day}/day, ${rule.max_students_per_year}/year (${scope})`);
	}
	console.log();

	// Teams
	const teams = await db
		.selectFrom('preceptor_teams')
		.selectAll()
		.execute();

	console.log(`👥 Preceptor Teams: ${teams.length}`);
	for (const team of teams) {
		const members = await db
			.selectFrom('preceptor_team_members')
			.selectAll()
			.where('team_id', '=', team.id)
			.execute();

		console.log(`  - ${team.name} (${members.length} members)`);
		console.log(`    Rules: Same Health System: ${team.require_same_health_system ? '✓' : '✗'}, Same Site: ${team.require_same_site ? '✓' : '✗'}, Same Specialty: ${team.require_same_specialty ? '✓' : '✗'}`);
	}
	console.log();

	// Fallbacks
	const fallbacks = await db
		.selectFrom('preceptor_fallbacks')
		.selectAll()
		.execute();

	console.log(`🔄 Fallback Chains: ${fallbacks.length} fallback relationships`);

	// Group by primary preceptor
	const fallbackMap = new Map<string, typeof fallbacks>();
	for (const fallback of fallbacks) {
		const existing = fallbackMap.get(fallback.primary_preceptor_id) || [];
		existing.push(fallback);
		fallbackMap.set(fallback.primary_preceptor_id, existing);
	}

	for (const [primaryId, primaryFallbacks] of fallbackMap.entries()) {
		const primary = await db
			.selectFrom('preceptors')
			.select('name')
			.where('id', '=', primaryId)
			.executeTakeFirst();

		console.log(`  - ${primary?.name}:`);

		// Sort by priority
		const sorted = [...primaryFallbacks].sort((a, b) => a.priority - b.priority);

		for (const fb of sorted) {
			const fallbackPreceptor = await db
				.selectFrom('preceptors')
				.select('name')
				.where('id', '=', fb.fallback_preceptor_id)
				.executeTakeFirst();

			console.log(`    ${fb.priority}. ${fallbackPreceptor?.name}`);
		}
	}
	console.log();

	console.log('✅ Verification complete!\n');
	console.log('Summary:');
	console.log(`  - ${healthSystems.length} health systems`);
	console.log(`  - ${requirements.length} clerkship requirements`);
	console.log(`  - ${capacityRules.length} capacity rules (demonstrating hierarchy)`);
	console.log(`  - ${teams.length} preceptor teams`);
	console.log(`  - ${fallbacks.length} fallback relationships\n`);
}

// Run the verification
verify()
	.catch((error) => {
		console.error('❌ Error verifying configurations:', error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
