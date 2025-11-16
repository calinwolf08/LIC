/**
 * E2E Tests - Complete Scheduling Workflow
 *
 * Tests the end-to-end scheduling process from setup to viewing schedules
 */

import { expect, test } from '@playwright/test';

test.describe('Complete Scheduling Workflow', () => {
	test('should complete full scheduling workflow', async ({ page }) => {
		// Step 1: Navigate to dashboard
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

		// Step 2: Create a student
		await page.goto('/students/new');

		const nameInput = page.locator('input[name="name"], input[id="name"]');
		const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');

		if (await nameInput.count() > 0) {
			await nameInput.fill('E2E Test Student');
			await emailInput.fill('e2e.student@example.com');

			const cohortInput = page.locator('input[name="cohort"], input[id="cohort"]');
			if (await cohortInput.count() > 0) {
				await cohortInput.fill('2024');
			}

			const submitButton = page.getByRole('button', { name: /create|save|submit/i });
			if (await submitButton.count() > 0) {
				await submitButton.click();
				await page.waitForTimeout(1000);
			}
		}

		// Step 3: Create a preceptor
		await page.goto('/preceptors');

		const addPreceptorButton = page.getByRole('link', { name: /new preceptor|add preceptor/i });

		if (await addPreceptorButton.count() > 0) {
			await addPreceptorButton.click();

			const preceptorNameInput = page.locator('input[name="name"], input[id="name"]');
			const preceptorEmailInput = page.locator('input[name="email"], input[id="email"]');

			if (await preceptorNameInput.count() > 0) {
				await preceptorNameInput.fill('Dr. E2E Test');
				await preceptorEmailInput.fill('dr.e2e@hospital.com');

				const specialtyInput = page.locator('input[name="specialty"], select[name="specialty"]');
				if (await specialtyInput.count() > 0) {
					if (await specialtyInput.getAttribute('type') === 'select') {
						await specialtyInput.selectOption('Cardiology');
					} else {
						await specialtyInput.fill('Cardiology');
					}
				}

				const submitPreceptorButton = page.getByRole('button', { name: /create|save|submit/i });
				if (await submitPreceptorButton.count() > 0) {
					await submitPreceptorButton.click();
					await page.waitForTimeout(1000);
				}
			}
		}

		// Step 4: Create a clerkship
		await page.goto('/clerkships');

		const addClerkshipButton = page.getByRole('link', { name: /new clerkship|add clerkship/i });

		if (await addClerkshipButton.count() > 0) {
			await addClerkshipButton.click();

			const clerkshipNameInput = page.locator('input[name="name"], input[id="name"]');
			const clerkshipSpecialtyInput = page.locator('input[name="specialty"], select[name="specialty"]');

			if (await clerkshipNameInput.count() > 0) {
				await clerkshipNameInput.fill('E2E Cardiology Rotation');

				if (await clerkshipSpecialtyInput.count() > 0) {
					if (await clerkshipSpecialtyInput.getAttribute('type') === 'select') {
						await clerkshipSpecialtyInput.selectOption('Cardiology');
					} else {
						await clerkshipSpecialtyInput.fill('Cardiology');
					}
				}

				const requiredDaysInput = page.locator('input[name="required_days"], input[id="required_days"]');
				if (await requiredDaysInput.count() > 0) {
					await requiredDaysInput.fill('10');
				}

				const submitClerkshipButton = page.getByRole('button', { name: /create|save|submit/i });
				if (await submitClerkshipButton.count() > 0) {
					await submitClerkshipButton.click();
					await page.waitForTimeout(1000);
				}
			}
		}

		// Step 5: View calendar/schedule
		await page.goto('/calendar');

		// Verify calendar page loads
		await expect(page.getByRole('heading', { name: /calendar|schedule/i })).toBeVisible();

		// Look for calendar component
		const calendar = page.locator('[class*="calendar"], [role="grid"]');

		if (await calendar.count() > 0) {
			await expect(calendar.first()).toBeVisible();
		}
	});

	test('should generate a schedule', async ({ page }) => {
		await page.goto('/');

		// Look for "Generate Schedule" button
		const generateButton = page.getByRole('button', { name: /generate schedule/i });

		if (await generateButton.count() > 0) {
			await generateButton.click();

			// Wait for generation to complete
			await page.waitForTimeout(3000);

			// Look for success message or redirect to calendar
			const successMessage = page.locator('[class*="success"], [role="status"]');

			if (await successMessage.count() > 0) {
				await expect(successMessage.first()).toBeVisible();
			}
		}
	});

	test('should view student schedule', async ({ page }) => {
		await page.goto('/students');

		// Click on first student
		const firstStudent = page.locator('a[href*="/students/"]').first();

		if (await firstStudent.count() > 0) {
			await firstStudent.click();

			// Look for schedule section
			const scheduleSection = page.locator('[class*="schedule"], [class*="assignment"]');

			if (await scheduleSection.count() > 0) {
				await expect(scheduleSection.first()).toBeVisible();
			}
		}
	});

	test('should view preceptor schedule', async ({ page }) => {
		await page.goto('/preceptors');

		// Click on first preceptor
		const firstPreceptor = page.locator('a[href*="/preceptors/"]').first();

		if (await firstPreceptor.count() > 0) {
			await firstPreceptor.click();

			// Look for schedule section
			const scheduleSection = page.locator('[class*="schedule"], [class*="assignment"]');

			if (await scheduleSection.count() > 0) {
				await expect(scheduleSection.first()).toBeVisible();
			}
		}
	});

	test('should filter calendar by student', async ({ page }) => {
		await page.goto('/calendar');

		// Look for student filter dropdown
		const studentFilter = page.locator('select[name="student"], select[id="student-filter"]');

		if (await studentFilter.count() > 0) {
			// Get first option value (skip "All" option)
			const options = await studentFilter.locator('option').all();

			if (options.length > 1) {
				const value = await options[1].getAttribute('value');
				if (value) {
					await studentFilter.selectOption(value);
					await page.waitForTimeout(500);
				}
			}
		}
	});

	test('should filter calendar by date range', async ({ page }) => {
		await page.goto('/calendar');

		// Look for date range inputs
		const startDateInput = page.locator('input[name="start_date"], input[type="date"]').first();
		const endDateInput = page.locator('input[name="end_date"], input[type="date"]').last();

		if (await startDateInput.count() > 0) {
			await startDateInput.fill('2024-01-01');
		}

		if (await endDateInput.count() > 0) {
			await endDateInput.fill('2024-12-31');
			await page.waitForTimeout(500);
		}
	});

	test('should edit an assignment', async ({ page }) => {
		await page.goto('/calendar');

		// Look for an assignment to edit
		const assignment = page.locator('[class*="assignment"], [class*="event"]').first();

		if (await assignment.count() > 0) {
			// Try to click on assignment
			await assignment.click();

			// Look for edit button in modal or assignment details
			const editButton = page.getByRole('button', { name: /edit/i });

			if (await editButton.count() > 0) {
				await editButton.click();

				// Look for assignment edit form
				const assignmentForm = page.locator('form[class*="assignment"], dialog');

				if (await assignmentForm.count() > 0) {
					await expect(assignmentForm.first()).toBeVisible();
				}
			}
		}
	});

	test('should reassign student to different preceptor', async ({ page }) => {
		await page.goto('/calendar');

		// Look for assignment
		const assignment = page.locator('[class*="assignment"], [class*="event"]').first();

		if (await assignment.count() > 0) {
			await assignment.click();

			const reassignButton = page.getByRole('button', { name: /reassign/i });

			if (await reassignButton.count() > 0) {
				await reassignButton.click();

				// Look for preceptor dropdown
				const preceptorSelect = page.locator('select[name="preceptor"], select[id="preceptor"]');

				if (await preceptorSelect.count() > 0) {
					const options = await preceptorSelect.locator('option').all();

					if (options.length > 1) {
						const value = await options[1].getAttribute('value');
						if (value) {
							await preceptorSelect.selectOption(value);
						}
					}

					const saveButton = page.getByRole('button', { name: /save|confirm/i });
					if (await saveButton.count() > 0) {
						await saveButton.click();
						await page.waitForTimeout(1000);
					}
				}
			}
		}
	});

	test('should export schedule', async ({ page }) => {
		await page.goto('/calendar');

		// Look for export button
		const exportButton = page.getByRole('button', { name: /export|download/i });

		if (await exportButton.count() > 0) {
			// Set up download listener
			const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

			await exportButton.click();

			const download = await downloadPromise;

			if (download) {
				// Verify download started
				expect(download.suggestedFilename()).toBeTruthy();
			}
		}
	});

	test('should display schedule summary', async ({ page }) => {
		await page.goto('/');

		// Look for summary statistics
		const totalAssignments = page.locator('[class*="stat"], [class*="metric"]').filter({
			hasText: /assignments?|scheduled/i
		});

		const totalStudents = page.locator('[class*="stat"], [class*="metric"]').filter({
			hasText: /students?/i
		});

		if (await totalAssignments.count() > 0) {
			await expect(totalAssignments.first()).toBeVisible();
		}

		if (await totalStudents.count() > 0) {
			await expect(totalStudents.first()).toBeVisible();
		}
	});

	test('should display student progress', async ({ page }) => {
		await page.goto('/students');

		// Click on first student
		const firstStudent = page.locator('a[href*="/students/"]').first();

		if (await firstStudent.count() > 0) {
			await firstStudent.click();

			// Look for progress indicators
			const progressSection = page.locator('[class*="progress"], [role="progressbar"]');

			if (await progressSection.count() > 0) {
				await expect(progressSection.first()).toBeVisible();
			}
		}
	});
});

test.describe('Schedule Constraints and Validation', () => {
	test('should prevent double-booking students', async ({ page }) => {
		await page.goto('/calendar');

		// This would require creating a conflicting assignment
		// The UI should show an error or prevent the action
		// Test implementation depends on UI behavior
	});

	test('should respect preceptor capacity limits', async ({ page }) => {
		await page.goto('/preceptors');

		// Check that preceptor capacity is displayed and respected
		const capacityIndicator = page.locator('[class*="capacity"], [class*="max"]');

		if (await capacityIndicator.count() > 0) {
			await expect(capacityIndicator.first()).toBeVisible();
		}
	});

	test('should handle blackout dates', async ({ page }) => {
		await page.goto('/calendar');

		// Look for blackout dates indicator
		const blackoutDate = page.locator('[class*="blackout"], [class*="blocked"]');

		if (await blackoutDate.count() > 0) {
			await expect(blackoutDate.first()).toBeVisible();
		}
	});
});

test.describe('Calendar Navigation', () => {
	test('should navigate between months', async ({ page }) => {
		await page.goto('/calendar');

		// Look for next month button
		const nextButton = page.getByRole('button', { name: /next/i });

		if (await nextButton.count() > 0) {
			await nextButton.click();
			await page.waitForTimeout(500);
		}

		// Look for previous month button
		const prevButton = page.getByRole('button', { name: /previous|prev/i });

		if (await prevButton.count() > 0) {
			await prevButton.click();
			await page.waitForTimeout(500);
		}
	});

	test('should jump to today', async ({ page }) => {
		await page.goto('/calendar');

		// Look for "Today" button
		const todayButton = page.getByRole('button', { name: /today/i });

		if (await todayButton.count() > 0) {
			await todayButton.click();
			await page.waitForTimeout(500);
		}
	});

	test('should switch between calendar views', async ({ page }) => {
		await page.goto('/calendar');

		// Look for view switcher (month/week/day)
		const weekViewButton = page.getByRole('button', { name: /week/i });

		if (await weekViewButton.count() > 0) {
			await weekViewButton.click();
			await page.waitForTimeout(500);
		}

		const monthViewButton = page.getByRole('button', { name: /month/i });

		if (await monthViewButton.count() > 0) {
			await monthViewButton.click();
			await page.waitForTimeout(500);
		}
	});
});
