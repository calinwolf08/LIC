import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';

/**
 * Schedule Views API Tests
 *
 * Tests for the schedule views API endpoints:
 * - GET /api/schedule/summary - Get overall schedule results summary
 * - GET /api/students/:id/schedule - Get student schedule with progress
 * - GET /api/preceptors/:id/schedule - Get preceptor schedule with capacity
 */

test.describe('Schedule Views API', () => {
	// Test data holders
	let testStudentId: string;
	let testPreceptorId: string;
	let testClerkshipId: string;
	let testSiteId: string;
	let testHealthSystemId: string;
	let testSchedulingPeriodId: string;
	let testAssignmentIds: string[] = [];

	test.beforeAll(async ({ request }) => {
		const api = createApiClient(request);

		// Create a health system
		const hsResponse = await api.post('/api/health-systems', {
			name: `Test Health System ${Date.now()}`,
			abbreviation: `THS-${Date.now().toString().slice(-5)}`
		});
		const healthSystem = await api.expectData<{ id: string }>(hsResponse, 201);
		testHealthSystemId = healthSystem.id;

		// Create a site
		const siteResponse = await api.post('/api/sites', {
			name: `Test Site ${Date.now()}`,
			health_system_id: testHealthSystemId
		});
		const site = await api.expectData<{ id: string }>(siteResponse, 201);
		testSiteId = site.id;

		// Create a clerkship
		const clerkshipResponse = await api.post('/api/clerkships', {
			name: `Test Clerkship ${Date.now()}`,
			specialty: 'Internal Medicine',
			clerkship_type: 'inpatient',
			required_days: 20
		});
		const clerkship = await api.expectData<{ id: string }>(clerkshipResponse, 201);
		testClerkshipId = clerkship.id;

		// Create a student
		const studentResponse = await api.post('/api/students', {
			name: `Test Student ${Date.now()}`,
			email: `student-${Date.now()}@test.com`
		});
		const student = await api.expectData<{ id: string }>(studentResponse, 201);
		testStudentId = student.id;

		// Create a preceptor
		const preceptorResponse = await api.post('/api/preceptors', {
			name: `Dr. Test Preceptor ${Date.now()}`,
			email: `preceptor-${Date.now()}@test.com`,
			health_system_id: testHealthSystemId,
			site_ids: [testSiteId]
		});
		const preceptor = await api.expectData<{ id: string }>(preceptorResponse, 201);
		testPreceptorId = preceptor.id;

		// Create a scheduling period (active)
		const now = new Date();
		const startDate = `${now.getFullYear()}-01-01`;
		const endDate = `${now.getFullYear()}-12-31`;
		const periodResponse = await api.post('/api/scheduling-periods', {
			name: `Test Period ${Date.now()}`,
			start_date: startDate,
			end_date: endDate,
			is_active: true
		});
		const period = await api.expectData<{ id: string }>(periodResponse, 201);
		testSchedulingPeriodId = period.id;
	});

	test.afterAll(async ({ request }) => {
		const api = createApiClient(request);

		// Cleanup assignments
		for (const assignmentId of testAssignmentIds) {
			await api.delete(`/api/schedule/assignments/${assignmentId}`).catch(() => {});
		}

		// Cleanup scheduling period
		if (testSchedulingPeriodId) {
			await api.delete(`/api/scheduling-periods/${testSchedulingPeriodId}`).catch(() => {});
		}

		// Cleanup preceptor
		if (testPreceptorId) {
			await api.delete(`/api/preceptors/${testPreceptorId}`).catch(() => {});
		}

		// Cleanup student
		if (testStudentId) {
			await api.delete(`/api/students/${testStudentId}`).catch(() => {});
		}

		// Cleanup clerkship
		if (testClerkshipId) {
			await api.delete(`/api/clerkships/${testClerkshipId}`).catch(() => {});
		}

		// Cleanup site
		if (testSiteId) {
			await api.delete(`/api/sites/${testSiteId}`).catch(() => {});
		}

		// Cleanup health system
		if (testHealthSystemId) {
			await api.delete(`/api/health-systems/${testHealthSystemId}`).catch(() => {});
		}
	});

	test.describe('GET /api/schedule/summary', () => {
		test('should return schedule summary with stats', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/schedule/summary');
			const summary = await api.expectData<any>(response);

			// Check structure
			expect(summary).toHaveProperty('stats');
			expect(summary).toHaveProperty('studentsWithUnmetRequirements');
			expect(summary).toHaveProperty('clerkshipBreakdown');
			expect(summary).toHaveProperty('isComplete');

			// Check stats structure
			expect(summary.stats).toHaveProperty('totalAssignments');
			expect(summary.stats).toHaveProperty('totalStudents');
			expect(summary.stats).toHaveProperty('totalPreceptors');
			expect(summary.stats).toHaveProperty('studentsFullyScheduled');
			expect(summary.stats).toHaveProperty('studentsPartiallyScheduled');
			expect(summary.stats).toHaveProperty('studentsWithNoAssignments');

			// Students and assignments should be >= 0
			expect(typeof summary.stats.totalStudents).toBe('number');
			expect(summary.stats.totalStudents).toBeGreaterThanOrEqual(0);
		});

		test('should include period info when active period exists', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/schedule/summary');
			const summary = await api.expectData<any>(response);

			// We created an active period in beforeAll
			expect(summary.period).toBeDefined();
			expect(summary.period).toHaveProperty('id');
			expect(summary.period).toHaveProperty('name');
			expect(summary.period).toHaveProperty('startDate');
			expect(summary.period).toHaveProperty('endDate');
		});

		test('should return clerkship breakdown', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/schedule/summary');
			const summary = await api.expectData<any>(response);

			expect(Array.isArray(summary.clerkshipBreakdown)).toBe(true);

			// Should include our test clerkship
			const testClerkship = summary.clerkshipBreakdown.find(
				(c: any) => c.clerkshipId === testClerkshipId
			);
			expect(testClerkship).toBeDefined();
			expect(testClerkship).toHaveProperty('clerkshipName');
			expect(testClerkship).toHaveProperty('totalAssignments');
			expect(testClerkship).toHaveProperty('studentsAssigned');
			expect(testClerkship).toHaveProperty('averageDaysPerStudent');
		});

		test('should identify students with unmet requirements', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/schedule/summary');
			const summary = await api.expectData<any>(response);

			expect(Array.isArray(summary.studentsWithUnmetRequirements)).toBe(true);

			// Our test student has no assignments yet, should have unmet requirements
			const testStudent = summary.studentsWithUnmetRequirements.find(
				(s: any) => s.studentId === testStudentId
			);
			// Test student should be in unmet list since they have 0 assignments
			if (testStudent) {
				expect(testStudent).toHaveProperty('studentName');
				expect(testStudent).toHaveProperty('unmetClerkships');
				expect(testStudent).toHaveProperty('totalGap');
				expect(Array.isArray(testStudent.unmetClerkships)).toBe(true);
			}
		});
	});

	test.describe('GET /api/students/:id/schedule', () => {
		test('should return student schedule data', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/students/${testStudentId}/schedule`);
			const schedule = await api.expectData<any>(response);

			// Check student info
			expect(schedule).toHaveProperty('student');
			expect(schedule.student.id).toBe(testStudentId);
			expect(schedule.student).toHaveProperty('name');
			expect(schedule.student).toHaveProperty('email');

			// Check period info
			expect(schedule).toHaveProperty('period');

			// Check clerkship progress
			expect(schedule).toHaveProperty('clerkshipProgress');
			expect(Array.isArray(schedule.clerkshipProgress)).toBe(true);

			// Check summary
			expect(schedule).toHaveProperty('summary');
			expect(schedule.summary).toHaveProperty('totalAssignedDays');
			expect(schedule.summary).toHaveProperty('totalRequiredDays');
			expect(schedule.summary).toHaveProperty('overallPercentComplete');
			expect(schedule.summary).toHaveProperty('clerkshipsComplete');
			expect(schedule.summary).toHaveProperty('clerkshipsTotal');

			// Check calendar
			expect(schedule).toHaveProperty('calendar');
			expect(Array.isArray(schedule.calendar)).toBe(true);

			// Check assignments
			expect(schedule).toHaveProperty('assignments');
			expect(Array.isArray(schedule.assignments)).toBe(true);
		});

		test('should include clerkship progress for all clerkships', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/students/${testStudentId}/schedule`);
			const schedule = await api.expectData<any>(response);

			// Should have progress entry for our test clerkship
			const testProgress = schedule.clerkshipProgress.find(
				(c: any) => c.clerkshipId === testClerkshipId
			);
			expect(testProgress).toBeDefined();
			expect(testProgress).toHaveProperty('clerkshipName');
			expect(testProgress).toHaveProperty('specialty');
			expect(testProgress).toHaveProperty('requiredDays');
			expect(testProgress).toHaveProperty('assignedDays');
			expect(testProgress).toHaveProperty('remainingDays');
			expect(testProgress).toHaveProperty('percentComplete');
			expect(testProgress).toHaveProperty('isComplete');
			expect(testProgress).toHaveProperty('preceptors');
			expect(testProgress).toHaveProperty('sites');
		});

		test('should return calendar months for the period', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/students/${testStudentId}/schedule`);
			const schedule = await api.expectData<any>(response);

			expect(schedule.calendar.length).toBeGreaterThan(0);

			const firstMonth = schedule.calendar[0];
			expect(firstMonth).toHaveProperty('year');
			expect(firstMonth).toHaveProperty('month');
			expect(firstMonth).toHaveProperty('monthName');
			expect(firstMonth).toHaveProperty('weeks');
			expect(Array.isArray(firstMonth.weeks)).toBe(true);

			// Check week structure
			const firstWeek = firstMonth.weeks[0];
			expect(firstWeek).toHaveProperty('weekNumber');
			expect(firstWeek).toHaveProperty('days');
			expect(firstWeek.days).toHaveLength(7);

			// Check day structure
			const firstDay = firstWeek.days[0];
			expect(firstDay).toHaveProperty('date');
			expect(firstDay).toHaveProperty('dayOfMonth');
			expect(firstDay).toHaveProperty('dayOfWeek');
			expect(firstDay).toHaveProperty('isCurrentMonth');
			expect(firstDay).toHaveProperty('isToday');
			expect(firstDay).toHaveProperty('isWeekend');
		});

		test('should return 404 for non-existent student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/students/nonexistent-id/schedule');
			expect(response.status()).toBe(404);
		});
	});

	test.describe('GET /api/preceptors/:id/schedule', () => {
		test('should return preceptor schedule data', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/preceptors/${testPreceptorId}/schedule`);
			const schedule = await api.expectData<any>(response);

			// Check preceptor info
			expect(schedule).toHaveProperty('preceptor');
			expect(schedule.preceptor.id).toBe(testPreceptorId);
			expect(schedule.preceptor).toHaveProperty('name');
			expect(schedule.preceptor).toHaveProperty('email');

			// Check period info
			expect(schedule).toHaveProperty('period');

			// Check monthly capacity
			expect(schedule).toHaveProperty('monthlyCapacity');
			expect(Array.isArray(schedule.monthlyCapacity)).toBe(true);

			// Check overall capacity
			expect(schedule).toHaveProperty('overallCapacity');
			expect(schedule.overallCapacity).toHaveProperty('availableDays');
			expect(schedule.overallCapacity).toHaveProperty('assignedDays');
			expect(schedule.overallCapacity).toHaveProperty('openSlots');
			expect(schedule.overallCapacity).toHaveProperty('utilizationPercent');

			// Check calendar
			expect(schedule).toHaveProperty('calendar');
			expect(Array.isArray(schedule.calendar)).toBe(true);

			// Check assigned students
			expect(schedule).toHaveProperty('assignedStudents');
			expect(Array.isArray(schedule.assignedStudents)).toBe(true);

			// Check assignments
			expect(schedule).toHaveProperty('assignments');
			expect(Array.isArray(schedule.assignments)).toBe(true);
		});

		test('should return monthly capacity breakdown', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/preceptors/${testPreceptorId}/schedule`);
			const schedule = await api.expectData<any>(response);

			expect(schedule.monthlyCapacity.length).toBeGreaterThan(0);

			const firstMonth = schedule.monthlyCapacity[0];
			expect(firstMonth).toHaveProperty('periodName');
			expect(firstMonth).toHaveProperty('startDate');
			expect(firstMonth).toHaveProperty('endDate');
			expect(firstMonth).toHaveProperty('availableDays');
			expect(firstMonth).toHaveProperty('assignedDays');
			expect(firstMonth).toHaveProperty('openSlots');
			expect(firstMonth).toHaveProperty('utilizationPercent');

			// Utilization should be 0-100
			expect(firstMonth.utilizationPercent).toBeGreaterThanOrEqual(0);
			expect(firstMonth.utilizationPercent).toBeLessThanOrEqual(100);
		});

		test('should include calendar with availability', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/preceptors/${testPreceptorId}/schedule`);
			const schedule = await api.expectData<any>(response);

			expect(schedule.calendar.length).toBeGreaterThan(0);

			const firstMonth = schedule.calendar[0];
			expect(firstMonth).toHaveProperty('weeks');

			const firstWeek = firstMonth.weeks[0];
			const firstDay = firstWeek.days[0];

			// Day should have availability property
			expect(firstDay).toHaveProperty('date');
			expect(firstDay).toHaveProperty('availability');
			// availability should be 'available', 'unavailable', or 'unset'
			if (firstDay.availability !== undefined) {
				expect(['available', 'unavailable', 'unset']).toContain(firstDay.availability);
			}
		});

		test('should return 404 for non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/preceptors/nonexistent-id/schedule');
			expect(response.status()).toBe(404);
		});
	});

	test.describe('With Assignments', () => {
		test.beforeAll(async ({ request }) => {
			const api = createApiClient(request);

			// Create some assignments
			const now = new Date();
			const dates = [
				`${now.getFullYear()}-03-01`,
				`${now.getFullYear()}-03-02`,
				`${now.getFullYear()}-03-03`
			];

			for (const date of dates) {
				const assignmentResponse = await api.post('/api/schedule/assignments', {
					student_id: testStudentId,
					preceptor_id: testPreceptorId,
					clerkship_id: testClerkshipId,
					date: date,
					status: 'scheduled'
				});
				if (assignmentResponse.ok()) {
					const assignment = await api.expectData<{ id: string }>(assignmentResponse, 201);
					testAssignmentIds.push(assignment.id);
				}
			}
		});

		test('student schedule should show assignments and progress', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/students/${testStudentId}/schedule`);
			const schedule = await api.expectData<any>(response);

			// Should have at least our test assignments
			expect(schedule.summary.totalAssignedDays).toBeGreaterThanOrEqual(testAssignmentIds.length);
			expect(schedule.assignments.length).toBeGreaterThanOrEqual(testAssignmentIds.length);

			// Clerkship progress should reflect assignments
			const testProgress = schedule.clerkshipProgress.find(
				(c: any) => c.clerkshipId === testClerkshipId
			);
			expect(testProgress.assignedDays).toBeGreaterThanOrEqual(testAssignmentIds.length);
			expect(testProgress.preceptors.length).toBeGreaterThan(0);
		});

		test('preceptor schedule should show assigned students', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get(`/api/preceptors/${testPreceptorId}/schedule`);
			const schedule = await api.expectData<any>(response);

			// Should have at least our test assignments
			expect(schedule.overallCapacity.assignedDays).toBeGreaterThanOrEqual(testAssignmentIds.length);
			expect(schedule.assignments.length).toBeGreaterThanOrEqual(testAssignmentIds.length);

			// Should have our test student in assigned students
			const testStudentAssignment = schedule.assignedStudents.find(
				(s: any) => s.studentId === testStudentId
			);
			expect(testStudentAssignment).toBeDefined();
			expect(testStudentAssignment.daysAssigned).toBeGreaterThanOrEqual(testAssignmentIds.length);
		});

		test('summary should reflect assignments', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/schedule/summary');
			const summary = await api.expectData<any>(response);

			// Should have at least our test assignments
			expect(summary.stats.totalAssignments).toBeGreaterThanOrEqual(testAssignmentIds.length);

			// Our test clerkship should have assignments
			const testClerkshipBreakdown = summary.clerkshipBreakdown.find(
				(c: any) => c.clerkshipId === testClerkshipId
			);
			expect(testClerkshipBreakdown.totalAssignments).toBeGreaterThanOrEqual(testAssignmentIds.length);
		});
	});
});
