/**
 * UI E2E Test - Student Management Advanced
 *
 * Phase 5 Tests: Student lifecycle and management
 * Tests the following:
 * 1. Student CRUD operations
 * 2. Student listing and filtering
 * 3. Health system onboarding
 * 4. Student detail view
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Student Management UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	/**
	 * Helper function to create a health system
	 */
	async function createHealthSystem(request: any, timestamp: number) {
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Student HS ${timestamp}`, location: 'Test Location' }
		});
		expect(hsResponse.ok()).toBe(true);
		const hsData = await hsResponse.json();
		return hsData.data.id;
	}

	// =========================================================================
	// Student Listing Tests
	// =========================================================================

	test('should display students list page', async ({ page }) => {
		await gotoAndWait(page, '/students');

		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
	});

	test('should show add student button', async ({ page }) => {
		await gotoAndWait(page, '/students');

		await expect(page.getByRole('link', { name: /Add Student/i })).toBeVisible();
	});

	test('should navigate to add student page', async ({ page }) => {
		await gotoAndWait(page, '/students/new');

		// Should show form heading
		await expect(page.getByRole('heading', { name: /Add Student/i })).toBeVisible();
	});

	// =========================================================================
	// Student CRUD API Tests
	// =========================================================================

	test('should create student via API', async ({ request }) => {
		const timestamp = Date.now();
		const studentName = `Test Student ${timestamp}`;
		const studentEmail = `teststudent.${timestamp}@test.edu`;

		const response = await request.post('/api/students', {
			data: {
				name: studentName,
				email: studentEmail
			}
		});
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(data.data.id).toBeDefined();
		expect(data.data.name).toBe(studentName);
		expect(data.data.email).toBe(studentEmail);

		// Verify student persisted in database
		const dbStudent = await executeWithRetry(() =>
			db
				.selectFrom('students')
				.selectAll()
				.where('id', '=', data.data.id)
				.executeTakeFirst()
		);
		expect(dbStudent).toBeDefined();
		expect(dbStudent?.name).toBe(studentName);
		expect(dbStudent?.email).toBe(studentEmail);
	});

	test('should get student by ID', async ({ request }) => {
		const timestamp = Date.now();

		// Create student
		const createResponse = await request.post('/api/students', {
			data: {
				name: `Get Student ${timestamp}`,
				email: `getstudent.${timestamp}@test.edu`
			}
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		// Get student
		const getResponse = await request.get(`/api/students/${studentId}`);
		expect(getResponse.ok()).toBe(true);

		const getData = await getResponse.json();
		expect(getData.data.id).toBe(studentId);
		expect(getData.data.name).toBe(`Get Student ${timestamp}`);
	});

	test('should update student via API', async ({ request }) => {
		const timestamp = Date.now();
		const updatedName = `Updated Student ${timestamp}`;

		// Create student
		const createResponse = await request.post('/api/students', {
			data: {
				name: `Update Student ${timestamp}`,
				email: `updatestudent.${timestamp}@test.edu`
			}
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		// Update student
		const updateResponse = await request.patch(`/api/students/${studentId}`, {
			data: { name: updatedName }
		});
		expect(updateResponse.ok()).toBe(true);

		const updateData = await updateResponse.json();
		expect(updateData.data.name).toBe(updatedName);

		// Verify update persisted in database
		const dbStudent = await executeWithRetry(() =>
			db
				.selectFrom('students')
				.selectAll()
				.where('id', '=', studentId)
				.executeTakeFirst()
		);
		expect(dbStudent).toBeDefined();
		expect(dbStudent?.name).toBe(updatedName);
	});

	test('should delete student via API', async ({ request }) => {
		const timestamp = Date.now();

		// Create student
		const createResponse = await request.post('/api/students', {
			data: {
				name: `Delete Student ${timestamp}`,
				email: `deletestudent.${timestamp}@test.edu`
			}
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		// Verify student exists in database before delete
		let dbStudent = await executeWithRetry(() =>
			db
				.selectFrom('students')
				.selectAll()
				.where('id', '=', studentId)
				.executeTakeFirst()
		);
		expect(dbStudent).toBeDefined();

		// Delete student
		const deleteResponse = await request.delete(`/api/students/${studentId}`);
		expect(deleteResponse.ok()).toBe(true);

		// Verify deleted via API
		const getResponse = await request.get(`/api/students/${studentId}`);
		expect(getResponse.status()).toBe(404);

		// Verify deleted from database
		dbStudent = await executeWithRetry(() =>
			db
				.selectFrom('students')
				.selectAll()
				.where('id', '=', studentId)
				.executeTakeFirst()
		);
		expect(dbStudent).toBeUndefined();
	});

	test('should list all students', async ({ request }) => {
		const timestamp = Date.now();

		// Create a couple students
		await request.post('/api/students', {
			data: {
				name: `List Student A ${timestamp}`,
				email: `listA.${timestamp}@test.edu`
			}
		});
		await request.post('/api/students', {
			data: {
				name: `List Student B ${timestamp}`,
				email: `listB.${timestamp}@test.edu`
			}
		});

		// List students
		const response = await request.get('/api/students');
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(data.data).toBeDefined();
		expect(Array.isArray(data.data)).toBe(true);
		expect(data.data.length).toBeGreaterThan(1);
	});

	// =========================================================================
	// Validation Tests
	// =========================================================================

	test('should reject student with invalid email', async ({ request }) => {
		const timestamp = Date.now();

		const response = await request.post('/api/students', {
			data: {
				name: `Invalid Email ${timestamp}`,
				email: 'not-an-email'
			}
		});
		expect(response.status()).toBe(400);

		const data = await response.json();
		expect(data.error).toBeDefined();
	});

	test('should reject student with empty name', async ({ request }) => {
		const timestamp = Date.now();

		const response = await request.post('/api/students', {
			data: {
				name: '',
				email: `emptyname.${timestamp}@test.edu`
			}
		});
		expect(response.status()).toBe(400);

		const data = await response.json();
		expect(data.error).toBeDefined();
	});

	test('should reject duplicate email', async ({ request }) => {
		const timestamp = Date.now();
		const email = `duplicate.${timestamp}@test.edu`;

		// Create first student
		const createResponse = await request.post('/api/students', {
			data: { name: `First Student ${timestamp}`, email }
		});
		expect(createResponse.ok()).toBe(true);

		// Try to create second student with same email
		const duplicateResponse = await request.post('/api/students', {
			data: { name: `Second Student ${timestamp}`, email }
		});
		expect(duplicateResponse.status()).toBe(409); // Conflict
	});

	// =========================================================================
	// Health System Onboarding Tests
	// =========================================================================

	test('should onboard student to health system via API', async ({ request }) => {
		const timestamp = Date.now();
		const healthSystemId = await createHealthSystem(request, timestamp);
		const completedDate = new Date().toISOString().split('T')[0];

		// Create student
		const studentResponse = await request.post('/api/students', {
			data: {
				name: `Onboard Student ${timestamp}`,
				email: `onboard.${timestamp}@test.edu`
			}
		});
		expect(studentResponse.ok()).toBe(true);
		const studentData = await studentResponse.json();
		const studentId = studentData.data.id;

		// Onboard to health system via PUT /api/student-onboarding
		const onboardResponse = await request.put('/api/student-onboarding', {
			data: {
				student_id: studentId,
				health_system_id: healthSystemId,
				is_completed: true,
				completed_date: completedDate
			}
		});
		expect(onboardResponse.ok()).toBe(true);

		// Verify onboarding persisted in database
		const dbOnboarding = await executeWithRetry(() =>
			db
				.selectFrom('student_health_system_onboarding')
				.selectAll()
				.where('student_id', '=', studentId)
				.where('health_system_id', '=', healthSystemId)
				.executeTakeFirst()
		);
		expect(dbOnboarding).toBeDefined();
		expect(dbOnboarding?.is_completed).toBe(1);
		expect(dbOnboarding?.completed_date).toBe(completedDate);
	});

	test('should list all student health system onboarding', async ({ request }) => {
		const timestamp = Date.now();
		const healthSystemId = await createHealthSystem(request, timestamp);

		// Create student
		const studentResponse = await request.post('/api/students', {
			data: {
				name: `ListOnboard Student ${timestamp}`,
				email: `listonboard.${timestamp}@test.edu`
			}
		});
		expect(studentResponse.ok()).toBe(true);
		const studentData = await studentResponse.json();
		const studentId = studentData.data.id;

		// Onboard
		await request.put('/api/student-onboarding', {
			data: {
				student_id: studentId,
				health_system_id: healthSystemId,
				is_completed: true
			}
		});

		// List all onboarding records
		const listResponse = await request.get('/api/student-onboarding');
		expect(listResponse.ok()).toBe(true);

		const listData = await listResponse.json();
		expect(listData.data).toBeDefined();
		expect(Array.isArray(listData.data)).toBe(true);

		// Verify the onboarding record is in database
		const dbOnboarding = await executeWithRetry(() =>
			db
				.selectFrom('student_health_system_onboarding')
				.selectAll()
				.where('student_id', '=', studentId)
				.where('health_system_id', '=', healthSystemId)
				.executeTakeFirst()
		);
		expect(dbOnboarding).toBeDefined();

		// Verify our record is in the API response
		const found = listData.data.some(
			(record: any) =>
				record.student_id === studentId && record.health_system_id === healthSystemId
		);
		expect(found).toBe(true);
	});

	// =========================================================================
	// Student Detail Page Tests
	// =========================================================================

	test('should display student detail page', async ({ page, request }) => {
		const timestamp = Date.now();
		const studentName = `Detail Student ${timestamp}`;

		const createResponse = await request.post('/api/students', {
			data: { name: studentName, email: `detail.${timestamp}@test.edu` }
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		await gotoAndWait(page, `/students/${studentId}`);

		// Should show student name
		await expect(page.getByText(studentName).first()).toBeVisible();
	});

	test('should redirect edit page to student detail', async ({ page, request }) => {
		const timestamp = Date.now();
		const studentName = `Edit Student ${timestamp}`;

		const createResponse = await request.post('/api/students', {
			data: { name: studentName, email: `edit.${timestamp}@test.edu` }
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		await gotoAndWait(page, `/students/${studentId}/edit`);
		await page.waitForTimeout(1000);

		// Should redirect to student detail page and show student name
		await expect(page.getByText(studentName).first()).toBeVisible();
	});

	// =========================================================================
	// Database Verification Tests
	// =========================================================================

	test('should persist student in database', async ({ request }) => {
		const timestamp = Date.now();
		const studentName = `DB Student ${timestamp}`;
		const studentEmail = `dbstudent.${timestamp}@test.edu`;

		const createResponse = await request.post('/api/students', {
			data: { name: studentName, email: studentEmail }
		});
		expect(createResponse.ok()).toBe(true);
		const createData = await createResponse.json();
		const studentId = createData.data.id;

		// Verify in database
		const dbStudent = await executeWithRetry(() =>
			db
				.selectFrom('students')
				.selectAll()
				.where('id', '=', studentId)
				.executeTakeFirst()
		);

		expect(dbStudent).toBeDefined();
		expect(dbStudent?.name).toBe(studentName);
		expect(dbStudent?.email).toBe(studentEmail);
	});
});
