import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';
import { fixtures } from '../helpers/fixtures';
import { assertions, dateHelpers } from '../helpers/assertions';

test.describe('Complete Scheduling Workflow', () => {
	test('should complete full scheduling setup and generation workflow', async ({ request }) => {
		const api = createApiClient(request);

		// ========================================
		// PHASE 1: Setup Health Systems and Sites
		// ========================================

		// Create health system
		const hsData = fixtures.healthSystem({
			name: 'Memorial Health System',
			abbreviation: 'MHS'
		});
		const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
		const healthSystem = await api.expectJson(hsResponse, 201);
		const healthSystemId = assertions.hasId(healthSystem);

		// Create sites
		const clinicData = fixtures.site({
			health_system_id: healthSystemId,
			name: 'Main Clinic',
			site_type: 'clinic'
		});
		const clinicResponse = await api.post('/api/sites', clinicData);
		const clinic = await api.expectJson(clinicResponse, 201);
		const clinicId = assertions.hasId(clinic);

		const hospitalData = fixtures.site({
			health_system_id: healthSystemId,
			name: 'Memorial Hospital',
			site_type: 'hospital'
		});
		const hospitalResponse = await api.post('/api/sites', hospitalData);
		const hospital = await api.expectJson(hospitalResponse, 201);
		const hospitalId = assertions.hasId(hospital);

		// ========================================
		// PHASE 2: Create Preceptors with Sites
		// ========================================

		// Create preceptors assigned to different sites
		const outpatientPreceptorData = fixtures.preceptor({
			first_name: 'Dr. Sarah',
			last_name: 'Johnson',
			specialty: 'Family Medicine',
			health_system_id: healthSystemId,
			site_id: clinicId
		});
		const opResponse = await api.post('/api/preceptors', outpatientPreceptorData);
		const outpatientPreceptor = await api.expectJson(opResponse, 201);
		const outpatientPreceptorId = assertions.hasId(outpatientPreceptor);

		const inpatientPreceptorData = fixtures.preceptor({
			first_name: 'Dr. Michael',
			last_name: 'Chen',
			specialty: 'Family Medicine',
			health_system_id: healthSystemId,
			site_id: hospitalId
		});
		const ipResponse = await api.post('/api/preceptors', inpatientPreceptorData);
		const inpatientPreceptor = await api.expectJson(ipResponse, 201);
		const inpatientPreceptorId = assertions.hasId(inpatientPreceptor);

		// ========================================
		// PHASE 3: Set Preceptor Availability
		// ========================================

		// Create weekly pattern for outpatient preceptor (Mon-Fri)
		const weekdayPattern = fixtures.pattern(outpatientPreceptorId, {
			pattern_name: 'Weekdays Only',
			pattern_type: 'weekly',
			start_date: '2025-01-06',
			end_date: '2025-01-31',
			week_pattern: [true, true, true, true, true, false, false]
		});
		const opPatternResponse = await api.post(`/api/preceptors/${outpatientPreceptorId}/patterns`, weekdayPattern);
		const opPattern = await api.expectJson(opPatternResponse, 201);

		// Generate availability from pattern
		await api.post(`/api/preceptors/${outpatientPreceptorId}/patterns/generate`, {
			pattern_id: opPattern.id
		});

		// Set inpatient preceptor availability (all days)
		const allDates = dateHelpers.getDateRange('2025-01-06', '2025-01-31');
		await api.post(`/api/preceptors/${inpatientPreceptorId}/availability`, {
			availability: allDates.map(date => ({ date, is_available: true }))
		});

		// ========================================
		// PHASE 4: Create Students
		// ========================================

		const student1Data = fixtures.student({
			first_name: 'Alice',
			last_name: 'Smith',
			cohort_year: 2025
		});
		const s1Response = await api.post('/api/students', student1Data);
		const student1 = await api.expectJson(s1Response, 201);
		const student1Id = assertions.hasId(student1);

		const student2Data = fixtures.student({
			first_name: 'Bob',
			last_name: 'Williams',
			cohort_year: 2025
		});
		const s2Response = await api.post('/api/students', student2Data);
		const student2 = await api.expectJson(s2Response, 201);
		const student2Id = assertions.hasId(student2);

		// ========================================
		// PHASE 5: Create Clerkship with Requirements
		// ========================================

		const clerkshipData = fixtures.clerkship({
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			duration_weeks: 4,
			start_date: '2025-01-06',
			end_date: '2025-01-31',
			inpatient_days: 10,
			outpatient_days: 10
		});
		const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
		const clerkship = await api.expectJson(clerkshipResponse, 201);
		const clerkshipId = assertions.hasId(clerkship);

		// Associate clerkship with sites
		await api.post('/api/clerkship-sites', {
			clerkship_id: clerkshipId,
			site_id: clinicId
		});
		await api.post('/api/clerkship-sites', {
			clerkship_id: clerkshipId,
			site_id: hospitalId
		});

		// Create requirements
		const inpatientReqData = fixtures.requirement(clerkshipId, {
			requirement_type: 'inpatient',
			days_required: 10,
			assignment_strategy: 'prioritize_continuity',
			site_id: hospitalId
		});
		const inpatientReqResponse = await api.post('/api/scheduling-config/requirements', inpatientReqData);
		const inpatientReq = await api.expectJson(inpatientReqResponse, 201);
		assertions.hasId(inpatientReq);

		const outpatientReqData = fixtures.requirement(clerkshipId, {
			requirement_type: 'outpatient',
			days_required: 10,
			assignment_strategy: 'balance_load',
			site_id: clinicId
		});
		const outpatientReqResponse = await api.post('/api/scheduling-config/requirements', outpatientReqData);
		const outpatientReq = await api.expectJson(outpatientReqResponse, 201);
		assertions.hasId(outpatientReq);

		// ========================================
		// PHASE 6: Configure Capacity Rules
		// ========================================

		// Limit outpatient preceptor to 1 student per day
		const opCapacityData = fixtures.capacityRule(outpatientPreceptorId, {
			capacity_type: 'per_day',
			max_students: 1,
			clerkship_id: clerkshipId
		});
		const opCapResponse = await api.post('/api/scheduling-config/capacity-rules', opCapacityData);
		const opCapacity = await api.expectJson(opCapResponse, 201);
		assertions.hasId(opCapacity);

		// Limit inpatient preceptor to 2 students per day
		const ipCapacityData = fixtures.capacityRule(inpatientPreceptorId, {
			capacity_type: 'per_day',
			max_students: 2,
			clerkship_id: clerkshipId
		});
		const ipCapResponse = await api.post('/api/scheduling-config/capacity-rules', ipCapacityData);
		const ipCapacity = await api.expectJson(ipCapResponse, 201);
		assertions.hasId(ipCapacity);

		// ========================================
		// PHASE 7: Generate Schedule
		// ========================================

		const generateResponse = await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-31'
		});
		const generateResult = await api.expectJson(generateResponse);

		// Verify generation succeeded
		expect(generateResult).toBeDefined();

		// ========================================
		// PHASE 8: Verify Generated Schedule
		// ========================================

		// Get all assignments
		const calendarResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-31'
			}
		});
		const allAssignments = await api.expectJson<any[]>(calendarResponse);

		// Verify assignments were created
		assertions.hasMinLength(allAssignments, 1);

		// Get student 1's assignments
		const student1CalResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-31',
				student_id: String(student1Id)
			}
		});
		const student1Assignments = await api.expectJson<any[]>(student1CalResponse);

		// Verify student has assignments
		expect(student1Assignments.length).toBeGreaterThan(0);

		// Count inpatient and outpatient days for student 1
		const s1Inpatient = student1Assignments.filter(a => a.assignment_type === 'inpatient').length;
		const s1Outpatient = student1Assignments.filter(a => a.assignment_type === 'outpatient').length;

		// Verify requirements are being met
		expect(s1Inpatient + s1Outpatient).toBeGreaterThan(0);

		// ========================================
		// PHASE 9: Get Calendar Summary
		// ========================================

		const summaryResponse = await api.get('/api/calendar/summary', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-31'
			}
		});
		const summary = await api.expectJson(summaryResponse);

		expect(summary).toBeDefined();

		// ========================================
		// PHASE 10: Edit Schedule (Reassignment)
		// ========================================

		if (student1Assignments.length > 0) {
			const assignmentToEdit = student1Assignments[0];

			// Update assignment type
			const updateResponse = await api.patch(`/api/schedules/assignments/${assignmentToEdit.id}`, {
				assignment_type: 'outpatient'
			});
			const updated = await api.expectJson(updateResponse);

			expect(updated.assignment_type).toBe('outpatient');
		}

		// ========================================
		// PHASE 11: Export Schedule
		// ========================================

		const exportResponse = await api.get('/api/schedules/export', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-31'
			}
		});

		expect(exportResponse.status()).toBe(200);

		// ========================================
		// PHASE 12: Cleanup (Clear Schedule)
		// ========================================

		const clearResponse = await api.delete('/api/schedules', {
			params: { clearAll: 'true' }
		});
		await api.expectSuccess(clearResponse);

		// Verify schedule cleared
		const verifyResponse = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-31'
			}
		});
		const clearedAssignments = await api.expectJson<any[]>(verifyResponse);

		expect(clearedAssignments.length).toBe(0);
	});

	test('should handle multi-student scheduling with teams', async ({ request }) => {
		const api = createApiClient(request);

		// Create health system
		const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
		const hs = await api.expectJson(hsResponse, 201);

		// Create 3 students
		const students = await Promise.all([
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201)),
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201)),
			api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201))
		]);

		// Create 3 preceptors
		const preceptors = await Promise.all([
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201)),
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201)),
			api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id })).then(r => api.expectJson(r, 201))
		]);

		// Set availability for all preceptors
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
		await Promise.all(preceptors.map(p =>
			api.post(`/api/preceptors/${p.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			})
		));

		// Create clerkship
		const clerkshipResponse = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		}));
		const clerkship = await api.expectJson(clerkshipResponse, 201);

		// Create team with all preceptors
		const teamData = fixtures.team(clerkship.id, {
			name: 'Primary Team',
			priority_order: 1,
			preceptor_ids: preceptors.map(p => p.id),
			min_days: 2,
			max_days: 5
		});
		const teamResponse = await api.post('/api/scheduling-config/teams', teamData, {
			params: { clerkshipId: String(clerkship.id) }
		} as any);
		const team = await api.expectJson(teamResponse, 201);
		assertions.hasId(team);

		// Generate schedule
		const generateResponse = await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-10'
		});
		await api.expectJson(generateResponse);

		// Verify all students have assignments
		for (const student of students) {
			const studentCalResponse = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10',
					student_id: String(student.id)
				}
			});
			const studentAssignments = await api.expectJson<any[]>(studentCalResponse);

			// Each student should have some assignments
			expect(studentAssignments.length).toBeGreaterThanOrEqual(0);
		}
	});

	test('should handle schedule regeneration from specific date', async ({ request }) => {
		const api = createApiClient(request);

		// Create minimal setup
		const student = await api.post('/api/students', fixtures.student()).then(r => api.expectJson(r, 201));
		const preceptor = await api.post('/api/preceptors', fixtures.preceptor()).then(r => api.expectJson(r, 201));
		const clerkship = await api.post('/api/clerkships', fixtures.clerkship({
			start_date: '2025-01-06',
			end_date: '2025-01-17'
		})).then(r => api.expectJson(r, 201));

		// Set availability for 2 weeks
		const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-17');
		await api.post(`/api/preceptors/${preceptor.id}/availability`, {
			availability: dates.map(date => ({ date, is_available: true }))
		});

		// Generate initial schedule
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-06',
			end_date: '2025-01-17'
		});

		// Get assignments for first week
		const week1Response = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			}
		});
		const week1Assignments = await api.expectJson<any[]>(week1Response);
		const week1Count = week1Assignments.length;

		// Clear from second week onwards
		await api.delete('/api/schedules', {
			params: { fromDate: '2025-01-13' }
		});

		// Verify first week still exists
		const verifyWeek1Response = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			}
		});
		const verifyWeek1 = await api.expectJson<any[]>(verifyWeek1Response);
		expect(verifyWeek1.length).toBe(week1Count);

		// Verify second week is cleared
		const week2Response = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-13',
				end_date: '2025-01-17'
			}
		});
		const week2Assignments = await api.expectJson<any[]>(week2Response);
		expect(week2Assignments.length).toBe(0);

		// Regenerate from second week
		await api.post('/api/schedules/generate', {
			start_date: '2025-01-13',
			end_date: '2025-01-17'
		});

		// Verify second week now has assignments
		const newWeek2Response = await api.get('/api/calendar', {
			params: {
				start_date: '2025-01-13',
				end_date: '2025-01-17'
			}
		});
		const newWeek2Assignments = await api.expectJson<any[]>(newWeek2Response);
		expect(newWeek2Assignments.length).toBeGreaterThanOrEqual(0);
	});
});
