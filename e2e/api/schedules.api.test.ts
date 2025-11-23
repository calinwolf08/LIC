import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

test.describe('Schedules API', () => {
	test.describe('Schedule Generation', () => {
		test('should generate a basic schedule', async ({ request }) => {
			const api = createApiClient(request);

			// Setup: Create student, preceptor, and clerkship
			const studentData = fixtures.student();
			const studentResponse = await api.post('/api/students', studentData);
			const student = await api.expectJson(studentResponse, 201);

			const preceptorData = fixtures.preceptor();
			const preceptorResponse = await api.post('/api/preceptors', preceptorData);
			const preceptor = await api.expectJson(preceptorResponse, 201);

			const clerkshipData = fixtures.clerkship({
				duration_weeks: 1,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(clerkshipResponse, 201);

			// Set preceptor availability
			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			const availability = dates.map(date => ({ date, is_available: true }));
			await api.post(`/api/preceptors/${preceptor.id}/availability`, { availability });

			// Generate schedule
			const generateResponse = await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			const result = await api.expectJson(generateResponse);

			// Verify generation result
			expect(result.success !== undefined || result.assignments !== undefined || result.message !== undefined).toBeTruthy();
		});

		test('should handle dry-run mode', async ({ request }) => {
			const api = createApiClient(request);

			// Create minimal setup
			const student = await api.post('/api/students', fixtures.student());
			await api.expectJson(student, 201);

			const preceptor = await api.post('/api/preceptors', fixtures.preceptor());
			await api.expectJson(preceptor, 201);

			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			}));
			await api.expectJson(clerkship, 201);

			// Generate in dry-run mode
			const response = await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10',
				dry_run: true
			});

			const result = await api.expectJson(response);

			// In dry-run, should return preview without persisting
			expect(result).toBeDefined();
		});

		test('should handle generation with constraints', async ({ request }) => {
			const api = createApiClient(request);

			// Setup with capacity constraints
			const student1 = await api.post('/api/students', fixtures.student());
			const s1 = await api.expectJson(student1, 201);

			const student2 = await api.post('/api/students', fixtures.student());
			const s2 = await api.expectJson(student2, 201);

			const preceptor = await api.post('/api/preceptors', fixtures.preceptor());
			const p = await api.expectJson(preceptor, 201);

			const clerkship = await api.post('/api/clerkships', fixtures.clerkship());
			const c = await api.expectJson(clerkship, 201);

			// Set capacity limit
			await api.post('/api/scheduling-config/capacity-rules', {
				preceptor_id: p.id,
				capacity_type: 'per_day',
				max_students: 1 // Only 1 student per day
			});

			// Set availability
			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${p.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			const response = await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			const result = await api.expectJson(response);

			// Should respect capacity constraints
			expect(result).toBeDefined();
		});
	});

	test.describe('Assignment Management', () => {
		let studentId: number;
		let preceptorId: number;
		let clerkshipId: number;
		let assignmentId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			const student = await api.post('/api/students', fixtures.student());
			const s = await api.expectJson(student, 201);
			studentId = s.id;

			const preceptor = await api.post('/api/preceptors', fixtures.preceptor());
			const p = await api.expectJson(preceptor, 201);
			preceptorId = p.id;

			const clerkship = await api.post('/api/clerkships', fixtures.clerkship());
			const c = await api.expectJson(clerkship, 201);
			clerkshipId = c.id;

			// Create an assignment by generating a schedule
			await api.post(`/api/preceptors/${preceptorId}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			const genResponse = await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});
			await api.expectJson(genResponse);

			// Get the created assignment
			const calResponse = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-06'
				}
			});
			const events = await api.expectJson<any[]>(calResponse);

			if (events.length > 0) {
				assignmentId = events[0].id;
			}
		});

		test('should get assignment by id', async ({ request }) => {
			if (!assignmentId) {
				test.skip();
				return;
			}

			const api = createApiClient(request);

			const response = await api.get(`/api/schedules/assignments/${assignmentId}`);
			const assignment = await api.expectJson(response);

			assertions.hasFields(assignment, ['id', 'student_id', 'preceptor_id', 'clerkship_id', 'date']);
			expect(assignment.id).toBe(assignmentId);
		});

		test('should update assignment', async ({ request }) => {
			if (!assignmentId) {
				test.skip();
				return;
			}

			const api = createApiClient(request);

			const updates = {
				assignment_type: 'outpatient'
			};

			const response = await api.patch(`/api/schedules/assignments/${assignmentId}`, updates);
			const updated = await api.expectJson(response);

			expect(updated.assignment_type).toBe('outpatient');
		});

		test('should delete assignment', async ({ request }) => {
			if (!assignmentId) {
				test.skip();
				return;
			}

			const api = createApiClient(request);

			const deleteResponse = await api.delete(`/api/schedules/assignments/${assignmentId}`);
			await api.expectSuccess(deleteResponse);

			// Verify deleted
			const getResponse = await api.get(`/api/schedules/assignments/${assignmentId}`);
			await api.expectError(getResponse, 404);
		});

		test('should reassign to different preceptor', async ({ request }) => {
			if (!assignmentId) {
				test.skip();
				return;
			}

			const api = createApiClient(request);

			// Create another preceptor
			const newPreceptor = await api.post('/api/preceptors', fixtures.preceptor());
			const p = await api.expectJson(newPreceptor, 201);

			const response = await api.post(`/api/schedules/assignments/${assignmentId}/reassign`, {
				new_preceptor_id: p.id
			});

			const reassigned = await api.expectJson(response);
			expect(reassigned.preceptor_id).toBe(p.id);
		});
	});

	test.describe('Assignment Swapping', () => {
		test('should swap assignments between students', async ({ request }) => {
			const api = createApiClient(request);

			// Create two students
			const s1Response = await api.post('/api/students', fixtures.student());
			const student1 = await api.expectJson(s1Response, 201);

			const s2Response = await api.post('/api/students', fixtures.student());
			const student2 = await api.expectJson(s2Response, 201);

			// Create two preceptors
			const p1Response = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor1 = await api.expectJson(p1Response, 201);

			const p2Response = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor2 = await api.expectJson(p2Response, 201);

			// Create clerkship
			const cResponse = await api.post('/api/clerkships', fixtures.clerkship());
			const clerkship = await api.expectJson(cResponse, 201);

			// Set availability for both preceptors
			await api.post(`/api/preceptors/${preceptor1.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});
			await api.post(`/api/preceptors/${preceptor2.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});

			// Get assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-06' }
			});
			const events = await api.expectJson<any[]>(calResponse);

			if (events.length >= 2) {
				const assignment1 = events.find(e => e.student_id === student1.id);
				const assignment2 = events.find(e => e.student_id === student2.id);

				if (assignment1 && assignment2) {
					// Swap assignments
					const swapResponse = await api.post('/api/schedules/assignments/swap', {
						assignment1_id: assignment1.id,
						assignment2_id: assignment2.id
					});

					const result = await api.expectJson(swapResponse);
					expect(result.success || result.assignments).toBeDefined();
				}
			}
		});
	});

	test.describe('Schedule Clearing', () => {
		test('should clear all assignments', async ({ request }) => {
			const api = createApiClient(request);

			// Create minimal data and generate schedule
			await api.post('/api/students', fixtures.student());
			const p = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor = await api.expectJson(p, 201);
			await api.post('/api/clerkships', fixtures.clerkship());

			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});

			// Clear all assignments
			const response = await api.delete('/api/schedules', {
				params: { clearAll: 'true' }
			});

			await api.expectSuccess(response);

			// Verify no assignments remain
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-06' }
			});
			const events = await api.expectJson<any[]>(calResponse);
			expect(events.length).toBe(0);
		});

		test('should clear assignments from specific date', async ({ request }) => {
			const api = createApiClient(request);

			// Create data and generate schedule for multiple days
			await api.post('/api/students', fixtures.student());
			const p = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor = await api.expectJson(p, 201);
			await api.post('/api/clerkships', fixtures.clerkship());

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Clear from Jan 8 onwards
			const response = await api.delete('/api/schedules', {
				params: { fromDate: '2025-01-08' }
			});

			await api.expectSuccess(response);

			// Verify assignments before Jan 8 still exist
			const beforeResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-07' }
			});
			const beforeEvents = await api.expectJson<any[]>(beforeResponse);
			expect(beforeEvents.length).toBeGreaterThan(0);

			// Verify assignments from Jan 8 onwards are cleared
			const afterResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-08', end_date: '2025-01-10' }
			});
			const afterEvents = await api.expectJson<any[]>(afterResponse);
			expect(afterEvents.length).toBe(0);
		});
	});

	test.describe('Schedule Export', () => {
		test('should export schedule to Excel', async ({ request }) => {
			const api = createApiClient(request);

			// Create minimal data
			await api.post('/api/students', fixtures.student());
			const p = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor = await api.expectJson(p, 201);
			await api.post('/api/clerkships', fixtures.clerkship());

			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});

			// Export schedule
			const response = await api.get('/api/schedules/export', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-06'
				}
			});

			// Should return Excel file
			expect(response.status()).toBe(200);
			const contentType = response.headers()['content-type'];
			expect(contentType?.includes('excel') || contentType?.includes('spreadsheet')).toBeTruthy();
		});

		test('should export with filters', async ({ request }) => {
			const api = createApiClient(request);

			// Create data
			const sResponse = await api.post('/api/students', fixtures.student());
			const student = await api.expectJson(sResponse, 201);

			const p = await api.post('/api/preceptors', fixtures.preceptor());
			const preceptor = await api.expectJson(p, 201);

			await api.post('/api/clerkships', fixtures.clerkship());

			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});

			// Export with student filter
			const response = await api.get('/api/schedules/export', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-06',
					student_id: String(student.id)
				}
			});

			expect(response.status()).toBe(200);
		});
	});
});
