// @ts-nocheck
/**
 * Site-Based Scheduling Constraints Unit Tests
 *
 * Tests for site-based constraint implementations:
 * - SiteContinuityConstraint
 * - SiteAvailabilityConstraint
 * - SiteCapacityConstraint
 * - ValidSiteForClerkshipConstraint
 * - SamePreceptorTeamConstraint
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SiteContinuityConstraint } from './site-continuity.constraint';
import { SiteAvailabilityConstraint } from './site-availability.constraint';
import { SiteCapacityConstraint } from './site-capacity.constraint';
import { ValidSiteForClerkshipConstraint } from './valid-site-for-clerkship.constraint';
import { SamePreceptorTeamConstraint } from './same-preceptor-team.constraint';
import { ViolationTracker } from '../services/violation-tracker';
import type { Assignment, SchedulingContext } from '../types';
import type { Students, Preceptors, Clerkships, Sites, SiteCapacityRules } from '$lib/db/types';

describe('SiteContinuityConstraint', () => {
	let constraint: SiteContinuityConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new SiteContinuityConstraint('req-1', 'clerkship-1', true);
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site1: Sites = {
			id: 'site-1',
			name: 'City Hospital',
			health_system_id: 'hs-1',
			address: '123 Main St',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site2: Sites = {
			id: 'site-2',
			name: 'County Clinic',
			health_system_id: 'hs-1',
			address: '456 Oak Ave',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor2: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-2',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student],
			preceptors: [preceptor1, preceptor2],
			clerkships: [clerkship],
			sites: [site1, site2],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 10]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('SiteContinuity');
		expect(constraint.priority).toBe(3);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows first assignment at any site', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('allows second assignment at same site', () => {
		// First assignment at site-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment also at site-1
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment at different site when require_same_site is true', () => {
		// First assignment at site-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment at site-2 (different site)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);

		const violations = tracker.exportViolations();
		expect(violations[0]).toBeDefined();
		expect(violations[0].reason).toBeDefined();
		expect(violations[0].reason).toContain('must stay at');
		expect(violations[0].reason).toContain('City Hospital');
	});

	it('allows assignment at different site when require_same_site is false', () => {
		const flexibleConstraint = new SiteContinuityConstraint('req-1', 'clerkship-1', false);

		// First assignment at site-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment at site-2 (different site)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = flexibleConstraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('only applies to assignments for the specified clerkship', () => {
		// First assignment for different clerkship at site-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'other-clerkship',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment for our clerkship at site-2
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('SiteAvailabilityConstraint', () => {
	let constraint: SiteAvailabilityConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new SiteAvailabilityConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site1: Sites = {
			id: 'site-1',
			name: 'City Hospital',
			health_system_id: 'hs-1',
			address: '123 Main St',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		// Set up site availability
		const siteAvailability = new Map<string, Map<string, boolean>>();
		const site1Availability = new Map<string, boolean>();
		site1Availability.set('2024-01-15', true);
		site1Availability.set('2024-01-16', false); // Unavailable on this date
		siteAvailability.set('site-1', site1Availability);

		context = {
			students: [student],
			preceptors: [preceptor1],
			clerkships: [clerkship],
			sites: [site1],
			siteAvailability,
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 10]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('SiteAvailability');
		expect(constraint.priority).toBe(2);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows assignment when site is available', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15' // Site is available
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when site is unavailable', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16' // Site is unavailable
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);

		const violations = tracker.exportViolations();
		expect(violations[0]).toBeDefined();
		expect(violations[0].reason).toBeDefined();
		expect(violations[0].reason).toContain('not available');
		expect(violations[0].reason).toContain('City Hospital');
	});

	it('allows assignment when availability data is not present', () => {
		const contextWithoutAvailability = {
			...context,
			siteAvailability: undefined
		};

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(assignment, contextWithoutAvailability, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('allows assignment when date has no availability record (defaults to available)', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-20' // No availability record
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('SiteCapacityConstraint', () => {
	let constraint: SiteCapacityConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new SiteCapacityConstraint();
		tracker = new ViolationTracker();

		const student1: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: Students = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site1: Sites = {
			id: 'site-1',
			name: 'City Hospital',
			health_system_id: 'hs-1',
			address: '123 Main St',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		// Set up site capacity rules
		const capacityRule: SiteCapacityRules = {
			id: 'rule-1',
			site_id: 'site-1',
			clerkship_id: null,
			requirement_type: null,
			max_students_per_day: 2,
			max_students_per_year: 5,
			max_students_per_block: null,
			max_blocks_per_year: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const siteCapacityRules = new Map<string, SiteCapacityRules[]>();
		siteCapacityRules.set('site-1', [capacityRule]);

		context = {
			students: [student1, student2],
			preceptors: [preceptor1],
			clerkships: [clerkship],
			sites: [site1],
			siteCapacityRules,
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 10]])],
				['student-2', new Map([['clerkship-1', 10]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('SiteCapacity');
		expect(constraint.priority).toBe(4);
		expect(constraint.bypassable).toBe(true);
	});

	it('allows assignment when daily capacity is not exceeded', () => {
		// One student already assigned on this date at this site
		const existingAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [existingAssignment]);

		// Second student assignment (should still be within capacity of 2)
		const newAssignment: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(newAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when daily capacity is exceeded', () => {
		// Two students already assigned on this date at this site (max capacity)
		const existingAssignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const existingAssignment2: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [existingAssignment1]);
		context.assignmentsByStudent.set('student-2', [existingAssignment2]);

		// Third student trying to be assigned (exceeds capacity)
		const newStudent: Students = {
			id: 'student-3',
			name: 'Bob Johnson',
			email: 'bob@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};
		context.students.push(newStudent);

		const newAssignment: Assignment = {
			studentId: 'student-3',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(newAssignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);

		const violations = tracker.exportViolations();
		expect(violations[0]).toBeDefined();
		expect(violations[0].reason).toBeDefined();
		expect(violations[0].reason).toContain('daily capacity');
	});

	it('allows assignment when capacity rules are not defined', () => {
		const contextWithoutRules = {
			...context,
			siteCapacityRules: undefined
		};

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, contextWithoutRules, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('ValidSiteForClerkshipConstraint', () => {
	let constraint: ValidSiteForClerkshipConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new ValidSiteForClerkshipConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site1: Sites = {
			id: 'site-1',
			name: 'City Hospital',
			health_system_id: 'hs-1',
			address: '123 Main St',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const site2: Sites = {
			id: 'site-2',
			name: 'County Clinic',
			health_system_id: 'hs-1',
			address: '456 Oak Ave',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor2: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-2',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		// Set up three-way associations: preceptor -> site -> clerkships
		const preceptorClerkshipAssociations = new Map<string, Map<string, Set<string>>>();
		const preceptor1Associations = new Map<string, Set<string>>();
		preceptor1Associations.set('site-1', new Set(['clerkship-1']));
		preceptorClerkshipAssociations.set('preceptor-1', preceptor1Associations);

		// Preceptor 2 is NOT associated with clerkship-1 at site-2
		const preceptor2Associations = new Map<string, Set<string>>();
		preceptor2Associations.set('site-2', new Set([])); // Empty set - no associations
		preceptorClerkshipAssociations.set('preceptor-2', preceptor2Associations);

		context = {
			students: [student],
			preceptors: [preceptor1, preceptor2],
			clerkships: [clerkship],
			sites: [site1, site2],
			preceptorClerkshipAssociations,
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 10]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('ValidSiteForClerkship');
		expect(constraint.priority).toBe(1);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows assignment when preceptor is associated with clerkship at site', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when preceptor is not associated with clerkship at site', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2', // Not associated with clerkship-1
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);

		const violations = tracker.exportViolations();
		expect(violations[0]).toBeDefined();
		expect(violations[0].reason).toBeDefined();
		expect(violations[0].reason).toContain('not authorized');
	});

	it('allows assignment when association data is not present', () => {
		const contextWithoutAssociations = {
			...context,
			preceptorClerkshipAssociations: undefined,
			clerkshipSites: undefined
		};

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, contextWithoutAssociations, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('SamePreceptorTeamConstraint', () => {
	let constraint: SamePreceptorTeamConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new SamePreceptorTeamConstraint('req-1', 'clerkship-1', true);
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor2: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor3: Preceptors = {
			id: 'preceptor-3',
			name: 'Dr. Brown',
			email: 'brown@example.com',
			specialty: 'Family Medicine',
			max_students: 2,
			site_id: 'site-1',
			health_system_id: 'hs-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		// Set up preceptor team memberships
		const preceptorTeams = new Map<string, Set<string>>();
		preceptorTeams.set('preceptor-1', new Set(['team-1']));
		preceptorTeams.set('preceptor-2', new Set(['team-1'])); // Same team as preceptor-1
		preceptorTeams.set('preceptor-3', new Set(['team-2'])); // Different team

		context = {
			students: [student],
			preceptors: [preceptor1, preceptor2, preceptor3],
			clerkships: [clerkship],
			preceptorTeams,
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 10]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('SamePreceptorTeam');
		expect(constraint.priority).toBe(3);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows first assignment with any team', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('allows second assignment with preceptor from same team', () => {
		// First assignment with preceptor-1 (team-1)
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment with preceptor-2 (also team-1)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment with preceptor from different team when require_same_team is true', () => {
		// First assignment with preceptor-1 (team-1)
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment with preceptor-3 (team-2, different team)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-3',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);

		const violations = tracker.exportViolations();
		expect(violations[0]).toBeDefined();
		expect(violations[0].reason).toBeDefined();
		expect(violations[0].reason).toContain('must stay with');
	});

	it('allows assignment with preceptor from different team when require_same_team is false', () => {
		const flexibleConstraint = new SamePreceptorTeamConstraint('req-1', 'clerkship-1', false);

		// First assignment with preceptor-1 (team-1)
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment with preceptor-3 (team-2, different team)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-3',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = flexibleConstraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('only applies to assignments for the specified clerkship', () => {
		// First assignment for different clerkship with preceptor-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'other-clerkship',
			date: '2024-01-15'
		};

		context.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment for our clerkship with preceptor-3 (different team)
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-3',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('allows assignment when team data is not present', () => {
		const contextWithoutTeams = {
			...context,
			preceptorTeams: undefined
		};

		// First assignment with preceptor-1
		const firstAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		contextWithoutTeams.assignmentsByStudent.set('student-1', [firstAssignment]);

		// Second assignment with preceptor-3
		const secondAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-3',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(secondAssignment, contextWithoutTeams, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});
