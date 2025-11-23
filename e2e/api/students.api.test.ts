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
			const student = await api.expectData(response, 201);

			const id = assertions.crud.created(student, {
				name: studentData.name,
				email: studentData.email
			});

			expect(id).toBeDefined();
			expect(typeof id === 'string' || typeof id === 'number').toBeTruthy();
		});

		test('should reject student with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { name: 'Test' }; // Missing email

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
			const result = await api.expectData<any[]>(response);

			// Handle both array and {items: []} formats
			const students = Array.isArray(result) ? result : (result as any).items || result;

			expect(Array.isArray(students)).toBeTruthy();
			expect(students.length).toBeGreaterThanOrEqual(2);

			// Verify our created students are in the list
			const foundStudent1 = students.find(s => s.email === student1.email);
			const foundStudent2 = students.find(s => s.email === student2.email);
			expect(foundStudent1).toBeDefined();
			expect(foundStudent2).toBeDefined();
		});

		test('should return valid response when querying students', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/students');
			const result = await api.expectData<any>(response);

			// Should return either an array or an object with data
			expect(result).toBeDefined();
		});
	});

	test.describe('GET /api/students/:id', () => {
		test('should get student by id', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/students/${created.id}`);
			const student = await api.expectData(response);

			assertions.hasFields(student, ['id', 'name', 'email']);
			expect(student.id).toBe(created.id);
			expect(student.email).toBe(studentData.email);
		});

		test('should return 404 for non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			// Use a non-existent UUID
			const response = await api.get('/api/students/00000000-0000-0000-0000-000000000000');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/students/:id', () => {
		test('should update student fields', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				name: 'Updated Student Name'
			};

			const response = await api.patch(`/api/students/${created.id}`, updates);
			const updated = await api.expectData(response);

			assertions.crud.updated(updated, updates);
			expect(updated.email).toBe(studentData.email); // Unchanged field
		});

		test('should return 404 when updating non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/students/00000000-0000-0000-0000-000000000000', {
				name: 'Test'
			});
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});

		test('should reject invalid email update', async ({ request }) => {
			const api = createApiClient(request);
			const studentData = fixtures.student();

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectData(createResponse, 201);

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
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/students/${created.id}`);
			await api.expectSuccess(deleteResponse);

			// Verify student is deleted
			const getResponse = await api.get(`/api/students/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/students/00000000-0000-0000-0000-000000000000');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full student lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const studentData = fixtures.student({
				name: 'John Doe'
			});

			const createResponse = await api.post('/api/students', studentData);
			const created = await api.expectData(createResponse, 201);
			const studentId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/students/${studentId}`);
			const fetched = await api.expectData(getResponse);
			expect(fetched.email).toBe(studentData.email);
			expect(fetched.name).toBe('John Doe');

			// UPDATE
			const updateResponse = await api.patch(`/api/students/${studentId}`, {
				name: 'Jane Doe'
			});
			const updated = await api.expectData(updateResponse);
			expect(updated.name).toBe('Jane Doe');

			// LIST (verify student is in list)
			const listResponse = await api.get('/api/students');
			const listResult = await api.expectData<any>(listResponse);
			const students = Array.isArray(listResult) ? listResult : (listResult as any).items || listResult;
			const found = students.find((s: any) => s.id === studentId);
			expect(found).toBeDefined();

			// DELETE
			const deleteResponse = await api.delete(`/api/students/${studentId}`);
			await api.expectSuccess(deleteResponse);

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/students/${studentId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
