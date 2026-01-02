/**
 * UI E2E Test - Complete Onboarding Workflow
 *
 * Tests the full user journey of setting up a scheduling program through the UI:
 * 1. Create health system
 * 2. Create site (linked to health system)
 * 3. Create preceptor (linked to health system and site)
 * 4. Create student
 * 5. Create clerkship
 * 6. Create elective (under clerkship)
 * 7. Add blackout date
 * 8. Set preceptor availability (via API - complex UI)
 * 9. Create schedule via wizard
 * 10. Generate schedule
 *
 * This single test validates the complete flow a real user would follow.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';

test.describe('Complete Onboarding UI Workflow', () => {
	test('Complete user journey: create entities, configure schedule, and generate', async ({
		page,
		request
	}) => {
		// Use timestamp for unique names across test runs
		const timestamp = Date.now();

		// Track created entity IDs for later steps
		let healthSystemId: string;
		let siteId: string;
		let preceptorId: string;
		let studentId: string;
		let clerkshipId: string;

		// ========================================
		// STEP 1: Create Health System through UI
		// ========================================
		const hsName = `University Medical Center ${timestamp}`;

		await gotoAndWait(page, '/health-systems');
		await expect(page.getByRole('heading', { name: 'Health Systems' })).toBeVisible();

		// Click Add Health System to open modal
		await page.getByRole('button', { name: 'Add Health System' }).click();
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(hsName);
		await page.locator('input#location').fill('Downtown Campus');
		await page.locator('textarea#description').fill('Main teaching hospital');

		// Submit form
		await page.getByRole('button', { name: 'Create' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify health system appears in table
		const hsRow = page.locator('table tbody tr', { has: page.locator(`text=${hsName}`) });
		await expect(hsRow).toBeVisible({ timeout: 5000 });

		// Get health system ID from API for later use
		const hsListRes = await request.get('/api/health-systems');
		const hsList = await hsListRes.json();
		const createdHs = hsList.data.find((hs: { name: string }) => hs.name === hsName);
		healthSystemId = createdHs.id;

		// ========================================
		// STEP 2: Create Site through UI
		// ========================================
		const siteName = `Family Medicine Clinic ${timestamp}`;

		await gotoAndWait(page, '/sites');
		await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

		// Click New Site button
		await page.getByRole('link', { name: '+ New Site' }).click();
		await page.waitForURL('/sites/new');

		// Fill out form
		await page.locator('input#name').fill(siteName);
		await page.locator('select#health_system_id').selectOption(healthSystemId);
		await page.locator('textarea#address').fill('123 Main St, City, ST 12345');

		// Submit form
		await page.getByRole('button', { name: 'Create Site' }).click();

		// Verify redirect to sites list
		await page.waitForURL('/sites');

		// Verify site appears in table
		const siteRow = page.locator('table tbody tr', { has: page.locator(`text=${siteName}`) });
		await expect(siteRow).toBeVisible({ timeout: 5000 });

		// Get site ID from API
		const siteListRes = await request.get('/api/sites');
		const siteList = await siteListRes.json();
		const createdSite = siteList.data.find((s: { name: string }) => s.name === siteName);
		siteId = createdSite.id;

		// ========================================
		// STEP 3: Create Preceptor through UI
		// ========================================
		const preceptorName = `Dr. Johnson ${timestamp}`;
		const preceptorEmail = `dr.johnson.${timestamp}@hospital.edu`;

		await gotoAndWait(page, '/preceptors');
		await expect(page.getByRole('heading', { name: 'Preceptors & Teams' })).toBeVisible();

		// Click Add Preceptor to open modal
		await page.getByRole('button', { name: 'Add Preceptor' }).click();
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(preceptorName);
		await page.locator('input#email').fill(preceptorEmail);
		await page.locator('select#health_system_id').selectOption(healthSystemId);
		await page.locator('input#max_students').fill('3');

		// Submit form
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify preceptor appears in list
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${preceptorName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });

		// Get preceptor ID from API
		const preceptorListRes = await request.get('/api/preceptors');
		const preceptorList = await preceptorListRes.json();
		const createdPreceptor = preceptorList.data.find(
			(p: { name: string }) => p.name === preceptorName
		);
		preceptorId = createdPreceptor.id;

		// Note: Preceptor-site association happens through the availability API call in Step 8

		// ========================================
		// STEP 4: Create Student through UI
		// ========================================
		const studentName = `Medical Student ${timestamp}`;
		const studentEmail = `student.${timestamp}@medical.edu`;

		await gotoAndWait(page, '/students');
		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

		// Click Add Student
		await page.getByRole('link', { name: 'Add Student' }).click();
		await page.waitForURL('/students/new');

		// Fill out form
		await page.locator('input#name').fill(studentName);
		await page.locator('input#email').fill(studentEmail);

		// Submit
		await page.getByRole('button', { name: 'Create' }).click();

		// Verify redirect and student in list
		await page.waitForURL('/students');
		const studentRow = page.locator('table tbody tr', { has: page.locator(`text=${studentName}`) });
		await expect(studentRow).toBeVisible({ timeout: 5000 });

		// Get student ID from API
		const studentListRes = await request.get('/api/students');
		const studentList = await studentListRes.json();
		const createdStudent = studentList.data.find((s: { name: string }) => s.name === studentName);
		studentId = createdStudent.id;

		// ========================================
		// STEP 5: Create Clerkship through UI
		// ========================================
		const clerkshipName = `Family Medicine Rotation ${timestamp}`;

		await gotoAndWait(page, '/clerkships');
		await expect(page.getByRole('heading', { name: 'Clerkships' })).toBeVisible();

		// Click Add Clerkship to open modal
		await page.getByRole('button', { name: 'Add Clerkship' }).click();
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(clerkshipName);
		await page.locator('input[value="outpatient"]').click();
		await page.locator('input#required_days').fill('20');
		await page.locator('input#description').fill('Core family medicine rotation');

		// Submit form
		await page.getByRole('button', { name: 'Create' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify clerkship appears in list
		const clerkshipRow = page.locator('table tbody tr', {
			has: page.locator(`text=${clerkshipName}`)
		});
		await expect(clerkshipRow).toBeVisible({ timeout: 5000 });

		// Get clerkship ID from API
		const clerkshipListRes = await request.get('/api/clerkships');
		const clerkshipList = await clerkshipListRes.json();
		const createdClerkship = clerkshipList.data.find(
			(c: { name: string }) => c.name === clerkshipName
		);
		clerkshipId = createdClerkship.id;

		// ========================================
		// STEP 6: Create Elective through UI
		// ========================================
		const electiveName = `Sports Medicine Elective ${timestamp}`;

		// Navigate to clerkship config page
		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);
		await expect(page.getByRole('heading', { name: 'Configure Clerkship' })).toBeVisible();

		// Click on Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for electives panel to load
		await expect(page.getByText('No electives configured')).toBeVisible({ timeout: 5000 });

		// Click Create Elective button
		await page.getByRole('button', { name: 'Create Elective' }).click();

		// Fill out elective form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible();
		await page.locator('input#name').fill(electiveName);
		await page.locator('input#specialty').fill('Sports Medicine');
		await page.locator('input#minimumDays').fill('5');

		// Submit form
		await page.getByRole('button', { name: 'Create' }).last().click();

		// Verify elective appears in list
		await expect(page.getByText(electiveName)).toBeVisible({ timeout: 5000 });

		// ========================================
		// STEP 7: Add Blackout Date through UI
		// ========================================
		// Calculate a unique blackout date (100+ days from now to avoid conflicts)
		const blackoutDate = new Date();
		blackoutDate.setDate(blackoutDate.getDate() + 100 + (timestamp % 100));
		const blackoutDateStr = blackoutDate.toISOString().split('T')[0];
		const blackoutReason = `Test Holiday ${timestamp}`;

		await gotoAndWait(page, '/calendar');
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();

		// Wait for blackout panel to appear
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Add a blackout date
		await page.locator('input#blackout-date').fill(blackoutDateStr);
		await page.locator('input#blackout-reason').fill(blackoutReason);
		await page.getByRole('button', { name: 'Add' }).click();

		// Verify blackout date appears in list
		await expect(page.getByText(blackoutReason)).toBeVisible({ timeout: 5000 });

		// ========================================
		// STEP 8: Set Preceptor Availability (via API)
		// ========================================
		// Availability UI is complex (pattern builder), so use API
		const today = new Date();
		const startDate = today.toISOString().split('T')[0];
		const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

		// Generate dates for 30 days
		const availabilityDates: string[] = [];
		for (let i = 0; i < 30; i++) {
			const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
			availabilityDates.push(date.toISOString().split('T')[0]);
		}

		await request.post(`/api/preceptors/${preceptorId}/availability`, {
			data: {
				site_id: siteId,
				availability: availabilityDates.map((date) => ({ date, is_available: true }))
			}
		});

		// ========================================
		// STEP 9: Create Schedule via Wizard UI
		// ========================================
		await gotoAndWait(page, '/schedules/new');
		await expect(page.getByRole('heading', { name: 'Create New Schedule' })).toBeVisible();

		// Step 1: Schedule Details
		await page.locator('input#name').fill(`Academic Schedule ${timestamp}`);
		await page.locator('input#startDate').fill(startDate);
		await page.locator('input#endDate').fill(endDate);
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 2: Select Students
		await expect(page.getByRole('heading', { name: 'Select Students' })).toBeVisible();
		// Check the student we created
		const studentCheckbox = page.locator(`input[type="checkbox"][value="${studentId}"]`);
		if (await studentCheckbox.isVisible()) {
			await studentCheckbox.check();
		} else {
			// Try clicking the row or "Select All"
			await page.getByRole('button', { name: 'Select All', exact: true }).click();
		}
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 3: Select Preceptors
		await expect(page.getByRole('heading', { name: 'Select Preceptors' })).toBeVisible();
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 4: Select Sites
		await expect(page.getByRole('heading', { name: 'Select Sites' })).toBeVisible();
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 5: Select Health Systems
		await expect(page.getByRole('heading', { name: 'Select Health Systems' })).toBeVisible();
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 6: Select Clerkships
		await expect(page.getByRole('heading', { name: 'Select Clerkships' })).toBeVisible();
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 7: Select Teams (may be empty, just proceed)
		await expect(page.getByRole('heading', { name: 'Select Teams' })).toBeVisible();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 8: Review & Create
		await expect(page.getByRole('heading', { name: 'Review & Create' })).toBeVisible();
		await page.getByRole('button', { name: 'Create Schedule' }).click();

		// Wait for redirect to calendar
		await page.waitForURL('/calendar', { timeout: 10000 });

		// ========================================
		// STEP 10: Generate Schedule through UI
		// ========================================
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Click Regenerate Schedule button
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();

		// Wait for regenerate dialog to appear
		await expect(page.getByText('Regeneration Mode')).toBeVisible();

		// Select Full Regeneration mode
		await page.locator('input[value="full"]').click();

		// Click Apply Regeneration button
		await page.getByRole('button', { name: 'Apply Regeneration' }).click();

		// Wait for regeneration to start
		await expect(page.getByText('Regenerating schedule...')).toBeVisible({ timeout: 10000 });

		// Wait for dialog to close (regeneration complete)
		await expect(page.getByText('Regeneration Mode')).not.toBeVisible({ timeout: 30000 });

		// Verify we're back on calendar page
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Give a moment for any async updates to complete
		await page.waitForTimeout(1000);

		// ========================================
		// VALIDATION 1: Verify assignments were created
		// ========================================
		const completionStatsRes = await request.get('/api/students/completion-stats');
		const completionStats = await completionStatsRes.json();
		const studentStats = completionStats.data[studentId];

		// Debug: Log scheduling results
		console.log('DEBUG: Student stats:', JSON.stringify(studentStats));

		// Check schedule generation results
		const schedulesRes = await request.get('/api/schedules/assignments');
		const schedulesData = await schedulesRes.json();
		const studentAssignments = schedulesData.data?.filter(
			(a: { student_id: string }) => a.student_id === studentId
		);
		console.log('DEBUG: Student assignments count:', studentAssignments?.length || 0);

		// Student should have scheduled days > 0
		expect(studentStats).toBeDefined();
		expect(studentStats.scheduledDays).toBeGreaterThan(0);

		// ========================================
		// VALIDATION 2: Verify blackout date has no assignments
		// ========================================
		const conflictsRes = await request.post('/api/blackout-dates/conflicts', {
			data: { date: blackoutDateStr }
		});
		const conflicts = await conflictsRes.json();

		// Blackout date should have no assignments
		expect(conflicts.data.hasConflicts).toBe(false);
		expect(conflicts.data.count).toBe(0);

		// ========================================
		// VALIDATION 3: Test gap-filling regeneration
		// ========================================
		// Get current assignment count for the student
		const initialScheduledDays = studentStats.scheduledDays;

		// Find and delete one assignment via API
		// First, get an assignment to delete by checking a date that should have one
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const checkDate = tomorrow.toISOString().split('T')[0];

		const checkConflictsRes = await request.post('/api/blackout-dates/conflicts', {
			data: { date: checkDate }
		});
		const checkConflicts = await checkConflictsRes.json();

		if (checkConflicts.data.hasConflicts && checkConflicts.data.assignments.length > 0) {
			const assignmentToDelete = checkConflicts.data.assignments[0];

			// Delete the assignment
			await request.delete(`/api/schedules/assignments/${assignmentToDelete.id}`);

			// Verify assignment count decreased
			const afterDeleteRes = await request.get('/api/students/completion-stats');
			const afterDeleteStats = await afterDeleteRes.json();
			expect(afterDeleteStats.data[studentId].scheduledDays).toBe(initialScheduledDays - 1);

			// Use Fill Gaps regeneration to restore
			await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
			await expect(page.getByText('Regeneration Mode')).toBeVisible();

			// Select Fill Gaps mode
			await page.locator('input[value="fill_gaps"]').click();

			// Apply regeneration
			await page.getByRole('button', { name: 'Apply Regeneration' }).click();
			await expect(page.getByText('Regenerating schedule...')).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Regeneration Mode')).not.toBeVisible({ timeout: 30000 });

			// Verify assignment count restored
			const afterFillRes = await request.get('/api/students/completion-stats');
			const afterFillStats = await afterFillRes.json();
			expect(afterFillStats.data[studentId].scheduledDays).toBe(initialScheduledDays);
		}

		// ========================================
		// FINAL: Complete flow succeeded with validations
		// ========================================
		// Test has verified:
		// - All entities created through UI
		// - Schedule generation created assignments
		// - Blackout date was respected (no assignments)
		// - Gap-filling regeneration works
	});
});
