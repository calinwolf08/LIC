#!/usr/bin/env tsx

/**
 * Database Seed Script
 *
 * Populates the database with test data after migrations.
 * Run with: npm run db:seed
 *
 * This creates:
 * - 2 Health Systems
 * - 4 Sites (2 per health system)
 * - 3 Clerkships (Family Medicine, Internal Medicine, Pediatrics)
 * - 4 Preceptors (1-2 per site)
 * - 5 Students
 */

import { createDB } from '../connection';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '../types';

async function seed(db: Kysely<DB>) {
	const timestamp = new Date().toISOString();

	console.log('Creating health systems...');

	// Create Health Systems
	const healthSystem1 = {
		id: nanoid(),
		name: 'Metro Health Network',
		location: 'Downtown Metro Area',
		description: 'Large urban health network with multiple specialties',
		created_at: timestamp,
		updated_at: timestamp
	};

	const healthSystem2 = {
		id: nanoid(),
		name: 'Community Care Partners',
		location: 'Suburban Region',
		description: 'Community-focused healthcare system',
		created_at: timestamp,
		updated_at: timestamp
	};

	await db
		.insertInto('health_systems')
		.values([healthSystem1, healthSystem2])
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating sites...');

	// Create Sites
	const sites = [
		{
			id: nanoid(),
			name: 'Metro General Hospital',
			health_system_id: healthSystem1.id,
			address: '123 Main Street, Metro City',
			contact_person: 'Sarah Johnson',
			contact_email: 'sjohnson@metrogeneral.com',
			office_phone: '555-0100',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Metro Family Clinic',
			health_system_id: healthSystem1.id,
			address: '456 Oak Avenue, Metro City',
			contact_person: 'Michael Chen',
			contact_email: 'mchen@metrofamily.com',
			office_phone: '555-0101',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Community Hospital',
			health_system_id: healthSystem2.id,
			address: '789 Elm Road, Suburbia',
			contact_person: 'Emily Davis',
			contact_email: 'edavis@communityhosp.com',
			office_phone: '555-0200',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Suburban Primary Care',
			health_system_id: healthSystem2.id,
			address: '321 Pine Street, Suburbia',
			contact_person: 'Robert Wilson',
			contact_email: 'rwilson@suburbanpc.com',
			office_phone: '555-0201',
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('sites')
		.values(sites)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating clerkships...');

	// Create Clerkships
	const clerkships = [
		{
			id: nanoid(),
			name: 'Family Medicine',
			specialty: 'Family Medicine',
			clerkship_type: 'outpatient',
			required_days: 5,
			description: 'Core family medicine rotation covering primary care',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Internal Medicine',
			specialty: 'Internal Medicine',
			clerkship_type: 'inpatient',
			required_days: 5,
			description: 'Inpatient internal medicine rotation',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Pediatrics',
			specialty: 'Pediatrics',
			clerkship_type: 'outpatient',
			required_days: 5,
			description: 'Pediatric care rotation',
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('clerkships')
		.values(clerkships)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Linking clerkships to sites...');

	// Link clerkships to sites
	const clerkshipSites = [
		// Family Medicine at all sites
		{ clerkship_id: clerkships[0].id, site_id: sites[0].id, created_at: timestamp },
		{ clerkship_id: clerkships[0].id, site_id: sites[1].id, created_at: timestamp },
		{ clerkship_id: clerkships[0].id, site_id: sites[2].id, created_at: timestamp },
		{ clerkship_id: clerkships[0].id, site_id: sites[3].id, created_at: timestamp },
		// Internal Medicine at hospitals only
		{ clerkship_id: clerkships[1].id, site_id: sites[0].id, created_at: timestamp },
		{ clerkship_id: clerkships[1].id, site_id: sites[2].id, created_at: timestamp },
		// Pediatrics at selected sites
		{ clerkship_id: clerkships[2].id, site_id: sites[1].id, created_at: timestamp },
		{ clerkship_id: clerkships[2].id, site_id: sites[2].id, created_at: timestamp },
		{ clerkship_id: clerkships[2].id, site_id: sites[3].id, created_at: timestamp }
	];

	await db
		.insertInto('clerkship_sites')
		.values(clerkshipSites)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating preceptors...');

	// Create Preceptors (2 preceptors with max 1 student each)
	const preceptors = [
		{
			id: nanoid(),
			name: 'Dr. Amanda Smith',
			email: 'asmith@metrogeneral.com',
			phone: '555-1001',
			health_system_id: healthSystem1.id,
			max_students: 1,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Dr. James Brown',
			email: 'jbrown@metrofamily.com',
			phone: '555-1002',
			health_system_id: healthSystem1.id,
			max_students: 1,
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('preceptors')
		.values(preceptors)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Linking preceptors to sites...');

	// Link preceptors to sites (via junction table)
	const preceptorSites = [
		{ preceptor_id: preceptors[0].id, site_id: sites[0].id, created_at: timestamp },
		{ preceptor_id: preceptors[1].id, site_id: sites[1].id, created_at: timestamp },
		// Both preceptors can work at both Metro sites
		{ preceptor_id: preceptors[0].id, site_id: sites[1].id, created_at: timestamp },
		{ preceptor_id: preceptors[1].id, site_id: sites[0].id, created_at: timestamp }
	];

	await db
		.insertInto('preceptor_sites')
		.values(preceptorSites)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating preceptor availability patterns...');

	// Helper function to get Mon-Wed-Fri dates in December 2025
	function getMonWedFriDates(year: number, month: number): string[] {
		const dates: string[] = [];
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			const dayOfWeek = date.getDay();
			// Monday = 1, Wednesday = 3, Friday = 5
			if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
				const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
				dates.push(dateStr);
			}
		}
		return dates;
	}

	// Amanda: Mon-Wed-Fri from 12/1 - 12/31/2025
	const amandaDates = getMonWedFriDates(2025, 11); // month is 0-indexed, so 11 = December

	// James: Only 12/12/2025
	const jamesDates = ['2025-12-12'];

	// Create availability patterns (visible in UI)
	const availabilityPatterns = [
		{
			id: nanoid(),
			preceptor_id: preceptors[0].id,
			site_id: sites[0].id,
			pattern_type: 'weekly',
			is_available: 1,
			specificity: 1,
			date_range_start: '2025-12-01',
			date_range_end: '2025-12-31',
			config: JSON.stringify({ days_of_week: [1, 3, 5] }), // Mon, Wed, Fri
			reason: null,
			enabled: 1,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			preceptor_id: preceptors[1].id,
			site_id: sites[1].id,
			pattern_type: 'block',
			is_available: 1,
			specificity: 1,
			date_range_start: '2025-12-12',
			date_range_end: '2025-12-12',
			config: JSON.stringify({}),
			reason: null,
			enabled: 1,
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('preceptor_availability_patterns')
		.values(availabilityPatterns)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Generating preceptor availability dates from patterns...');

	// Generate availability dates (used by scheduling engine)
	const availabilityRecords: Array<{
		id: string;
		preceptor_id: string;
		site_id: string;
		date: string;
		is_available: number;
		created_at: string;
		updated_at: string;
	}> = [];

	// Amanda: Mon-Wed-Fri in December 2025
	for (const dateStr of amandaDates) {
		availabilityRecords.push({
			id: nanoid(),
			preceptor_id: preceptors[0].id,
			site_id: sites[0].id,
			date: dateStr,
			is_available: 1,
			created_at: timestamp,
			updated_at: timestamp
		});
	}

	// James: Only 12/12/2025
	for (const dateStr of jamesDates) {
		availabilityRecords.push({
			id: nanoid(),
			preceptor_id: preceptors[1].id,
			site_id: sites[1].id,
			date: dateStr,
			is_available: 1,
			created_at: timestamp,
			updated_at: timestamp
		});
	}

	console.log(`   Amanda (Dr. Smith) available on ${amandaDates.length} Mon-Wed-Fri dates`);
	console.log(`   James (Dr. Brown) available on ${jamesDates.length} date (12/12 only)`);

	await db
		.insertInto('preceptor_availability')
		.values(availabilityRecords)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating clerkship requirements...');

	// Create clerkship requirements for the scheduling engine
	// NOTE: Only Family Medicine has a team, so only it should get scheduled
	const clerkshipRequirements = [
		{
			id: nanoid(),
			clerkship_id: clerkships[0].id,
			requirement_type: 'outpatient',
			required_days: 5,
			override_mode: 'override_section',
			override_assignment_strategy: 'team_continuity',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			clerkship_id: clerkships[1].id,
			requirement_type: 'inpatient',
			required_days: 5,
			override_mode: 'override_section',
			override_assignment_strategy: 'team_continuity',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			clerkship_id: clerkships[2].id,
			requirement_type: 'outpatient',
			required_days: 5,
			override_mode: 'override_section',
			override_assignment_strategy: 'team_continuity',
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('clerkship_requirements')
		.values(clerkshipRequirements)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating preceptor capacity rules...');

	// Create capacity rules for each preceptor (max 1 student per day)
	const capacityRules = [
		{
			id: nanoid(),
			preceptor_id: preceptors[0].id,
			max_students_per_day: 1,
			max_students_per_year: 10,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			preceptor_id: preceptors[1].id,
			max_students_per_day: 1,
			max_students_per_year: 10,
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('preceptor_capacity_rules')
		.values(capacityRules)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating students...');

	// Create Students
	const students = [
		{
			id: nanoid(),
			name: 'Alice Johnson',
			email: 'ajohnson@medschool.edu',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Bob Williams',
			email: 'bwilliams@medschool.edu',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Carol Martinez',
			email: 'cmartinez@medschool.edu',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'David Kim',
			email: 'dkim@medschool.edu',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Emma Thompson',
			email: 'ethompson@medschool.edu',
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('students')
		.values(students)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating student onboarding records...');

	// Create Student Health System Onboarding (some completed)
	const studentOnboarding = [
		// Alice completed onboarding at Metro Health
		{
			id: nanoid(),
			student_id: students[0].id,
			health_system_id: healthSystem1.id,
			is_completed: 1,
			completed_date: timestamp,
			notes: 'Completed all required training',
			created_at: timestamp,
			updated_at: timestamp
		},
		// Bob completed onboarding at both
		{
			id: nanoid(),
			student_id: students[1].id,
			health_system_id: healthSystem1.id,
			is_completed: 1,
			completed_date: timestamp,
			notes: null,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			student_id: students[1].id,
			health_system_id: healthSystem2.id,
			is_completed: 1,
			completed_date: timestamp,
			notes: null,
			created_at: timestamp,
			updated_at: timestamp
		},
		// Carol completed at Community Care
		{
			id: nanoid(),
			student_id: students[2].id,
			health_system_id: healthSystem2.id,
			is_completed: 1,
			completed_date: timestamp,
			notes: null,
			created_at: timestamp,
			updated_at: timestamp
		}
	];

	await db
		.insertInto('student_health_system_onboarding')
		.values(studentOnboarding)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('Creating a sample team...');

	// Create a sample preceptor team
	const team = {
		id: nanoid(),
		name: 'Family Medicine Team A',
		clerkship_id: clerkships[0].id,
		require_same_health_system: 1,
		require_same_site: 0,
		require_same_specialty: 1,
		requires_admin_approval: 0,
		created_at: timestamp,
		updated_at: timestamp
	};

	await db
		.insertInto('preceptor_teams')
		.values(team)
		.onConflict((oc) => oc.doNothing())
		.execute();

	// Add team members
	const teamMembers = [
		{
			id: nanoid(),
			team_id: team.id,
			preceptor_id: preceptors[0].id,
			role: 'lead',
			priority: 1,
			created_at: timestamp
		},
		{
			id: nanoid(),
			team_id: team.id,
			preceptor_id: preceptors[1].id,
			role: 'member',
			priority: 2,
			created_at: timestamp
		}
	];

	await db
		.insertInto('preceptor_team_members')
		.values(teamMembers)
		.onConflict((oc) => oc.doNothing())
		.execute();

	// Link team to sites
	const teamSites = [
		{ team_id: team.id, site_id: sites[0].id, created_at: timestamp },
		{ team_id: team.id, site_id: sites[1].id, created_at: timestamp }
	];

	await db
		.insertInto('team_sites')
		.values(teamSites)
		.onConflict((oc) => oc.doNothing())
		.execute();

	console.log('\n✅ Seed data created successfully!');
	console.log(`   - 2 Health Systems`);
	console.log(`   - 4 Sites`);
	console.log(`   - 3 Clerkships (5 days each)`);
	console.log(`   - 3 Clerkship Requirements (team_continuity strategy)`);
	console.log(`   - 2 Preceptors (max 1 student each)`);
	console.log(`   - 2 Capacity Rules (max 1 student/day)`);
	console.log(`   - 5 Students`);
	console.log(`   - 1 Team (Family Medicine) with 2 members`);
	console.log(`   - Amanda available Mon-Wed-Fri December 2025 (${amandaDates.length} days)`);
	console.log(`   - James available only 12/12/2025 (1 day)`);
}

async function main() {
	console.log('🌱 Running database seed script...\n');

	const db = createDB();

	try {
		await seed(db);
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Seed failed:', error);
	process.exit(1);
});
