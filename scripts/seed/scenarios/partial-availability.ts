/**
 * Partial Availability Scenario
 *
 * Tests partial scheduling - when preceptors have gaps in availability.
 *
 * Setup:
 * - 1 health system with 1 site
 * - 3 preceptors with non-overlapping availability windows
 * - 3 students needing 15 days each
 * - Preceptors available different weeks (no single preceptor covers full requirement)
 *
 * Expected behavior:
 * - Partial assignments should be made (even if requirement can't be fully met)
 * - Students should get assignments from multiple preceptors to maximize days
 * - Unmet requirements should be reported with correct remaining days
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

export async function partialAvailabilityScenario(userId: string, scheduleId: string): Promise<void> {
	const SCHEDULE_START = '2026-01-01';
	const SCHEDULE_END = '2026-01-30';

	// Create Health System
	console.log('  Creating health system...');
	const healthSystemId = await createHealthSystem('Community Health Center', 'Austin, TX');

	// Create Site
	console.log('  Creating site...');
	const siteId = await createSite(healthSystemId, 'Austin Community Clinic', '500 Community Way, Austin');

	// Create Clerkship
	console.log('  Creating clerkship...');
	const clerkshipId = await createClerkship('Psychiatry', {
		type: 'outpatient',
		requiredDays: 15,
		specialty: 'Psychiatry',
	});

	// Create Students
	console.log('  Creating students...');
	const student1Id = await createStudent('Alex Rivera', 'alex.rivera@medical.edu');
	const student2Id = await createStudent('Jordan Lee', 'jordan.lee@medical.edu');
	const student3Id = await createStudent('Casey Morgan', 'casey.morgan@medical.edu');

	// Create Preceptors with non-overlapping availability
	console.log('  Creating preceptors...');

	// Dr. Week One - only available week 1
	const drWeekOneId = await createPreceptor('Dr. Week One', {
		healthSystemId,
		siteId,
		specialty: 'Psychiatry',
		maxStudents: 2,
	});

	// Dr. Week Two - only available week 2
	const drWeekTwoId = await createPreceptor('Dr. Week Two', {
		healthSystemId,
		siteId,
		specialty: 'Psychiatry',
		maxStudents: 2,
	});

	// Dr. Scattered - available Mon/Wed only across all weeks
	const drScatteredId = await createPreceptor('Dr. Scattered', {
		healthSystemId,
		siteId,
		specialty: 'Psychiatry',
		maxStudents: 1,
	});

	// Create Team
	console.log('  Creating team...');
	await createTeam(clerkshipId, 'Psychiatry Team', [drWeekOneId, drWeekTwoId, drScatteredId]);

	// Create Availability with gaps
	console.log('  Creating availability...');

	// Dr. Week One: Jan 5-9 (first full week)
	const weekOneDates = generateWeekdaysInRange('2026-01-05', '2026-01-09');
	await createAvailability(drWeekOneId, siteId, weekOneDates);
	console.log(`    Dr. Week One: ${weekOneDates.length} days (Jan 5-9)`);

	// Dr. Week Two: Jan 12-16 (second full week)
	const weekTwoDates = generateWeekdaysInRange('2026-01-12', '2026-01-16');
	await createAvailability(drWeekTwoId, siteId, weekTwoDates);
	console.log(`    Dr. Week Two: ${weekTwoDates.length} days (Jan 12-16)`);

	// Dr. Scattered: Mon/Wed only for weeks 3-4
	const scatteredDates: string[] = [];
	const week3Start = new Date('2026-01-19T00:00:00.000Z');
	const week4End = new Date('2026-01-30T00:00:00.000Z');

	const current = new Date(week3Start);
	while (current <= week4End) {
		const dayOfWeek = current.getUTCDay();
		if (dayOfWeek === 1 || dayOfWeek === 3) {
			// Monday or Wednesday
			scatteredDates.push(current.toISOString().split('T')[0]);
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}
	await createAvailability(drScatteredId, siteId, scatteredDates);
	console.log(`    Dr. Scattered: ${scatteredDates.length} days (Mon/Wed in weeks 3-4)`);

	// Calculate capacity
	const totalCapacity =
		weekOneDates.length * 2 + // Dr. Week One: 5 days × 2 students
		weekTwoDates.length * 2 + // Dr. Week Two: 5 days × 2 students
		scatteredDates.length * 1; // Dr. Scattered: 4 days × 1 student

	const totalDemand = 3 * 15; // 3 students × 15 days

	console.log(`
  Scenario Summary:
  ─────────────────────────────────────────────────────────
  Health System: Community Health Center
  Clerkship: Psychiatry (15 days required)

  Students: 3 (Alex, Jordan, Casey)

  Preceptors (NON-OVERLAPPING availability):
    - Dr. Week One: Jan 5-9 only (${weekOneDates.length} days), max 2 students/day
    - Dr. Week Two: Jan 12-16 only (${weekTwoDates.length} days), max 2 students/day
    - Dr. Scattered: Mon/Wed weeks 3-4 (${scatteredDates.length} days), max 1 student/day

  Availability gaps: Week 3 Tue/Thu/Fri, Week 4 Tue/Thu/Fri

  Total capacity: ${totalCapacity} student-days
  Total demand: ${totalDemand} student-days

  Expected: Partial assignments made, unmet requirements reported
  ─────────────────────────────────────────────────────────
`);
}
