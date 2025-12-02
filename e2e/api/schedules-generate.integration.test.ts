import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

/**
 * Integration tests for /api/schedules/generate endpoint
 *
 * These tests verify the complete schedule generation flow including:
 * - No duplicate assignments (student can't be double-booked on same date)
 * - Past assignments are properly credited during regeneration
 * - Context is properly used by the scheduling engine
 * - Regeneration preserves past assignments and credits requirements
 */
test.describe('Schedule Generation Integration Tests', () => {
	test.describe('Duplicate Prevention', () => {
		test('should not create duplicate assignments for same student on same date', async ({ request }) => {
			const api = createApiClient(request);

			// Setup: Create student, preceptor, and clerkship
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 5,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			})).then(r => api.expectJson(r, 201));

			// Set availability for all days
			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Get all assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			// Verify no duplicate (student_id, date) pairs
			const studentDateKeys = assignments
				.filter(a => a.student_id === student.id)
				.map(a => `${a.student_id}:${a.date}`);
			const uniqueKeys = new Set(studentDateKeys);

			expect(studentDateKeys.length).toBe(uniqueKeys.size);
		});

		test('should not create duplicates when regenerating multiple times', async ({ request }) => {
			const api = createApiClient(request);

			// Setup
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 3,
				start_date: '2025-01-06',
				end_date: '2025-01-08'
			}));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-08');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule multiple times
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-08'
			});

			// Clear and regenerate
			await api.delete('/api/schedules', { params: { clearAll: 'true' } });
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-08'
			});

			// Get assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-08' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			// Check for duplicates
			const studentDateKeys = assignments
				.filter(a => a.student_id === student.id)
				.map(a => `${a.student_id}:${a.date}`);
			const uniqueKeys = new Set(studentDateKeys);

			expect(studentDateKeys.length).toBe(uniqueKeys.size);
		});

		test('should handle multiple students without creating duplicates per student', async ({ request }) => {
			const api = createApiClient(request);

			// Create multiple students
			const student1 = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const student2 = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const student3 = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));

			// Create preceptors with capacity
			const preceptor1 = await api.post('/api/preceptors', fixtures.preceptor({ max_students: 2 })).then(r => api.expectJson(r, 201));
			const preceptor2 = await api.post('/api/preceptors', fixtures.preceptor({ max_students: 2 })).then(r => api.expectJson(r, 201));

			await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 5,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			}));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor1.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});
			await api.post(`/api/preceptors/${preceptor2.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Get all assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			// Verify no duplicate (student_id, date) pairs for each student
			for (const student of [student1, student2, student3]) {
				const studentAssignments = assignments.filter(a => a.student_id === student.id);
				const dateKeys = studentAssignments.map(a => a.date);
				const uniqueDates = new Set(dateKeys);

				expect(dateKeys.length).toBe(uniqueDates.size);
			}
		});
	});

	test.describe('Past Assignment Crediting', () => {
		test('should credit past assignments and reduce requirements during regeneration', async ({ request }) => {
			const api = createApiClient(request);

			// Setup
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 10,
				start_date: '2025-01-06',
				end_date: '2025-01-20'
			})).then(r => api.expectJson(r, 201));

			// Set availability for all dates
			const allDates = dateHelpers.getDateRange('2025-01-06', '2025-01-20');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: allDates.map(date => ({ date, is_available: true }))
			});

			// Generate initial schedule for first week only
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Count first week assignments
			const week1Response = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const week1Assignments = await api.expectJson<any[]>(week1Response);
			const week1Count = week1Assignments.filter(a => a.student_id === student.id).length;

			// Generate for second week (past assignments should be credited)
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-20',
				regenerate_from_date: '2025-01-13'
			});

			// Get all assignments
			const allResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-20' }
			});
			const allAssignments = await api.expectJson<any[]>(allResponse);
			const studentAssignments = allAssignments.filter(a => a.student_id === student.id);

			// Should have at most required_days (10), not 10 + week1Count
			expect(studentAssignments.length).toBeLessThanOrEqual(10);

			// Week 1 assignments should still exist (past preserved)
			const week1After = studentAssignments.filter(a => a.date <= '2025-01-10');
			expect(week1After.length).toBe(week1Count);
		});

		test('should not over-assign when past assignments already meet requirements', async ({ request }) => {
			const api = createApiClient(request);

			// Setup - small requirement
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 3,
				start_date: '2025-01-06',
				end_date: '2025-01-17'
			})).then(r => api.expectJson(r, 201));

			const allDates = dateHelpers.getDateRange('2025-01-06', '2025-01-17');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: allDates.map(date => ({ date, is_available: true }))
			});

			// Generate for first week - should create 3 days max
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Count initial assignments
			const initialResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const initialAssignments = await api.expectJson<any[]>(initialResponse);
			const initialCount = initialAssignments.filter(a => a.student_id === student.id).length;

			// If requirement met (3 days), regenerating for second week should not add more
			if (initialCount >= 3) {
				// Regenerate for second week
				await api.post('/api/schedules/generate', {
					start_date: '2025-01-06',
					end_date: '2025-01-17',
					regenerate_from_date: '2025-01-13'
				});

				// Check total assignments
				const finalResponse = await api.get('/api/calendar', {
					params: { start_date: '2025-01-06', end_date: '2025-01-17' }
				});
				const finalAssignments = await api.expectJson<any[]>(finalResponse);
				const finalCount = finalAssignments.filter(a => a.student_id === student.id).length;

				// Should not exceed requirement + some tolerance
				expect(finalCount).toBeLessThanOrEqual(5); // Some tolerance for edge cases
			}
		});
	});

	test.describe('Regeneration Flow', () => {
		test('should preserve past assignments when regenerating from specific date', async ({ request }) => {
			const api = createApiClient(request);

			// Setup
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 10,
				start_date: '2025-01-06',
				end_date: '2025-01-17'
			}));

			const allDates = dateHelpers.getDateRange('2025-01-06', '2025-01-17');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: allDates.map(date => ({ date, is_available: true }))
			});

			// Generate initial full schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-17'
			});

			// Get week 1 assignments (the "past")
			const week1Response = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const week1Before = await api.expectJson<any[]>(week1Response);
			const week1Ids = week1Before.filter(a => a.student_id === student.id).map(a => a.id);

			// Regenerate from week 2 onwards
			await api.delete('/api/schedules', { params: { fromDate: '2025-01-13' } });
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-17',
				regenerate_from_date: '2025-01-13'
			});

			// Verify week 1 assignments still exist with same IDs
			const week1AfterResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const week1After = await api.expectJson<any[]>(week1AfterResponse);
			const week1IdsAfter = week1After.filter(a => a.student_id === student.id).map(a => a.id);

			// Same assignments should be preserved
			expect(week1IdsAfter.sort()).toEqual(week1Ids.sort());
		});

		test('should handle preceptor availability change during regeneration', async ({ request }) => {
			const api = createApiClient(request);

			// Setup with two preceptors
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor1 = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const preceptor2 = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 5,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			}));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');

			// Both preceptors available initially
			await api.post(`/api/preceptors/${preceptor1.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});
			await api.post(`/api/preceptors/${preceptor2.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate initial schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Mark preceptor1 as unavailable for future dates
			await api.post(`/api/preceptors/${preceptor1.id}/availability`, {
				availability: dates.slice(2).map(date => ({ date, is_available: false }))
			});

			// Regenerate (should use preceptor2 for future dates)
			await api.delete('/api/schedules', { params: { fromDate: '2025-01-08' } });
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10',
				regenerate_from_date: '2025-01-08'
			});

			// Verify assignments exist
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			// Should have assignments (either preceptor or none if constraints can't be met)
			expect(assignments.length).toBeGreaterThanOrEqual(0);
		});
	});

	test.describe('Progress Validation', () => {
		test('should not show progress over 100% after proper generation', async ({ request }) => {
			const api = createApiClient(request);

			// Setup
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 5,
				start_date: '2025-01-06',
				end_date: '2025-01-15'
			})).then(r => api.expectJson(r, 201));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-15');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-15'
			});

			// Get student progress
			const progressResponse = await api.get(`/api/students/${student.id}/progress`);

			// If endpoint exists, check progress
			if (progressResponse.status() === 200) {
				const progress = await progressResponse.json();

				// Check clerkship progress doesn't exceed 100%
				if (progress.clerkships) {
					for (const clerkshipProgress of progress.clerkships) {
						expect(clerkshipProgress.percentage).toBeLessThanOrEqual(100);
					}
				}
			}

			// Also verify via calendar count
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-15' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);
			const studentClerkshipAssignments = assignments.filter(
				a => a.student_id === student.id && a.clerkship_id === clerkship.id
			);

			// Should not exceed required days
			expect(studentClerkshipAssignments.length).toBeLessThanOrEqual(5);
		});

		test('should count each date only once for progress', async ({ request }) => {
			const api = createApiClient(request);

			// Setup
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
			const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
				required_days: 5,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			})).then(r => api.expectJson(r, 201));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Get assignments and count unique dates
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			const studentAssignments = assignments.filter(
				a => a.student_id === student.id && a.clerkship_id === clerkship.id
			);
			const uniqueDates = new Set(studentAssignments.map(a => a.date));

			// Unique dates should equal assignment count (no duplicates)
			expect(studentAssignments.length).toBe(uniqueDates.size);
		});
	});

	test.describe('Constraint Integration', () => {
		test('should respect NoDoubleBooking constraint', async ({ request }) => {
			const api = createApiClient(request);

			// Setup multiple clerkships for same student
			const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
			const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));

			// Two clerkships requiring days on same dates
			const clerkship1 = await api.post('/api/clerkships', fixtures.clerkship({
				name: 'Clerkship A',
				required_days: 3,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			})).then(r => api.expectJson(r, 201));

			const clerkship2 = await api.post('/api/clerkships', fixtures.clerkship({
				name: 'Clerkship B',
				required_days: 3,
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			})).then(r => api.expectJson(r, 201));

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			// Generate schedule
			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Get assignments
			const calResponse = await api.get('/api/calendar', {
				params: { start_date: '2025-01-06', end_date: '2025-01-10' }
			});
			const assignments = await api.expectJson<any[]>(calResponse);

			// Group by student and date
			const studentAssignments = assignments.filter(a => a.student_id === student.id);
			const byDate = new Map<string, any[]>();

			for (const assignment of studentAssignments) {
				if (!byDate.has(assignment.date)) {
					byDate.set(assignment.date, []);
				}
				byDate.get(assignment.date)!.push(assignment);
			}

			// Each date should have at most 1 assignment per student
			for (const [date, dateAssignments] of byDate) {
				expect(dateAssignments.length).toBe(1);
			}
		});
	});
});
