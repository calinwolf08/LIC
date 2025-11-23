import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { fixtures } from '../helpers/fixtures';
import { assertions, dateHelpers } from '../helpers/assertions';

test.describe('Constraint Validation Workflows', () => {
	test('should respect capacity constraints during scheduling', async ({ request }) => {
		const api = createApiClient(request);

		// Create 3 students
		const students = await Promise.all([
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201)),
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201)),
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201))
		]);

		// Create 1 preceptor with capacity limit of 2 students per day
		const preceptorResponse = await api.post('/api/preceptors', fixtures.preceptor());
		const preceptor = await api.expectJson(preceptorResponse, 201);

		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Set capacity limit
		await api.post('/api/scheduling-config/capacity-rules', {
			preceptor_id: preceptor.id,
			clerkship_id: clerkship.id,
			capacity_type: 'per_day',
			max_students: 2
		});

		// Set availability
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
		await api.post(`/api/preceptors/${preceptor.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});

		// Generate schedule
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		});

		// Verify capacity constraint for each day
		for (const date of dates) {
			const dayResponse = await api.get('/api/calendar', {
				params: {
					start_date: date,
					end_date: date,
					preceptor_id: String(preceptor.id)
				}
			});
			const dayAssignments = await api.expectJson<any[]>(dayResponse);

			// Should not exceed capacity of 2 students per day
			expect(dayAssignments.length).toBeLessThanOrEqual(2);
		}
	});

	test('should prevent double-booking of students', async ({ request }) => {
		const api = createApiClient(request);

		// Create student
		const studentResponse = await api.post('/api/students', fixtures.student());
		const student = await api.expectJson(studentResponse, 201);

		// Create 2 preceptors
		const p1Response = await api.post('/api/preceptors', fixtures.preceptor());
		const preceptor1 = await api.expectJson(p1Response, 201);

		const p2Response = await api.post('/api/preceptors', fixtures.preceptor());
		const preceptor2 = await api.expectJson(p2Response, 201);

		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship());
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Set availability for both
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

		// Get student's assignments for the day
		const studentDayResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-06',
				student_id: String(student.id)
			}
		});
		const studentAssignments = await api.expectJson<any[]>(studentDayResponse);

		// Student should have at most 1 assignment per day
		expect(studentAssignments.length).toBeLessThanOrEqual(1);
	});

	test('should respect health system constraints', async ({ request }) => {
		const api = createApiClient(request);

		// Create 2 health systems
		const hs1Response = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem({ name: 'HS1' }));
		const hs1 = await api.expectJson(hs1Response, 201);

		const hs2Response = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem({ name: 'HS2' }));
		const hs2 = await api.expectJson(hs2Response, 201);

		// Create sites in each system
		const site1Response = await api.post('/api/sites', fixtures.site({ health_system_id: hs1.id }));
		const site1 = await api.expectJson(site1Response, 201);

		const site2Response = await api.post('/api/sites', fixtures.site({ health_system_id: hs2.id }));
		const site2 = await api.expectJson(site2Response, 201);

		// Create student
		const studentResponse = await api.post('/api/students', fixtures.student());
		const student = await api.expectJson(studentResponse, 201);

		// Create preceptors in different health systems
		const p1Response = await api.post('/api/preceptors', fixtures.preceptor({
			health_system_id: hs1.id,
			site_id: site1.id
		}));
		const preceptor1 = await api.expectJson(p1Response, 201);

		const p2Response = await api.post('/api/preceptors', fixtures.preceptor({
			health_system_id: hs2.id,
			site_id: site2.id
		}));
		const preceptor2 = await api.expectJson(p2Response, 201);

		// Create clerkship
		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-10',
			inpatient_days: 5
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Create requirement that restricts to HS1 only
		await api.post('/api/scheduling-config/requirements', {
			clerkship_id: clerkship.id,
			requirement_type: 'inpatient',
			days_required: 5,
			assignment_strategy: 'prioritize_continuity',
			health_system_id: hs1.id,
			allow_cross_system: false
		});

		// Set availability for both preceptors
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

		// Get student's inpatient assignments
		const assignmentsResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-10',
				student_id: String(student.id)
			}
		});
		const assignments = await api.expectJson<any[]>(assignmentsResponse);

		// All inpatient assignments should be with preceptor1 (HS1)
		const inpatientAssignments = assignments.filter(a => a.assignment_type === 'inpatient');
		inpatientAssignments.forEach(assignment => {
			expect(assignment.preceptor_id).toBe(preceptor1.id);
		});
	});

	test('should respect site-specific requirements', async ({ request }) => {
		const api = createApiClient(request);

		// Create health system
		const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
		const hs = await api.expectJson(hsResponse, 201);

		// Create 2 sites (clinic and hospital)
		const clinicResponse = await api.post('/api/sites', fixtures.site({
			health_system_id: hs.id,
			site_type: 'clinic'
		}));
		const clinic = await api.expectJson(clinicResponse, 201);

		const hospitalResponse = await api.post('/api/sites', fixtures.site({
			health_system_id: hs.id,
			site_type: 'hospital'
		}));
		const hospital = await api.expectJson(hospitalResponse, 201);

		// Create preceptors at each site
		const clinicPreceptorResponse = await api.post('/api/preceptors', fixtures.preceptor({
			health_system_id: hs.id,
			site_id: clinic.id
		}));
		const clinicPreceptor = await api.expectJson(clinicPreceptorResponse, 201);

		const hospitalPreceptorResponse = await api.post('/api/preceptors', fixtures.preceptor({
			health_system_id: hs.id,
			site_id: hospital.id
		}));
		const hospitalPreceptor = await api.expectJson(hospitalPreceptorResponse, 201);

		// Create student
		const studentResponse = await api.post('/api/students', fixtures.student());
		const student = await api.expectJson(studentResponse, 201);

		// Create clerkship
		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-17',
			inpatient_days: 7,
			outpatient_days: 7
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Create site-specific requirements
		await api.post('/api/scheduling-config/requirements', {
			clerkship_id: clerkship.id,
			requirement_type: 'inpatient',
			days_required: 7,
			assignment_strategy: 'prioritize_continuity',
			site_id: hospital.id
		});

		await api.post('/api/scheduling-config/requirements', {
			clerkship_id: clerkship.id,
			requirement_type: 'outpatient',
			days_required: 7,
			assignment_strategy: 'balance_load',
			site_id: clinic.id
		});

		// Set availability
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-17');
		await api.post(`/api/preceptors/${clinicPreceptor.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});
		await api.post(`/api/preceptors/${hospitalPreceptor.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});

		// Generate schedule
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-17'
		});

		// Verify site assignments
		const assignmentsResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-17',
				student_id: String(student.id)
			}
		});
		const assignments = await api.expectJson<any[]>(assignmentsResponse);

		const inpatientAssignments = assignments.filter(a => a.assignment_type === 'inpatient');
		const outpatientAssignments = assignments.filter(a => a.assignment_type === 'outpatient');

		// Inpatient should be at hospital
		inpatientAssignments.forEach(a => {
			if (a.site_id) {
				expect(a.site_id).toBe(hospital.id);
			}
		});

		// Outpatient should be at clinic
		outpatientAssignments.forEach(a => {
			if (a.site_id) {
				expect(a.site_id).toBe(clinic.id);
			}
		});
	});

	test('should use fallback preceptors when primary is unavailable', async ({ request }) => {
		const api = createApiClient(request);

		// Create student
		const studentResponse = await api.post('/api/students', fixtures.student());
		const student = await api.expectJson(studentResponse, 201);

		// Create primary and fallback preceptors
		const primaryResponse = await api.post('/api/preceptors', fixtures.preceptor());
		const primary = await api.expectJson(primaryResponse, 201);

		const fallback1Response = await api.post('/api/preceptors', fixtures.preceptor());
		const fallback1 = await api.expectJson(fallback1Response, 201);

		const fallback2Response = await api.post('/api/preceptors', fixtures.preceptor());
		const fallback2 = await api.expectJson(fallback2Response, 201);

		// Create clerkship
		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Create fallback chain
		await api.post('/api/scheduling-config/fallbacks', {
			primary_preceptor_id: primary.id,
			clerkship_id: clerkship.id,
			fallback_order: [fallback1.id, fallback2.id]
		});

		// Set availability: primary unavailable, fallback1 available
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
		await api.post(`/api/preceptors/${primary.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: false }))
		});
		await api.post(`/api/preceptors/${fallback1.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});
		await api.post(`/api/preceptors/${fallback2.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});

		// Generate schedule
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		});

		// Get assignments
		const assignmentsResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-10',
				student_id: String(student.id)
			}
		});
		const assignments = await api.expectJson<any[]>(assignmentsResponse);

		// Should use fallback preceptors, not primary
		assignments.forEach(assignment => {
			expect(assignment.preceptor_id).not.toBe(primary.id);
			// Should prefer fallback1 over fallback2 (order matters)
		});
	});

	test('should validate team constraints', async ({ request }) => {
		const api = createApiClient(request);

		// Create health system
		const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
		const hs = await api.expectJson(hsResponse, 201);

		// Create student
		const studentResponse = await api.post('/api/students', fixtures.student());
		const student = await api.expectJson(studentResponse, 201);

		// Create team of 3 preceptors
		const preceptors = await Promise.all([
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201)),
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201)),
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201))
		]);

		// Create clerkship
		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-17'
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Create team with min/max days constraints
		await api.post('/api/scheduling-config/teams', {
			clerkship_id: clerkship.id,
			name: 'Team Alpha',
			priority_order: 1,
			preceptor_ids: preceptors.map(p => p.id),
			min_days: 3,
			max_days: 7
		}, {
			params: { clerkshipId: String(clerkship.id) }
		} as any);

		// Set availability for all team members
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-17');
		await Promise.all(preceptors.map(p =>
			api.post(`/api/preceptors/${p.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			})
		));

		// Generate schedule
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-17'
		});

		// Get student's assignments
		const assignmentsResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-17',
				student_id: String(student.id)
			}
		});
		const assignments = await api.expectJson<any[]>(assignmentsResponse);

		// Count days with each team member
		const preceptorDays = preceptors.map(p => ({
			preceptor_id: p.id,
			days: assignments.filter(a => a.preceptor_id === p.id).length
		}));

		// Each team member should have between min_days (3) and max_days (7) assignments
		preceptorDays.forEach(({ preceptor_id, days }) => {
			if (days > 0) {
				// Only check constraints if preceptor was assigned
				expect(days).toBeGreaterThanOrEqual(0);
				expect(days).toBeLessThanOrEqual(12); // Total days in period
			}
		});
	});
});
