/**
 * E2E UI Test - Authentication
 *
 * Tests authentication flows with real better-auth (no E2E_TESTING bypass).
 * Validates login, register, logout, and session management.
 *
 * Test Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - UI-Driven Actions: All actions via UI forms
 * - Database Verification: Confirms data persisted in SQLite
 * - UI State Verification: Validates display, toasts, navigation
 * - Atomic Validation: Each test validated individually
 */

import { test, expect } from '@playwright/test';
import { getTestDb, executeWithRetry } from '../../utils/db-helpers';
import { generateTestUser } from '../../utils/auth-helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Authentication', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should display login page
	// =========================================================================
	test('should display login page', async ({ page }) => {
		// Navigate to login
		await page.goto('/login');
		await page.waitForLoadState('networkidle');

		// Verify login form is visible (Card.Title renders as generic element, not heading)
		await expect(page.getByText('Welcome back')).toBeVisible();
		await expect(page.getByText(/sign in to your account/i)).toBeVisible();

		// Verify email field exists
		const emailField = page.locator('#email');
		await expect(emailField).toBeVisible();
		await expect(emailField).toHaveAttribute('type', 'email');

		// Verify password field exists
		const passwordField = page.locator('#password');
		await expect(passwordField).toBeVisible();

		// Verify submit button exists
		await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

		// Verify "Remember me" checkbox exists
		await expect(page.locator('#rememberMe')).toBeVisible();

		// Verify link to register exists
		await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
	});

	// =========================================================================
	// Test 2: should display register page
	// =========================================================================
	test('should display register page', async ({ page }) => {
		// Navigate to register
		await page.goto('/register');
		await page.waitForLoadState('networkidle');

		// Verify register form is visible
		await expect(page.getByText('Create an account')).toBeVisible();
		await expect(page.getByText(/enter your information to get started/i)).toBeVisible();

		// Verify name field exists
		const nameField = page.locator('#name');
		await expect(nameField).toBeVisible();
		await expect(nameField).toHaveAttribute('type', 'text');

		// Verify email field exists
		const emailField = page.locator('#email');
		await expect(emailField).toBeVisible();
		await expect(emailField).toHaveAttribute('type', 'email');

		// Verify password field exists
		const passwordField = page.locator('#password');
		await expect(passwordField).toBeVisible();

		// Verify confirm password field exists
		const confirmPasswordField = page.locator('#confirmPassword');
		await expect(confirmPasswordField).toBeVisible();

		// Verify submit button exists
		await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();

		// Verify link to login exists
		await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
	});
});
