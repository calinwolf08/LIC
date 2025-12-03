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
			required_days: 20,
			description: 'Core family medicine rotation covering primary care',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Internal Medicine',
			specialty: 'Internal Medicine',
			clerkship_type: 'inpatient',
			required_days: 30,
			description: 'Inpatient internal medicine rotation',
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Pediatrics',
			specialty: 'Pediatrics',
			clerkship_type: 'outpatient',
			required_days: 20,
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

	// Create Preceptors (site associations handled via preceptor_sites junction table)
	const preceptors = [
		{
			id: nanoid(),
			name: 'Dr. Amanda Smith',
			email: 'asmith@metrogeneral.com',
			phone: '555-1001',
			health_system_id: healthSystem1.id,
			max_students: 2,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Dr. James Brown',
			email: 'jbrown@metrofamily.com',
			phone: '555-1002',
			health_system_id: healthSystem1.id,
			max_students: 2,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Dr. Lisa Garcia',
			email: 'lgarcia@communityhosp.com',
			phone: '555-1003',
			health_system_id: healthSystem2.id,
			max_students: 3,
			created_at: timestamp,
			updated_at: timestamp
		},
		{
			id: nanoid(),
			name: 'Dr. Thomas Lee',
			email: 'tlee@suburbanpc.com',
			phone: '555-1004',
			health_system_id: healthSystem2.id,
			max_students: 2,
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
		{ preceptor_id: preceptors[2].id, site_id: sites[2].id, created_at: timestamp },
		{ preceptor_id: preceptors[3].id, site_id: sites[3].id, created_at: timestamp },
		// Some preceptors work at multiple sites within same health system
		{ preceptor_id: preceptors[0].id, site_id: sites[1].id, created_at: timestamp },
		{ preceptor_id: preceptors[2].id, site_id: sites[3].id, created_at: timestamp }
	];

	await db
		.insertInto('preceptor_sites')
		.values(preceptorSites)
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
	console.log(`   - 3 Clerkships`);
	console.log(`   - 4 Preceptors`);
	console.log(`   - 5 Students`);
	console.log(`   - 1 Team with 2 members`);
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
