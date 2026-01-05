/**
 * Multi-Team Scenario
 *
 * Tests the fix for team aggregation - ensures all teams are used, not just the first one.
 *
 * Setup:
 * - 2 health systems with different sites
 * - 2 preceptors on separate teams
 * - 3 students needing 20 days each
 * - Dr Dude: Mon/Wed/Fri availability (12 days), max 1 student/day
 * - Dr S: Block availability 1/5-1/16 weekdays (10 days), max 1 student/day
 * - 2 electives (5 + 8 days) assigned to Dr S
 *
 * Expected behavior:
 * - Both teams should be used
 * - No double-booking (max 1 student per preceptor per day)
 * - All 22 available slots should be filled
 * - Elective assignments should have elective_id set
 */

import {
	createHealthSystem,
	createSite,
	createClerkship,
	createElective,
	createStudent,
	createPreceptor,
	createTeam,
	createAvailability,
	linkElectivePreceptor,
	generateSpecificWeekdays,
	generateWeekdaysInRange,
} from '../helpers';

export async function multiTeamScenario(userId: string, scheduleId: string): Promise<void> {
	// Schedule dates (matches the user's active schedule period)
	const SCHEDULE_START = '2026-01-01';
	const SCHEDULE_END = '2026-01-30';

	// Create Health Systems
	console.log('  Creating health systems...');
	const groupHealthId = await createHealthSystem('Group Health Seattle', 'Seattle, WA');
	const cityHospitalId = await createHealthSystem('City Hospital Kaiser', 'Portland, OR');

	// Create Sites
	console.log('  Creating sites...');
	const groupHealthSiteId = await createSite(groupHealthId, 'Group Health Main Clinic', '123 Health St, Seattle');
	const cityHospitalSiteId = await createSite(cityHospitalId, 'City Hospital Downtown', '456 Medical Ave, Portland');

	// Create Clerkship
	console.log('  Creating clerkship...');
	const clerkshipId = await createClerkship('Internal Medicine', {
		type: 'outpatient',
		requiredDays: 20,
		specialty: 'Internal Medicine',
	});

	// Create Electives
	console.log('  Creating electives...');
	const elective1Id = await createElective(clerkshipId, 'Cardiology Elective', {
		minimumDays: 5,
		isRequired: true,
	});

	const elective2Id = await createElective(clerkshipId, 'Pulmonology Elective', {
		minimumDays: 8,
		isRequired: true,
	});

	// Create Students
	console.log('  Creating students...');
	const student1Id = await createStudent('Alice Johnson', 'alice.johnson@medical.edu');
	const student2Id = await createStudent('Bob Smith', 'bob.smith@medical.edu');
	const student3Id = await createStudent('Carol Williams', 'carol.williams@medical.edu');

	// Create Preceptors
	console.log('  Creating preceptors...');
	const drDudeId = await createPreceptor('Dr. Dude', {
		healthSystemId: groupHealthId,
		siteId: groupHealthSiteId,
		specialty: 'Internal Medicine',
		maxStudents: 1,
	});

	const drSId = await createPreceptor('Dr. S', {
		healthSystemId: cityHospitalId,
		siteId: cityHospitalSiteId,
		specialty: 'Internal Medicine',
		maxStudents: 1,
	});

	// Create Teams (separate teams for each preceptor)
	console.log('  Creating teams...');
	await createTeam(clerkshipId, 'Dr. Dude - Group Health Seattle', [drDudeId]);
	await createTeam(clerkshipId, 'Dr. S - City Hospital Kaiser', [drSId]);

	// Create Availability
	console.log('  Creating availability...');

	// Dr Dude: Mon/Wed/Fri (days 1, 3, 5 of the week)
	const drDudeDates = generateSpecificWeekdays(SCHEDULE_START, SCHEDULE_END, [1, 3, 5]); // Mon, Wed, Fri
	await createAvailability(drDudeId, groupHealthSiteId, drDudeDates);
	console.log(`    Dr. Dude: ${drDudeDates.length} days (Mon/Wed/Fri)`);

	// Dr S: Block availability 1/5-1/16 (weekdays only)
	const drSDates = generateWeekdaysInRange('2026-01-05', '2026-01-16');
	await createAvailability(drSId, cityHospitalSiteId, drSDates);
	console.log(`    Dr. S: ${drSDates.length} days (1/5-1/16 weekdays)`);

	// Link electives to Dr S
	console.log('  Linking electives to preceptors...');
	await linkElectivePreceptor(elective1Id, drSId);
	await linkElectivePreceptor(elective2Id, drSId);

	console.log(`
  Scenario Summary:
  ─────────────────────────────────────────────────────────
  Health Systems: Group Health Seattle, City Hospital Kaiser
  Clerkship: Internal Medicine (20 days required)
  Electives: Cardiology (5 days), Pulmonology (8 days)

  Students: 3 (Alice, Bob, Carol)

  Preceptors:
    - Dr. Dude (Group Health): Mon/Wed/Fri, max 1 student/day
      Available days: ${drDudeDates.length}
    - Dr. S (City Hospital): 1/5-1/16 weekdays, max 1 student/day
      Available days: ${drSDates.length}
      Handles: Cardiology, Pulmonology electives

  Total capacity: ${drDudeDates.length + drSDates.length} student-days
  Total demand: 60 student-days (3 students × 20 days)

  Expected: Both teams used, no double-booking, partial completion
  ─────────────────────────────────────────────────────────
`);
}
