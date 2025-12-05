/**
 * Seed Script: Fallback Gap Filling Scenarios
 *
 * Creates test data demonstrating various fallback scenarios for manual testing.
 * Run with: tsx scripts/seed-fallback-scenarios.ts
 *
 * Scenarios:
 * 1. Happy Path - Single team with full coverage
 * 2. Same Team Gap Filling - Team members combine for coverage
 * 3. Cross-Team Same System - Different teams in same health system
 * 4. Cross-System Enabled - Teams from different health systems
 * 5. Capacity Limits - Respecting daily/yearly limits
 */

import { db } from '../src/lib/db';
import { nanoid } from 'nanoid';

// Helper to generate date strings
function generateDates(startDate: string, count: number): string[] {
	const dates: string[] = [];
	const start = new Date(startDate + 'T00:00:00.000Z');
	for (let i = 0; i < count; i++) {
		const date = new Date(start);
		date.setUTCDate(start.getUTCDate() + i);
		dates.push(date.toISOString().split('T')[0]);
	}
	return dates;
}

async function seed() {
	console.log('🌱 Seeding fallback scenario test data...\n');

	// ========================================
	// HEALTH SYSTEMS & SITES
	// ========================================
	console.log('📍 Creating health systems and sites...');

	const uniMedId = nanoid();
	const communityHealthId = nanoid();

	await db.insertInto('health_systems').values([
		{
			id: uniMedId,
			name: 'University Medical Center',
			description: 'Academic medical center for fallback testing',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: communityHealthId,
			name: 'Community Health Network',
			description: 'Community healthcare for cross-system testing',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	const mainCampusSiteId = nanoid();
	const downtownSiteId = nanoid();
	const communitySiteId = nanoid();

	await db.insertInto('sites').values([
		{
			id: mainCampusSiteId,
			name: 'Main Campus',
			health_system_id: uniMedId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: downtownSiteId,
			name: 'Downtown Clinic',
			health_system_id: uniMedId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: communitySiteId,
			name: 'Community Care Center',
			health_system_id: communityHealthId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	console.log('  ✓ Created 2 health systems and 3 sites\n');

	// ========================================
	// TEST CLERKSHIP
	// ========================================
	console.log('📋 Creating test clerkship...');

	const fallbackTestClerkshipId = nanoid();
	await db.insertInto('clerkships').values({
		id: fallbackTestClerkshipId,
		name: 'Fallback Test Clerkship',
		clerkship_type: 'outpatient',
		required_days: 5,
		description: 'Clerkship for testing fallback gap filling',
	}).execute();

	// Create requirement
	const requirementId = nanoid();
	await db.insertInto('clerkship_requirements').values({
		id: requirementId,
		clerkship_id: fallbackTestClerkshipId,
		requirement_type: 'outpatient',
		required_days: 5,
		override_mode: 'inherit',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	console.log('  ✓ Created "Fallback Test Clerkship" with 5-day requirement\n');

	// ========================================
	// PRECEPTORS
	// ========================================
	console.log('👨‍⚕️ Creating preceptors...');

	// Team A - University Medical Center (Main Campus)
	const drAmandaId = nanoid();
	const drJamesId = nanoid();

	// Team B - University Medical Center (Downtown)
	const drSarahId = nanoid();

	// Team C - Community Health Network
	const drMichaelId = nanoid();

	const preceptors = [
		{ id: drAmandaId, name: 'Dr. Amanda Chen', email: 'amanda.chen@unimedical.edu', healthSystemId: uniMedId },
		{ id: drJamesId, name: 'Dr. James Wilson', email: 'james.wilson@unimedical.edu', healthSystemId: uniMedId },
		{ id: drSarahId, name: 'Dr. Sarah Johnson', email: 'sarah.johnson@unimedical.edu', healthSystemId: uniMedId },
		{ id: drMichaelId, name: 'Dr. Michael Brown', email: 'michael.brown@communityhealth.org', healthSystemId: communityHealthId },
	];

	for (const p of preceptors) {
		await db.insertInto('preceptors').values({
			id: p.id,
			name: p.name,
			email: p.email,
			health_system_id: p.healthSystemId,
			max_students: 2,
		}).execute();

		// Create site association
		const siteId = p.healthSystemId === uniMedId
			? (p.id === drSarahId ? downtownSiteId : mainCampusSiteId)
			: communitySiteId;
		await db.insertInto('preceptor_sites').values({
			preceptor_id: p.id,
			site_id: siteId,
		}).execute();
	}

	console.log('  ✓ Created 4 preceptors across 2 health systems\n');

	// ========================================
	// TEAMS
	// ========================================
	console.log('👥 Creating preceptor teams...');

	// Team A: Dr. Amanda (lead) + Dr. James - Main Campus, same health system
	const teamAId = nanoid();
	await db.insertInto('preceptor_teams').values({
		id: teamAId,
		clerkship_id: fallbackTestClerkshipId,
		name: 'Team A - Main Campus',
		description: 'Primary teaching team at Main Campus',
		require_same_health_system: 1,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	await db.insertInto('preceptor_team_members').values([
		{
			id: nanoid(),
			team_id: teamAId,
			preceptor_id: drAmandaId,
			priority: 1,
			role: 'lead',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: nanoid(),
			team_id: teamAId,
			preceptor_id: drJamesId,
			priority: 2,
			role: 'member',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	// Team B: Dr. Sarah - Downtown, same health system
	const teamBId = nanoid();
	await db.insertInto('preceptor_teams').values({
		id: teamBId,
		clerkship_id: fallbackTestClerkshipId,
		name: 'Team B - Downtown',
		description: 'Teaching team at Downtown Clinic',
		require_same_health_system: 1,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	await db.insertInto('preceptor_team_members').values({
		id: nanoid(),
		team_id: teamBId,
		preceptor_id: drSarahId,
		priority: 1,
		role: 'lead',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	// Team C: Dr. Michael - Community Health (different health system)
	const teamCId = nanoid();
	await db.insertInto('preceptor_teams').values({
		id: teamCId,
		clerkship_id: fallbackTestClerkshipId,
		name: 'Team C - Community',
		description: 'Teaching team at Community Health',
		require_same_health_system: 0, // Can work with other health systems
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	await db.insertInto('preceptor_team_members').values({
		id: nanoid(),
		team_id: teamCId,
		preceptor_id: drMichaelId,
		priority: 1,
		role: 'lead',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	}).execute();

	console.log('  ✓ Created 3 teams:\n');
	console.log('    - Team A (Main Campus): Dr. Amanda (lead) + Dr. James');
	console.log('    - Team B (Downtown): Dr. Sarah');
	console.log('    - Team C (Community): Dr. Michael\n');

	// ========================================
	// AVAILABILITY PATTERNS
	// ========================================
	console.log('📅 Creating availability patterns for December 2025...');

	// December 2025 dates
	const dec2025Dates = generateDates('2025-12-01', 31);

	// Dr. Amanda: Mon/Wed/Fri only (Dec 1, 3, 5, 8, 10, 12...)
	const amandaDates = dec2025Dates.filter(d => {
		const dayOfWeek = new Date(d).getUTCDay();
		return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5; // Mon, Wed, Fri
	});

	// Dr. James: Only available Dec 12
	const jamesDates = ['2025-12-12'];

	// Dr. Sarah: Tue/Thu only (Dec 2, 4, 9, 11...)
	const sarahDates = dec2025Dates.filter(d => {
		const dayOfWeek = new Date(d).getUTCDay();
		return dayOfWeek === 2 || dayOfWeek === 4; // Tue, Thu
	});

	// Dr. Michael: Full week availability (Dec 1-5)
	const michaelDates = generateDates('2025-12-01', 5);

	// Insert availability
	for (const date of amandaDates) {
		await db.insertInto('preceptor_availability').values({
			id: nanoid(),
			preceptor_id: drAmandaId,
			site_id: mainCampusSiteId,
			date,
			is_available: 1,
			created_at: new Date().toISOString(),
		}).execute();
	}

	for (const date of jamesDates) {
		await db.insertInto('preceptor_availability').values({
			id: nanoid(),
			preceptor_id: drJamesId,
			site_id: mainCampusSiteId,
			date,
			is_available: 1,
			created_at: new Date().toISOString(),
		}).execute();
	}

	for (const date of sarahDates) {
		await db.insertInto('preceptor_availability').values({
			id: nanoid(),
			preceptor_id: drSarahId,
			site_id: downtownSiteId,
			date,
			is_available: 1,
			created_at: new Date().toISOString(),
		}).execute();
	}

	for (const date of michaelDates) {
		await db.insertInto('preceptor_availability').values({
			id: nanoid(),
			preceptor_id: drMichaelId,
			site_id: communitySiteId,
			date,
			is_available: 1,
			created_at: new Date().toISOString(),
		}).execute();
	}

	console.log('  ✓ Dr. Amanda: Mon/Wed/Fri (13 days in December)');
	console.log('  ✓ Dr. James: Dec 12 only (1 day)');
	console.log('  ✓ Dr. Sarah: Tue/Thu (9 days in December)');
	console.log('  ✓ Dr. Michael: Dec 1-5 (5 consecutive days)\n');

	// ========================================
	// TEST STUDENTS
	// ========================================
	console.log('🎓 Creating test students...');

	const students = [
		{ name: 'Alice Student', email: 'alice.student@medschool.edu' },
		{ name: 'Bob Student', email: 'bob.student@medschool.edu' },
		{ name: 'Carol Student', email: 'carol.student@medschool.edu' },
	];

	const studentIds: string[] = [];
	for (const s of students) {
		const id = nanoid();
		await db.insertInto('students').values({
			id,
			name: s.name,
			email: s.email,
		}).execute();
		studentIds.push(id);
	}

	console.log(`  ✓ Created ${students.length} test students\n`);

	// ========================================
	// CAPACITY RULES
	// ========================================
	console.log('🎯 Creating capacity rules...');

	await db.insertInto('preceptor_capacity_rules').values([
		{
			id: nanoid(),
			preceptor_id: drAmandaId,
			max_students_per_day: 1,
			max_students_per_year: 20,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: nanoid(),
			preceptor_id: drJamesId,
			max_students_per_day: 1,
			max_students_per_year: 20,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: nanoid(),
			preceptor_id: drSarahId,
			max_students_per_day: 2,
			max_students_per_year: 30,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: nanoid(),
			preceptor_id: drMichaelId,
			max_students_per_day: 2,
			max_students_per_year: 30,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	]).execute();

	console.log('  ✓ Created capacity rules:\n');
	console.log('    - Dr. Amanda: 1/day, 20/year');
	console.log('    - Dr. James: 1/day, 20/year');
	console.log('    - Dr. Sarah: 2/day, 30/year');
	console.log('    - Dr. Michael: 2/day, 30/year\n');

	// ========================================
	// SUMMARY
	// ========================================
	console.log('═══════════════════════════════════════════════════════════════\n');
	console.log('✅ Fallback scenario test data seeding complete!\n');
	console.log('📊 Test Scenarios:\n');

	console.log('SCENARIO 1: Same Team Gap Filling');
	console.log('  - Schedule Alice for Dec 1-5');
	console.log('  - Team A: Amanda (Mon/Wed/Fri) + James (Dec 12 only)');
	console.log('  - Expected: Amanda covers Dec 1, 3, 5 (3 days)');
	console.log('  - Fallback needed for Dec 2, 4 (2 days)\n');

	console.log('SCENARIO 2: Cross-Team Same Health System');
	console.log('  - Team B (Dr. Sarah) has Tue/Thu availability');
	console.log('  - Can fill Dec 2, 4 from Team A gaps');
	console.log('  - Expected: Alice gets full 5 days (Amanda + Sarah)\n');

	console.log('SCENARIO 3: Cross-System Fallback');
	console.log('  - Team C (Dr. Michael) is in Community Health');
	console.log('  - If allow_cross_system=true, can use Michael');
	console.log('  - Michael has Dec 1-5 full coverage\n');

	console.log('SCENARIO 4: Multiple Students + Capacity');
	console.log('  - Schedule all 3 students');
	console.log('  - Capacity limits: Amanda/James 1/day, Sarah/Michael 2/day');
	console.log('  - Expected: Some students partially fulfilled\n');

	console.log('🧪 To test, run the scheduler with:');
	console.log('   - Student IDs: ' + studentIds.join(', '));
	console.log('   - Clerkship ID: ' + fallbackTestClerkshipId);
	console.log('   - Date range: 2025-12-01 to 2025-12-31\n');

	console.log('🔧 Config options to test:');
	console.log('   - enableFallbacks: true/false');
	console.log('   - Update global_outpatient_defaults.allow_fallbacks');
	console.log('   - Update global_outpatient_defaults.fallback_allow_cross_system\n');
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
