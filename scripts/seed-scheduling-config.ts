/**
 * Sample School Configurations - Seed Script
 *
 * This script creates comprehensive sample data demonstrating the configurable
 * scheduling framework with realistic medical education scenarios.
 *
 * Run with: tsx scripts/seed-scheduling-config.ts
 */

import { db } from '../src/lib/db';
import { nanoid } from 'nanoid';

async function seed() {
	console.log('🌱 Seeding configurable scheduling sample data...\n');

	// ========================================
	// 1. HEALTH SYSTEMS & SITES
	// ========================================
	console.log('📍 Creating health systems and sites...');

	const healthSystemId1 = nanoid();
	const healthSystemId2 = nanoid();

	await db.insertInto('health_systems').values([
		{
			id: healthSystemId1,
			name: 'University Medical Center',
			description: 'Academic medical center with 500+ beds',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: healthSystemId2,
			name: 'Community Health Network',
			description: 'Community-based healthcare system',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	const siteId1 = nanoid();
	const siteId2 = nanoid();
	const siteId3 = nanoid();

	await db.insertInto('sites').values([
		{
			id: siteId1,
			name: 'Main Campus',
			health_system_id: healthSystemId1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: siteId2,
			name: 'Downtown Clinic',
			health_system_id: healthSystemId1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: siteId3,
			name: 'Eastside Medical Center',
			health_system_id: healthSystemId2,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	console.log('  ✓ Created 2 health systems and 3 sites\n');

	// ========================================
	// 2. CLERKSHIP REQUIREMENTS
	// ========================================
	console.log('📋 Creating clerkship requirements...');

	// Get existing clerkships
	const clerkships = await db
		.selectFrom('clerkships')
		.selectAll()
		.execute();

	if (clerkships.length === 0) {
		console.log('  ⚠ No clerkships found. Please create clerkships first.');
		return;
	}

	// Family Medicine - Outpatient focused with continuous single strategy
	const famMed = clerkships.find(c => c.specialty === 'Family Medicine');
	if (famMed?.id) {
		const reqId = nanoid();
		await db.insertInto('clerkship_requirements').values({
			id: reqId,
			clerkship_id: famMed.id,
			requirement_type: 'outpatient',
			required_days: 20,
			override_mode: 'override_section',
			override_assignment_strategy: 'continuous_single',
			override_health_system_rule: 'prefer_same_system',
			override_max_students_per_day: 2,
			override_max_students_per_year: 8,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		console.log('  ✓ Family Medicine: 20-day outpatient (continuous_single)');
	}

	// Internal Medicine - Both inpatient and outpatient with different strategies
	const internalMed = clerkships.find(c => c.specialty === 'Internal Medicine');
	if (internalMed?.id) {
		// Inpatient: Block-based strategy
		const inpatientReqId = nanoid();
		await db.insertInto('clerkship_requirements').values({
			id: inpatientReqId,
			clerkship_id: internalMed.id,
			requirement_type: 'inpatient',
			required_days: 28,
			override_mode: 'override_section',
			override_assignment_strategy: 'block_based',
			override_block_size: 14,
			override_health_system_rule: 'enforce_same_system',
			override_max_students_per_day: 3,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		// Outpatient: Continuous single
		const outpatientReqId = nanoid();
		await db.insertInto('clerkship_requirements').values({
			id: outpatientReqId,
			clerkship_id: internalMed.id,
			requirement_type: 'outpatient',
			required_days: 14,
			override_mode: 'override_fields',
			override_assignment_strategy: 'continuous_single',
			override_max_students_per_day: 2,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		console.log('  ✓ Internal Medicine: 28-day inpatient (block_based), 14-day outpatient');
	}

	// Surgery - Daily rotation with team support
	const surgery = clerkships.find(c => c.specialty === 'Surgery');
	if (surgery?.id) {
		const reqId = nanoid();
		await db.insertInto('clerkship_requirements').values({
			id: reqId,
			clerkship_id: surgery.id,
			requirement_type: 'inpatient',
			required_days: 42,
			override_mode: 'override_section',
			override_assignment_strategy: 'daily_rotation',
			override_health_system_rule: 'enforce_same_system',
			override_max_students_per_day: 4,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		console.log('  ✓ Surgery: 42-day inpatient (daily_rotation)');
	}

	// Pediatrics - With elective options
	const pediatrics = clerkships.find(c => c.specialty === 'Pediatrics');
	if (pediatrics?.id) {
		const reqId = nanoid();
		await db.insertInto('clerkship_requirements').values({
			id: reqId,
			clerkship_id: pediatrics.id,
			requirement_type: 'elective',
			required_days: 10,
			override_mode: 'inherit',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		// Add elective options
		const preceptors = await db
			.selectFrom('preceptors')
			.select(['id', 'specialty'])
			.where('specialty', '=', 'Pediatrics')
			.limit(3)
			.execute();

		if (preceptors.length > 0) {
			await db.insertInto('clerkship_electives').values([
				{
					id: nanoid(),
					requirement_id: reqId,
					name: 'Pediatric Cardiology',
					specialty: 'Pediatrics',
					minimum_days: 5,
					available_preceptor_ids: JSON.stringify([preceptors[0].id]),
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: nanoid(),
					requirement_id: reqId,
					name: 'General Pediatrics',
					specialty: 'Pediatrics',
					minimum_days: 10,
					available_preceptor_ids: JSON.stringify(preceptors.map(p => p.id)),
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			]).execute();

			console.log('  ✓ Pediatrics: 10-day elective with 2 options');
		}
	}

	console.log();

	// ========================================
	// 3. CAPACITY RULES
	// ========================================
	console.log('🎯 Creating capacity rules...');

	const preceptors = await db
		.selectFrom('preceptors')
		.selectAll()
		.limit(10)
		.execute();

	if (preceptors.length === 0) {
		console.log('  ⚠ No preceptors found. Skipping capacity rules.\n');
	} else {
		// General rule for first preceptor
		await db.insertInto('preceptor_capacity_rules').values({
			id: nanoid(),
			preceptor_id: preceptors[0].id,
			max_students_per_day: 3,
			max_students_per_year: 12,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		// Clerkship-specific rule
		if (famMed?.id) {
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: preceptors[1]?.id,
				clerkship_id: famMed.id,
				max_students_per_day: 2,
				max_students_per_year: 8,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}).execute();
		}

		// Requirement-type specific rule
		await db.insertInto('preceptor_capacity_rules').values({
			id: nanoid(),
			preceptor_id: preceptors[2]?.id,
			requirement_type: 'inpatient',
			max_students_per_day: 4,
			max_students_per_year: 16,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).execute();

		// Most specific rule (clerkship + requirement type)
		if (internalMed?.id) {
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: preceptors[3]?.id,
				clerkship_id: internalMed.id,
				requirement_type: 'inpatient',
				max_students_per_day: 3,
				max_students_per_year: 12,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}).execute();
		}

		console.log('  ✓ Created 4 capacity rules demonstrating hierarchical resolution\n');
	}

	// ========================================
	// 4. PRECEPTOR TEAMS
	// ========================================
	console.log('👥 Creating preceptor teams...');

	if (surgery?.id && preceptors.length >= 4) {
		const surgeryPreceptors = preceptors.filter(p => p.specialty === 'Surgery').slice(0, 3);

		if (surgeryPreceptors.length >= 2) {
			const teamId = nanoid();
			await db.insertInto('preceptor_teams').values({
				id: teamId,
				clerkship_id: surgery.id,
				name: 'Surgery Teaching Team A',
				description: 'Primary surgical teaching team for student rotations',
				require_same_health_system: true,
				require_same_site: false,
				require_same_specialty: true,
				requires_admin_approval: false,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}).execute();

			// Add team members
			for (let i = 0; i < surgeryPreceptors.length; i++) {
				await db.insertInto('preceptor_team_members').values({
					id: nanoid(),
					team_id: teamId,
					preceptor_id: surgeryPreceptors[i].id,
					priority: i + 1,
					role: i === 0 ? 'Lead Surgeon' : `Team Member ${i}`,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}).execute();
			}

			console.log(`  ✓ Created Surgery Teaching Team A with ${surgeryPreceptors.length} members\n`);
		}
	}

	// ========================================
	// 5. FALLBACK CHAINS
	// ========================================
	console.log('🔄 Creating fallback chains...');

	if (preceptors.length >= 5) {
		// Create a fallback chain: P1 -> P2 -> P3
		const p1 = preceptors[0];
		const p2 = preceptors[1];
		const p3 = preceptors[2];

		await db.insertInto('preceptor_fallbacks').values([
			{
				id: nanoid(),
				primary_preceptor_id: p1.id,
				fallback_preceptor_id: p2.id,
				priority: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: nanoid(),
				primary_preceptor_id: p2.id,
				fallback_preceptor_id: p3.id,
				priority: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		]).execute();

		// Create another fallback with multiple options
		const p4 = preceptors[3];
		const p5 = preceptors[4];

		await db.insertInto('preceptor_fallbacks').values([
			{
				id: nanoid(),
				primary_preceptor_id: p4.id,
				fallback_preceptor_id: p2.id,
				priority: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: nanoid(),
				primary_preceptor_id: p4.id,
				fallback_preceptor_id: p5.id,
				priority: 2,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		]).execute();

		console.log('  ✓ Created 2 fallback chains demonstrating cascading and multiple options\n');
	}

	console.log('✅ Sample configuration seeding complete!\n');
	console.log('Summary:');
	console.log('  - 2 health systems with 3 sites');
	console.log('  - Multiple clerkship requirements with different strategies');
	console.log('  - Hierarchical capacity rules (general, clerkship, type, specific)');
	console.log('  - Preceptor teams with formation rules');
	console.log('  - Fallback chains for coverage\n');
	console.log('🎓 Ready to test the configurable scheduling framework!\n');
}

// Run the seed script
seed()
	.catch((error) => {
		console.error('❌ Error seeding data:', error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
