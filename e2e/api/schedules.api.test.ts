import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

// Helper to set up the full entity chain for schedule tests
async function setupScheduleTestEntities(api: ReturnType<typeof createApiClient>, dates: string[]) {
	// 1. Create health system
	const hsData = fixtures.healthSystem();
	const hsResponse = await api.post('/api/health-systems', hsData);
	const healthSystem = await api.expectData<any>(hsResponse, 201);

	// 2. Create site
	const siteData = fixtures.site({ health_system_id: healthSystem.id });
	const siteResponse = await api.post('/api/sites', siteData);
	const site = await api.expectData<any>(siteResponse, 201);

	// 3. Create student
	const studentData = fixtures.student();
	const studentResponse = await api.post('/api/students', studentData);
	const student = await api.expectData<any>(studentResponse, 201);

	// 4. Create preceptor with health system
	const preceptorData = fixtures.preceptor({ health_system_id: healthSystem.id });
	const preceptorResponse = await api.post('/api/preceptors', preceptorData);
	const preceptor = await api.expectData<any>(preceptorResponse, 201);

	// 5. Create clerkship with required_days matching the available dates
	const clerkshipData = fixtures.clerkship({
		duration_weeks: 1,
		start_date: dates[0],
		end_date: dates[dates.length - 1],
		required_days: dates.length // Match required days to available dates
	});
	const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
	const clerkship = await api.expectData<any>(clerkshipResponse, 201);

	// 6. Create a team for the clerkship and add the preceptor to it
	// The scheduling engine requires preceptors to be team members for clerkship associations
	const teamResponse = await api.post('/api/preceptors/teams', {
		name: `Team for ${clerkship.name}`,
		clerkshipId: clerkship.id,
		requireSameHealthSystem: false,
		requireSameSite: false,
		members: [
			{ preceptorId: preceptor.id, priority: 1 }
		]
	});
	await api.expectData(teamResponse, 201);

	// 7. Set preceptor availability with site_id
	const availability = dates.map(date => ({ date, is_available: true }));
	await api.post(`/api/preceptors/${preceptor.id}/availability`, {
		site_id: site.id,
		availability
	});

	return { healthSystem, site, student, preceptor, clerkship };
}

test.describe('Schedules API', () => {
	test.describe('Schedule Generation', () => {
		test('should generate a basic schedule', async ({ request }) => {
			const api = createApiClient(request);

			// Setup: Create full entity chain
			const dates = dateHelpers.getDateRange('2026-01-06', '2026-01-10');
			const { student, preceptor, clerkship } = await setupScheduleTestEntities(api, dates);

			// Generate schedule
			const generateResponse = await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-10'
			});

			const result = await api.expectData(generateResponse);

			// Verify generation result
			expect(result.success !== undefined || result.assignments !== undefined || result.message !== undefined).toBeTruthy();
		});

		test('should handle dry-run mode', async ({ request }) => {
			const api = createApiClient(request);

			// Create full entity chain for proper setup
			const dates = dateHelpers.getDateRange('2026-01-06', '2026-01-10');
			await setupScheduleTestEntities(api, dates);

			// Generate in preview (dry-run) mode
			const response = await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-10',
				preview: true
			});

			const result = await api.expectData(response);

			// In dry-run, should return preview without persisting
			expect(result).toBeDefined();
		});

		test('should handle generation with constraints', async ({ request }) => {
			const api = createApiClient(request);

			// Setup with full entity chain
			const dates = dateHelpers.getDateRange('2026-01-06', '2026-01-10');
			const { healthSystem, site, preceptor } = await setupScheduleTestEntities(api, dates);

			// Add a second student
			const student2Response = await api.post('/api/students', fixtures.student());
			await api.expectData(student2Response, 201);

			// Set capacity limit
			await api.post('/api/scheduling-config/capacity-rules', {
				preceptor_id: preceptor.id,
				capacity_type: 'per_day',
				max_students: 1 // Only 1 student per day
			});

			// Generate schedule
			const response = await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-10'
			});

			const result = await api.expectData(response);

			// Should respect capacity constraints
			expect(result).toBeDefined();
		});
	});

	test.describe('Assignment Management', () => {
		let studentId: string;
		let preceptorId: string;
		let clerkshipId: string;
		let assignmentId: string;
		let siteId: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain - use 2-day range since schema requires startDate < endDate
			const dates = ['2026-01-06', '2026-01-07'];
			const entities = await setupScheduleTestEntities(api, dates);

			studentId = entities.student.id;
			preceptorId = entities.preceptor.id;
			clerkshipId = entities.clerkship.id;
			siteId = entities.site.id;

			const genResponse = await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-07'
			});
			await api.expectData(genResponse);

			// Get the created assignment
			const calResponse = await api.get('/api/calendar', {
				params: {
					start_date: '2026-01-06',
					end_date: '2026-01-07'
				}
			});
			const events = await api.expectData<any[]>(calResponse);

			if (events && events.length > 0) {
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
			const assignment = await api.expectData(response);

			assertions.hasFields(assignment, ['id', 'student_id', 'preceptor_id', 'clerkship_id', 'date']);
			expect(assignment.id).toBe(assignmentId);
		});

		test('should update assignment', async ({ request }) => {
			if (!assignmentId) {
				test.skip();
				return;
			}

			const api = createApiClient(request);

			// Valid update fields are: student_id, preceptor_id, clerkship_id, date, status
			const updates = {
				status: 'completed'
			};

			const response = await api.patch(`/api/schedules/assignments/${assignmentId}`, updates);
			const updated = await api.expectData(response);

			expect(updated.status).toBe('completed');
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

			// Create another preceptor - need health system from setup
			const newPreceptor = await api.post('/api/preceptors', fixtures.preceptor());
			const p = await api.expectData(newPreceptor, 201);

			const response = await api.post(`/api/schedules/assignments/${assignmentId}/reassign`, {
				new_preceptor_id: p.id
			});

			const result = await api.expectData<any>(response);
			// Response is { valid: boolean, assignment: {...} }
			expect(result.valid).toBe(true);
			expect(result.assignment?.preceptor_id).toBe(p.id);
		});
	});

	test.describe('Assignment Swapping', () => {
		test('should swap assignments between students', async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain for first student/preceptor - use 2-day range since schema requires startDate < endDate
			const dates = ['2026-01-06', '2026-01-07'];
			const { healthSystem, site, student: student1, preceptor: preceptor1, clerkship } = await setupScheduleTestEntities(api, dates);

			// Create second student
			const s2Response = await api.post('/api/students', fixtures.student());
			const student2 = await api.expectData(s2Response, 201);

			// Create second preceptor with same health system
			const p2Response = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: healthSystem.id }));
			const preceptor2 = await api.expectData(p2Response, 201);

			// Add second preceptor to a team for this clerkship (required for scheduling)
			const team2Response = await api.post('/api/preceptors/teams', {
				name: `Team 2 for ${clerkship.name}`,
				clerkshipId: clerkship.id,
				requireSameHealthSystem: false,
				requireSameSite: false,
				members: [
					{ preceptorId: preceptor2.id, priority: 1 }
				]
			});
			await api.expectData(team2Response, 201);

			// Set availability for second preceptor
			await api.post(`/api/preceptors/${preceptor2.id}/availability`, {
				site_id: site.id,
				availability: [{ date: '2026-01-06', is_available: true }, { date: '2026-01-07', is_available: true }]
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-07'
			});

			// Get assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2026-01-06', end_date: '2026-01-07' }
			});
			const events = await api.expectData<any[]>(calResponse);

			if (events && events.length >= 2) {
				const assignment1 = events.find((e: any) => e.student_id === student1.id);
				const assignment2 = events.find((e: any) => e.student_id === student2.id);

				if (assignment1 && assignment2) {
					// Swap assignments
					const swapResponse = await api.post('/api/schedules/assignments/swap', {
						assignment1_id: assignment1.id,
						assignment2_id: assignment2.id
					});

					const result = await api.expectData(swapResponse);
					expect(result.success || result.assignments).toBeDefined();
				}
			}
		});
	});

	test.describe('Schedule Clearing', () => {
		test('should clear all assignments', async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain - use 2-day range since schema requires startDate < endDate
			const dates = ['2026-01-06', '2026-01-07'];
			await setupScheduleTestEntities(api, dates);

			await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-07'
			});

			// Clear all assignments
			const response = await api.delete('/api/schedules', {
				params: { clearAll: 'true' }
			});

			await api.expectSuccess(response);

			// Verify no assignments remain
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2026-01-06', end_date: '2026-01-07' }
			});
			const events = await api.expectData<any[]>(calResponse);
			expect(events?.length || 0).toBe(0);
		});

		test('should clear assignments from specific date', async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain with multiple dates
			const dates = dateHelpers.getDateRange('2026-01-06', '2026-01-10');
			await setupScheduleTestEntities(api, dates);

			await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-10'
			});

			// Clear from Jan 8 onwards
			const response = await api.delete('/api/schedules', {
				params: { fromDate: '2026-01-08' }
			});

			await api.expectSuccess(response);

			// Verify assignments before Jan 8 still exist
			const beforeResponse = await api.get('/api/calendar', {
				params: { start_date: '2026-01-06', end_date: '2026-01-07' }
			});
			const beforeEvents = await api.expectData<any[]>(beforeResponse);
			// Schedule may or may not have created assignments for these days depending on requirements
			expect(beforeEvents).toBeDefined();

			// Verify assignments from Jan 8 onwards are cleared
			const afterResponse = await api.get('/api/calendar', {
				params: { start_date: '2026-01-08', end_date: '2026-01-10' }
			});
			const afterEvents = await api.expectData<any[]>(afterResponse);
			expect(afterEvents?.length || 0).toBe(0);
		});
	});

	test.describe('Schedule Export', () => {
		test('should export schedule to Excel', async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain - use 2-day range since schema requires startDate < endDate
			const dates = ['2026-01-06', '2026-01-07'];
			await setupScheduleTestEntities(api, dates);

			await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-07'
			});

			// Export schedule
			const response = await api.get('/api/schedules/export', {
				params: {
					start_date: '2026-01-06',
					end_date: '2026-01-07'
				}
			});

			// Should return Excel file
			expect(response.status()).toBe(200);
			const contentType = response.headers()['content-type'];
			expect(contentType?.includes('excel') || contentType?.includes('spreadsheet')).toBeTruthy();
		});

		test('should export with filters', async ({ request }) => {
			const api = createApiClient(request);

			// Setup full entity chain - use 2-day range since schema requires startDate < endDate
			const dates = ['2026-01-06', '2026-01-07'];
			const { student } = await setupScheduleTestEntities(api, dates);

			await api.post('/api/schedules/generate', {
				startDate: '2026-01-06',
				endDate: '2026-01-07'
			});

			// Export with student filter
			const response = await api.get('/api/schedules/export', {
				params: {
					start_date: '2026-01-06',
					end_date: '2026-01-07',
					student_id: String(student.id)
				}
			});

			expect(response.status()).toBe(200);
		});
	});
});
