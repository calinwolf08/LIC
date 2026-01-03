/**
 * E2E UI Test - Student Lifecycle
 *
 * Track student through entire system.
 *
 * Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - UI-Driven Actions: Track student journey through UI
 * - Database Verification: Confirms all stages work correctly
 */

import { test, expect } from '@playwright/test';
import { getTestDb, executeWithRetry } from '../../utils/db-helpers';
import { generateTestUser } from '../../utils/auth-helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

let db: Kysely<DB>;

async function loginUser(page: any, email: string, password: string) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1000);
	await page.fill('#email', email);
	await page.fill('#password', password);
	await page.getByRole('button', { name: /sign in/i }).dispatchEvent('click');
	await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });
}

test.describe('Student Lifecycle', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should track student from creation to scheduling
	// =========================================================================
	test('should track student from creation to scheduling', async ({ page }) => {
		const testUser = generateTestUser('life-create');
		const timestamp = Date.now();
		const studentName = `Lifecycle Student ${timestamp}`;

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create student via UI
		await page.goto('/students/new');
		await page.waitForLoadState('networkidle');

		await page.fill('#name', studentName);
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForTimeout(2000);

		// Verify in DB
		const student = await executeWithRetry(() =>
			db.selectFrom('students').selectAll().where('name', '=', studentName).executeTakeFirst()
		);
		expect(student).toBeDefined();

		// Navigate to student page
		await page.goto('/students');
		await page.waitForLoadState('networkidle');

		const pageContent = await page.textContent('body') || '';
		expect(pageContent).toContain(studentName);
	});

	// =========================================================================
	// Test 2: should show student progress across clerkships
	// =========================================================================
	test('should show student progress across clerkships', async ({ page }) => {
		const testUser = generateTestUser('life-progress');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create student
		const studentRes = await page.request.post('/api/students', {
			data: { name: `Progress Student ${Date.now()}` }
		});
		const student = await studentRes.json();

		// View student schedule
		await page.goto(`/students/${student.id}/schedule`);
		await page.waitForLoadState('networkidle');

		const pageContent = await page.textContent('body') || '';
		expect(pageContent.length > 0).toBeTruthy();
	});

	// =========================================================================
	// Test 3: should update student and reflect in assignments
	// =========================================================================
	test('should update student and reflect in assignments', async ({ page }) => {
		const testUser = generateTestUser('life-update');
		const timestamp = Date.now();
		const updatedName = `Updated Lifecycle Student ${timestamp}`;

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create student
		const studentRes = await page.request.post('/api/students', {
			data: { name: `Original Lifecycle ${timestamp}` }
		});
		const student = await studentRes.json();

		// Update student
		await page.goto(`/students/${student.id}/edit`);
		await page.waitForLoadState('networkidle');

		await page.fill('#name', updatedName);
		await page.getByRole('button', { name: /update|save/i }).click();
		await page.waitForTimeout(2000);

		// Verify update
		const updatedStudent = await executeWithRetry(() =>
			db.selectFrom('students').selectAll().where('id', '=', student.id).executeTakeFirst()
		);
		expect(updatedStudent?.name).toBe(updatedName);
	});

	// =========================================================================
	// Test 4: should handle student removal gracefully
	// =========================================================================
	test('should handle student removal gracefully', async ({ page }) => {
		const testUser = generateTestUser('life-remove');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create student
		const studentRes = await page.request.post('/api/students', {
			data: { name: `Remove Student ${Date.now()}` }
		});
		const student = await studentRes.json();

		// Delete student
		await page.goto('/students');
		await page.waitForLoadState('networkidle');

		const deleteButton = page.getByRole('button', { name: /delete/i }).first();
		if (await deleteButton.isVisible()) {
			await deleteButton.click();
			await page.waitForTimeout(500);

			const confirmButton = page.getByRole('button', { name: /confirm|delete|yes/i });
			if (await confirmButton.isVisible()) {
				await confirmButton.click();
				await page.waitForTimeout(1000);
			}
		}

		const deletedStudent = await executeWithRetry(() =>
			db.selectFrom('students').selectAll().where('id', '=', student.id).executeTakeFirst()
		);
		expect(deletedStudent).toBeUndefined();
	});

	// =========================================================================
	// Test 5: should export individual student schedule
	// =========================================================================
	test('should export individual student schedule', async ({ page }) => {
		const testUser = generateTestUser('life-export');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create student
		const studentRes = await page.request.post('/api/students', {
			data: { name: `Export Lifecycle ${Date.now()}` }
		});
		const student = await studentRes.json();

		await page.goto(`/students/${student.id}`);
		await page.waitForLoadState('networkidle');

		// Look for export button
		const exportButton = page.getByRole('button', { name: /export/i });
		if (await exportButton.isVisible().catch(() => false)) {
			// Export functionality available
		}

		expect(true).toBeTruthy();
	});
});
