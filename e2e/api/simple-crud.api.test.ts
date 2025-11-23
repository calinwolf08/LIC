import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';

/**
 * Simple CRUD tests demonstrating the API testing infrastructure
 * These tests use the actual API schemas
 */

test.describe('Simple API CRUD Tests', () => {
	test.describe('Students API', () => {
		test('should create, read, update, and delete a student', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const studentData = {
				name: `Test Student ${Date.now()}`,
				email: `student-${Date.now()}@test.com`
			};

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectData(createResponse, 201);

			expect(created.id).toBeDefined();
			expect(created.name).toBe(studentData.name);
			expect(created.email).toBe(studentData.email);

			const studentId = created.id;

			// READ
			const getResponse = await api.get(`/api/students/${studentId}`);
			const fetched = await api.expectData(getResponse);

			expect(fetched.id).toBe(studentId);
			expect(fetched.name).toBe(studentData.name);

			// UPDATE
			const updateData = { name: 'Updated Student Name' };
			const updateResponse = await api.patch(`/api/students/${studentId}`, updateData);
			const updated = await api.expectData(updateResponse);

			expect(updated.name).toBe('Updated Student Name');
			expect(updated.email).toBe(studentData.email);

			// DELETE
			const deleteResponse = await api.delete(`/api/students/${studentId}`);
			expect(deleteResponse.ok()).toBeTruthy();

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/students/${studentId}`);
			expect(verifyResponse.status()).toBe(404);
		});

		test('should list students', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/students');
			const result = await api.expectData<any>(response);

			// Handle both array and object formats
			const students = Array.isArray(result) ? result : result;
			expect(students).toBeDefined();
		});
	});

	test.describe('Health Systems API', () => {
		test('should create and manage health system', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const hsData = {
				name: `Test Health System ${Date.now()}`,
				abbreviation: `THS-${Date.now().toString().slice(-5)}`
			};

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			expect(created.id).toBeDefined();
			expect(created.name).toBe(hsData.name);

			const hsId = created.id;

			// READ
			const getResponse = await api.get(`/api/scheduling-config/health-systems/${hsId}`);
			const fetched = await api.expectData(getResponse);

			expect(fetched.id).toBe(hsId);

			// UPDATE
			const updateResponse = await api.put(`/api/scheduling-config/health-systems/${hsId}`, {
				name: 'Updated Health System'
			});
			const updated = await api.expectData(updateResponse);

			expect(updated.name).toBe('Updated Health System');

			// DELETE
			const deleteResponse = await api.delete(`/api/scheduling-config/health-systems/${hsId}`);
			expect(deleteResponse.ok()).toBeTruthy();
		});
	});

	test.describe('Preceptors API', () => {
		test('should create preceptor with health system', async ({ request }) => {
			const api = createApiClient(request);

			// First create health system (required for preceptor)
			const hsData = {
				name: `HS for Preceptor ${Date.now()}`,
				abbreviation: `HSP-${Date.now().toString().slice(-5)}`
			};

			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const healthSystem = await api.expectData(hsResponse, 201);

			// CREATE Preceptor
			const preceptorData = {
				name: `Dr. Test ${Date.now()}`,
				email: `preceptor-${Date.now()}@test.com`,
				specialty: 'Family Medicine',
				health_system_id: healthSystem.id
			};

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectData(createResponse, 201);

			expect(created.id).toBeDefined();
			expect(created.name).toBe(preceptorData.name);
			expect(created.specialty).toBe('Family Medicine');
			expect(created.health_system_id).toBe(healthSystem.id);

			// READ
			const getResponse = await api.get(`/api/preceptors/${created.id}`);
			const fetched = await api.expectData(getResponse);

			expect(fetched.id).toBe(created.id);

			// DELETE
			const deleteResponse = await api.delete(`/api/preceptors/${created.id}`);
			expect(deleteResponse.ok()).toBeTruthy();

			// Cleanup health system
			await api.delete(`/api/scheduling-config/health-systems/${healthSystem.id}`);
		});
	});

	test.describe('Clerkships API', () => {
		test('should create and manage clerkship', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const clerkshipData = {
				name: `Test Clerkship ${Date.now()}`,
				specialty: 'Family Medicine',
				clerkship_type: 'inpatient',
				required_days: 28,
				description: 'Test clerkship for API testing'
			};

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);

			expect(created.id).toBeDefined();
			expect(created.name).toBe(clerkshipData.name);
			expect(created.specialty).toBe('Family Medicine');

			const clerkshipId = created.id;

			// READ
			const getResponse = await api.get(`/api/clerkships/${clerkshipId}`);
			const fetched = await api.expectData(getResponse);

			expect(fetched.id).toBe(clerkshipId);

			// UPDATE
			const updateResponse = await api.patch(`/api/clerkships/${clerkshipId}`, {
				required_days: 35
			});
			const updated = await api.expectData(updateResponse);

			expect(updated.required_days).toBe(35);

			// DELETE
			const deleteResponse = await api.delete(`/api/clerkships/${clerkshipId}`);
			expect(deleteResponse.ok()).toBeTruthy();
		});
	});
});
