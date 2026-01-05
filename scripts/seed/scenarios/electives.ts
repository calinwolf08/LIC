/**
 * Electives Scenario
 *
 * Tests elective scheduling with multiple electives per clerkship.
 *
 * Setup:
 * - 1 health system with 2 sites (general clinic + specialty center)
 * - 1 clerkship with 3 electives (different day requirements)
 * - 4 preceptors: 2 general, 2 specialists (handle electives)
 * - 4 students needing 15 days each
 *
 * Expected behavior:
 * - Elective days should be scheduled with correct elective_id
 * - Specialist preceptors should only get elective assignments
 * - General preceptors handle non-elective days
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
	generateWeekdaysInRange,
} from '../helpers';

export async function electivesScenario(userId: string, scheduleId: string): Promise<void> {
	const SCHEDULE_START = '2026-01-01';
	const SCHEDULE_END = '2026-01-30';

	// Create Health System
	console.log('  Creating health system...');
	const healthSystemId = await createHealthSystem('Regional Medical Network', 'Denver, CO');

	// Create Sites
	console.log('  Creating sites...');
	const generalClinicId = await createSite(healthSystemId, 'General Medicine Clinic', '200 Main St, Denver');
	const specialtyCenterId = await createSite(healthSystemId, 'Specialty Care Center', '300 Specialist Dr, Denver');

	// Create Clerkship
	console.log('  Creating clerkship...');
	const clerkshipId = await createClerkship('Pediatrics', {
		type: 'outpatient',
		requiredDays: 15,
		specialty: 'Pediatrics',
	});

	// Create Electives
	console.log('  Creating electives...');
	const neonatalId = await createElective(clerkshipId, 'Neonatal Care', {
		minimumDays: 3,
		isRequired: true,
	});

	const adolescentId = await createElective(clerkshipId, 'Adolescent Medicine', {
		minimumDays: 4,
		isRequired: true,
	});

	const developmentalId = await createElective(clerkshipId, 'Developmental Pediatrics', {
		minimumDays: 3,
		isRequired: false, // Optional elective
	});

	// Create Students
	console.log('  Creating students...');
	const student1Id = await createStudent('Michael Chen', 'michael.chen@medical.edu');
	const student2Id = await createStudent('Sarah Martinez', 'sarah.martinez@medical.edu');
	const student3Id = await createStudent('David Kim', 'david.kim@medical.edu');
	const student4Id = await createStudent('Lisa Thompson', 'lisa.thompson@medical.edu');

	// Create Preceptors
	console.log('  Creating preceptors...');

	// General pediatrics preceptors
	const drGeneralAId = await createPreceptor('Dr. General A', {
		healthSystemId,
		siteId: generalClinicId,
		specialty: 'Pediatrics',
		maxStudents: 2,
	});

	const drGeneralBId = await createPreceptor('Dr. General B', {
		healthSystemId,
		siteId: generalClinicId,
		specialty: 'Pediatrics',
		maxStudents: 2,
	});

	// Specialist preceptors (for electives)
	const drNeonatalId = await createPreceptor('Dr. Neonatal Specialist', {
		healthSystemId,
		siteId: specialtyCenterId,
		specialty: 'Neonatal Care',
		maxStudents: 1,
	});

	const drAdolescentId = await createPreceptor('Dr. Adolescent Specialist', {
		healthSystemId,
		siteId: specialtyCenterId,
		specialty: 'Adolescent Medicine',
		maxStudents: 2,
	});

	// Create Teams
	console.log('  Creating teams...');
	await createTeam(clerkshipId, 'General Pediatrics Team', [drGeneralAId, drGeneralBId]);
	await createTeam(clerkshipId, 'Specialty Pediatrics Team', [drNeonatalId, drAdolescentId]);

	// Create Availability
	console.log('  Creating availability...');
	const allWeekdays = generateWeekdaysInRange(SCHEDULE_START, SCHEDULE_END);

	// General preceptors available all weekdays
	await createAvailability(drGeneralAId, generalClinicId, allWeekdays);
	await createAvailability(drGeneralBId, generalClinicId, allWeekdays);

	// Specialists have limited availability (first 2 weeks)
	const specialistDates = generateWeekdaysInRange('2026-01-05', '2026-01-16');
	await createAvailability(drNeonatalId, specialtyCenterId, specialistDates);
	await createAvailability(drAdolescentId, specialtyCenterId, specialistDates);

	console.log(`    General preceptors: ${allWeekdays.length} days each`);
	console.log(`    Specialist preceptors: ${specialistDates.length} days each`);

	// Link electives to specialist preceptors
	console.log('  Linking electives to preceptors...');
	await linkElectivePreceptor(neonatalId, drNeonatalId);
	await linkElectivePreceptor(adolescentId, drAdolescentId);
	await linkElectivePreceptor(developmentalId, drNeonatalId); // Dr Neonatal also handles developmental

	// Calculate requirements
	const electiveDays = 3 + 4; // Neonatal (3) + Adolescent (4) = 7 required elective days
	const regularDays = 15 - electiveDays; // 15 - 7 = 8 non-elective days

	console.log(`
  Scenario Summary:
  ─────────────────────────────────────────────────────────
  Health System: Regional Medical Network
  Clerkship: Pediatrics (15 days required)

  Electives:
    - Neonatal Care: 3 days (required) → Dr. Neonatal Specialist
    - Adolescent Medicine: 4 days (required) → Dr. Adolescent Specialist
    - Developmental Pediatrics: 3 days (optional) → Dr. Neonatal Specialist

  Students: 4 (Michael, Sarah, David, Lisa)

  Preceptors:
    General (${allWeekdays.length} days each):
      - Dr. General A: max 2 students/day
      - Dr. General B: max 2 students/day
    Specialists (${specialistDates.length} days each):
      - Dr. Neonatal Specialist: max 1 student/day
      - Dr. Adolescent Specialist: max 2 students/day

  Per student: ${electiveDays} elective days + ${regularDays} regular days = 15 total

  Expected: Elective assignments have elective_id, specialists handle electives
  ─────────────────────────────────────────────────────────
`);
}
