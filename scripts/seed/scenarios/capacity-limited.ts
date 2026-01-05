/**
 * Capacity-Limited Scenario
 *
 * Tests the fix for max_students enforcement - ensures preceptors aren't double-booked.
 *
 * Setup:
 * - 1 health system with 1 site
 * - 3 preceptors with different max_students settings (1, 2, 3)
 * - 5 students needing 10 days each
 * - All preceptors available same days
 *
 * Expected behavior:
 * - Preceptor with max_students=1 should never have 2+ students on same day
 * - Preceptor with max_students=2 should never have 3+ students on same day
 * - Capacity should be respected based on preceptor.max_students column
 */

import {
	createHealthSystem,
	createSite,
	createClerkship,
	createStudent,
	createPreceptor,
	createTeam,
	createAvailability,
	generateWeekdaysInRange,
} from '../helpers';

export async function capacityLimitedScenario(userId: string, scheduleId: string): Promise<void> {
	const SCHEDULE_START = '2026-01-01';
	const SCHEDULE_END = '2026-01-30';

	// Create Health System
	console.log('  Creating health system...');
	const healthSystemId = await createHealthSystem('University Medical Center', 'Boston, MA');

	// Create Site
	console.log('  Creating site...');
	const siteId = await createSite(healthSystemId, 'UMC Main Campus', '100 University Ave, Boston');

	// Create Clerkship
	console.log('  Creating clerkship...');
	const clerkshipId = await createClerkship('Family Medicine', {
		type: 'outpatient',
		requiredDays: 10,
		specialty: 'Family Medicine',
	});

	// Create Students
	console.log('  Creating students...');
	const studentIds: string[] = [];
	const studentNames = ['Emma Davis', 'James Wilson', 'Olivia Brown', 'William Taylor', 'Sophia Anderson'];
	for (const name of studentNames) {
		const email = name.toLowerCase().replace(' ', '.') + '@medical.edu';
		const id = await createStudent(name, email);
		studentIds.push(id);
	}

	// Create Preceptors with different capacities
	console.log('  Creating preceptors...');
	const drLowCapacityId = await createPreceptor('Dr. Low Capacity', {
		healthSystemId,
		siteId,
		specialty: 'Family Medicine',
		maxStudents: 1, // Only 1 student at a time
	});

	const drMedCapacityId = await createPreceptor('Dr. Med Capacity', {
		healthSystemId,
		siteId,
		specialty: 'Family Medicine',
		maxStudents: 2, // Up to 2 students at a time
	});

	const drHighCapacityId = await createPreceptor('Dr. High Capacity', {
		healthSystemId,
		siteId,
		specialty: 'Family Medicine',
		maxStudents: 3, // Up to 3 students at a time
	});

	// Create Team with all preceptors
	console.log('  Creating team...');
	await createTeam(clerkshipId, 'Family Medicine Team', [drLowCapacityId, drMedCapacityId, drHighCapacityId]);

	// Create Availability - all preceptors available all weekdays
	console.log('  Creating availability...');
	const availableDates = generateWeekdaysInRange(SCHEDULE_START, SCHEDULE_END);

	await createAvailability(drLowCapacityId, siteId, availableDates);
	await createAvailability(drMedCapacityId, siteId, availableDates);
	await createAvailability(drHighCapacityId, siteId, availableDates);

	console.log(`    All preceptors: ${availableDates.length} days (all weekdays)`);

	// Calculate capacity
	const totalCapacity = availableDates.length * (1 + 2 + 3); // 1 + 2 + 3 = 6 students per day
	const totalDemand = studentIds.length * 10; // 5 students × 10 days = 50

	console.log(`
  Scenario Summary:
  ─────────────────────────────────────────────────────────
  Health System: University Medical Center
  Clerkship: Family Medicine (10 days required)

  Students: 5 (Emma, James, Olivia, William, Sophia)

  Preceptors (all available ${availableDates.length} weekdays):
    - Dr. Low Capacity:  max 1 student/day
    - Dr. Med Capacity:  max 2 students/day
    - Dr. High Capacity: max 3 students/day

  Total capacity: ${totalCapacity} student-days
  Total demand: ${totalDemand} student-days

  Expected: No double-booking beyond max_students limits
  ─────────────────────────────────────────────────────────
`);
}
