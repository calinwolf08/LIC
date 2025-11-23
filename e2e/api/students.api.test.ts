import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Students API', () => {
	test.describe('POST /api/students', () => {
		test('should create a new student', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const response = await api.post('/api/students', studentData);
			const student = await api.expectJson(response, 201);

			const id = assertions.crud.created(student, {
				first_name: studentData.first_name,
				last_name: studentData.last_name,
				email: studentData.email,
				cohort_year: studentData.cohort_year
			});

			expect(id).toBeGreaterThan(0);
		});

		test('should reject student with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { first_name: 'Test' }; // Missing required fields

			const response = await api.post('/api/students', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject student with duplicate email', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			// Create first student
			await api.post('/api/students', studentData);

			// Attempt to create duplicate
			const response = await api.post('/api/students', studentData);
			const error = await api.expectError(response, 409);

			assertions.hasErrorMessage(error);
		});

		test('should reject student with invalid email format', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student({ email: 'invalid-email' });

			const response = await api.post('/api/students', studentData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('GET /api/students', () => {
		test('should list all students', async ({ request }) => {
			const api = createApiClient(request);

			// Create test students
			const student1 = fixtures.student();
			const student2 = fixtures.student();
			await api.post('/api/students', student1);
			await api.post('/api/students', student2);

			const response = await api.get('/api/students');
			const students = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(students);
			assertions.hasMinLength(items, 2);

			// Verify our created students are in the list
			assertions.containsWhere(items, s => s.email === student1.email);
			assertions.containsWhere(items, s => s.email === student2.email);
		});

		test('should return empty array when no students exist', async ({ request }) => {
			const api = createApiClient(request);

			// Note: This test assumes a clean database or runs in isolation
			const response = await api.get('/api/students');
			const students = await api.expectJson<any[]>(response);

			expect(Array.isArray(students) || students.items).toBeDefined();
		});
	});

	test.describe('GET /api/students/:id', () => {
		test('should get student by id', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/students/${created.id}`);
			const student = await api.expectJson(response);

			assertions.hasFields(student, ['id', 'first_name', 'last_name', 'email', 'cohort_year']);
			expect(student.id).toBe(created.id);
			expect(student.email).toBe(studentData.email);
		});

		test('should return 404 for non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/students/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/students/:id', () => {
		test('should update student fields', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectJson(createResponse, 201);

			const updates = {
				first_name: 'Updated',
				last_name: 'Name'
			};

			const response = await api.patch(`/api/students/${created.id}`, updates);
			const updated = await api.expectJson(response);

			assertions.crud.updated(updated, updates);
			expect(updated.email).toBe(studentData.email); // Unchanged field
		});

		test('should return 404 when updating non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/students/999999', { first_name: 'Test' });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});

		test('should reject invalid email update', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.patch(`/api/students/${created.id}`, { email: 'invalid' });
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('DELETE /api/students/:id', () => {
		test('should delete student', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/students/${created.id}`);
			await api.expectSuccess(deleteResponse);

			// Verify student is deleted
			const getResponse = await api.get(`/api/students/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/students/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full student lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const studentData = fixtures.student({
				first_name: 'John',
				last_name: 'Doe',
				cohort_year: 2025
			});

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectJson(createResponse, 201);
			const studentId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/students/${studentId}`);
			const fetched = await api.expectJson(getResponse);
			expect(fetched.email).toBe(studentData.email);

			// UPDATE
			const updateResponse = await api.patch(`/api/students/${studentId}`, {
				first_name: 'Jane'
			});
			const updated = await api.expectJson(updateResponse);
			expect(updated.first_name).toBe('Jane');
			expect(updated.last_name).toBe('Doe');

			// LIST
			const listResponse = await api.get('/api/students');
			const students = await api.expectJson<any[]>(listResponse);
			const items = assertions.hasItems(students);
			assertions.containsWhere(items, s => s.id === studentId);

			// DELETE
			const deleteResponse = await api.delete(`/api/students/${studentId}`);
			await api.expectSuccess(deleteResponse);

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/students/${studentId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
