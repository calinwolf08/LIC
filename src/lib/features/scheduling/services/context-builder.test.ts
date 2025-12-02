// @ts-nocheck
/**
 * ContextBuilder Unit Tests
 *
 * Tests for building scheduling context from database data
 */

import { describe, it, expect } from 'vitest';
import { buildSchedulingContext } from './context-builder';
import type {
	Students,
	Preceptors,
	Clerkships,
	PreceptorAvailability
} from '$lib/db/types';

describe('buildSchedulingContext()', () => {
	it('builds context with all required fields', () => {
		const students: Students[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: Clerkships[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				clerkship_type: 'outpatient',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const blackoutDates = ['2024-12-25', '2024-01-01'];
		const availabilityRecords: PreceptorAvailability[] = [];
		const startDate = '2024-01-01';
		const endDate = '2024-12-31';

		const context = buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			startDate,
			endDate
		);

		expect(context.students).toBe(students);
		expect(context.preceptors).toBe(preceptors);
		expect(context.clerkships).toBe(clerkships);
		expect(context.startDate).toBe(startDate);
		expect(context.endDate).toBe(endDate);
		expect(context.assignments).toEqual([]);
		expect(context.assignmentsByDate).toBeInstanceOf(Map);
		expect(context.assignmentsByStudent).toBeInstanceOf(Map);
		expect(context.assignmentsByPreceptor).toBeInstanceOf(Map);
		expect(context.studentRequirements).toBeInstanceOf(Map);
		expect(context.blackoutDates).toBeInstanceOf(Set);
		expect(context.preceptorAvailability).toBeInstanceOf(Map);
	});

	it('converts blackout dates array to Set', () => {
		const blackoutDates = ['2024-12-25', '2024-01-01', '2024-07-04'];

		const context = buildSchedulingContext([], [], [], blackoutDates, [], '2024-01-01', '2024-12-31');

		expect(context.blackoutDates).toBeInstanceOf(Set);
		expect(context.blackoutDates.size).toBe(3);
		expect(context.blackoutDates.has('2024-12-25')).toBe(true);
		expect(context.blackoutDates.has('2024-01-01')).toBe(true);
		expect(context.blackoutDates.has('2024-07-04')).toBe(true);
	});

	it('handles empty blackout dates', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.blackoutDates.size).toBe(0);
	});

	it('initializes empty availability maps for preceptors with records', () => {
		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			[],
			'2024-01-01',
			'2024-12-31'
		);

		// With no availability records, each preceptor has an empty date->site map
		expect(context.preceptorAvailability).toBeInstanceOf(Map);
		expect(context.preceptorAvailability.size).toBe(2);
		expect(context.preceptorAvailability.get('preceptor-1')?.size).toBe(0);
		expect(context.preceptorAvailability.get('preceptor-2')?.size).toBe(0);
	});

	it('populates preceptor availability from records with site info', () => {
		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailability[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		const availability = context.preceptorAvailability.get('preceptor-1')!;
		expect(availability).toBeInstanceOf(Map);
		expect(availability.size).toBe(2);
		expect(availability.has('2024-01-15')).toBe(true);
		expect(availability.has('2024-01-16')).toBe(true);
		expect(availability.get('2024-01-15')).toBe('site-1');
	});

	it('only includes available dates (is_available = 1)', () => {
		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailability[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-16',
				is_available: 0, // Not available
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		const availability = context.preceptorAvailability.get('preceptor-1')!;
		expect(availability.size).toBe(1);
		expect(availability.has('2024-01-15')).toBe(true);
		expect(availability.has('2024-01-16')).toBe(false);
	});

	it('handles availability for multiple preceptors', () => {
		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailability[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-2',
				site_id: 'site-1',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.preceptorAvailability.get('preceptor-1')?.has('2024-01-15')).toBe(true);
		expect(context.preceptorAvailability.get('preceptor-1')?.has('2024-01-16')).toBe(false);
		expect(context.preceptorAvailability.get('preceptor-2')?.has('2024-01-15')).toBe(false);
		expect(context.preceptorAvailability.get('preceptor-2')?.has('2024-01-16')).toBe(true);
	});

	it('ignores availability records for unknown preceptors', () => {
		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailability[] = [
			{
				id: '1',
				preceptor_id: 'unknown-preceptor',
				site_id: 'site-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		// Unknown preceptor's availability is filtered out
		expect(context.preceptorAvailability.has('unknown-preceptor')).toBe(false);
		// Only known preceptors have entries
		expect(context.preceptorAvailability.size).toBe(1);
		expect(context.preceptorAvailability.has('preceptor-1')).toBe(true);
	});

	it('initializes student requirements correctly', () => {
		const students: Students[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'student-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: Clerkships[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				clerkship_type: 'outpatient',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'clerkship-2',
				name: 'IM Clerkship',
				clerkship_type: 'inpatient',
				specialty: 'Internal Medicine',
				required_days: 10,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			students,
			[],
			clerkships,
			[],
			[],
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.studentRequirements.size).toBe(2);

		const student1Reqs = context.studentRequirements.get('student-1')!;
		expect(student1Reqs.get('clerkship-1')).toBe(5);
		expect(student1Reqs.get('clerkship-2')).toBe(10);

		const student2Reqs = context.studentRequirements.get('student-2')!;
		expect(student2Reqs.get('clerkship-1')).toBe(5);
		expect(student2Reqs.get('clerkship-2')).toBe(10);
	});

	it('initializes empty assignment tracking maps', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.assignmentsByDate).toBeInstanceOf(Map);
		expect(context.assignmentsByDate.size).toBe(0);

		expect(context.assignmentsByStudent).toBeInstanceOf(Map);
		expect(context.assignmentsByStudent.size).toBe(0);

		expect(context.assignmentsByPreceptor).toBeInstanceOf(Map);
		expect(context.assignmentsByPreceptor.size).toBe(0);
	});

	it('initializes empty assignments array', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.assignments).toEqual([]);
	});

	it('handles complex scenario with all data', () => {
		const students: Students[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'student-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const preceptors: Preceptors[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				health_system_id: null,
				phone: null,
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				health_system_id: null,
				phone: null,
				max_students: 2,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: Clerkships[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				clerkship_type: 'outpatient',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'clerkship-2',
				name: 'IM Clerkship',
				clerkship_type: 'inpatient',
				specialty: 'Internal Medicine',
				required_days: 10,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const blackoutDates = ['2024-12-25', '2024-01-01'];

		const availabilityRecords: PreceptorAvailability[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				site_id: 'site-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-2',
				site_id: 'site-1',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '3',
				preceptor_id: 'preceptor-2',
				site_id: 'site-1',
				date: '2024-01-17',
				is_available: 0,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		// Verify all components are initialized correctly
		expect(context.students).toHaveLength(2);
		expect(context.preceptors).toHaveLength(2);
		expect(context.clerkships).toHaveLength(2);
		expect(context.blackoutDates.size).toBe(2);
		expect(context.preceptorAvailability.size).toBe(2);
		expect(context.studentRequirements.size).toBe(2);
		expect(context.preceptorAvailability.get('preceptor-1')?.size).toBe(1);
		expect(context.preceptorAvailability.get('preceptor-2')?.size).toBe(1);
		expect(context.studentRequirements.get('student-1')?.size).toBe(2);
		expect(context.studentRequirements.get('student-2')?.size).toBe(2);
	});

	it('handles empty inputs gracefully', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.students).toEqual([]);
		expect(context.preceptors).toEqual([]);
		expect(context.clerkships).toEqual([]);
		expect(context.blackoutDates.size).toBe(0);
		expect(context.preceptorAvailability.size).toBe(0);
		expect(context.studentRequirements.size).toBe(0);
		expect(context.assignments).toEqual([]);
	});

	describe('Optional context data', () => {
		it('builds student onboarding map from optional data', () => {
			const optionalData = {
				studentOnboarding: [
					{
						student_id: 'student-1',
						health_system_id: 'hs-1',
						is_completed: 1
					},
					{
						student_id: 'student-1',
						health_system_id: 'hs-2',
						is_completed: 1
					},
					{
						student_id: 'student-2',
						health_system_id: 'hs-1',
						is_completed: 0
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.studentOnboarding).toBeInstanceOf(Map);
			expect(context.studentOnboarding?.size).toBe(1); // Only student-1 has completed onboarding

			const student1Systems = context.studentOnboarding?.get('student-1');
			expect(student1Systems).toBeInstanceOf(Set);
			expect(student1Systems?.size).toBe(2);
			expect(student1Systems?.has('hs-1')).toBe(true);
			expect(student1Systems?.has('hs-2')).toBe(true);

			// student-2 should not be in the map (is_completed = 0)
			expect(context.studentOnboarding?.has('student-2')).toBe(false);
		});

		it('builds preceptor clerkship associations map from optional data', () => {
			// New three-way association: preceptor -> site -> clerkships
			const optionalData = {
				preceptorSiteClerkships: [
					{
						preceptor_id: 'preceptor-1',
						site_id: 'site-1',
						clerkship_id: 'clerkship-1'
					},
					{
						preceptor_id: 'preceptor-1',
						site_id: 'site-1',
						clerkship_id: 'clerkship-2'
					},
					{
						preceptor_id: 'preceptor-2',
						site_id: 'site-2',
						clerkship_id: 'clerkship-1'
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.preceptorClerkshipAssociations).toBeInstanceOf(Map);
			expect(context.preceptorClerkshipAssociations?.size).toBe(2);

			// preceptorClerkshipAssociations is now Map<preceptorId, Map<siteId, Set<clerkshipIds>>>
			const preceptor1SiteMap = context.preceptorClerkshipAssociations?.get('preceptor-1');
			expect(preceptor1SiteMap).toBeInstanceOf(Map);
			const preceptor1Site1Clerkships = preceptor1SiteMap?.get('site-1');
			expect(preceptor1Site1Clerkships).toBeInstanceOf(Set);
			expect(preceptor1Site1Clerkships?.size).toBe(2);
			expect(preceptor1Site1Clerkships?.has('clerkship-1')).toBe(true);
			expect(preceptor1Site1Clerkships?.has('clerkship-2')).toBe(true);

			const preceptor2SiteMap = context.preceptorClerkshipAssociations?.get('preceptor-2');
			const preceptor2Site2Clerkships = preceptor2SiteMap?.get('site-2');
			expect(preceptor2Site2Clerkships?.size).toBe(1);
			expect(preceptor2Site2Clerkships?.has('clerkship-1')).toBe(true);
		});

		it('builds preceptor elective associations map from optional data', () => {
			const optionalData = {
				preceptorElectives: [
					{
						preceptor_id: 'preceptor-1',
						elective_requirement_id: 'req-1'
					},
					{
						preceptor_id: 'preceptor-1',
						elective_requirement_id: 'req-2'
					},
					{
						preceptor_id: 'preceptor-2',
						elective_requirement_id: 'req-1'
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.preceptorElectiveAssociations).toBeInstanceOf(Map);
			expect(context.preceptorElectiveAssociations?.size).toBe(2);

			const preceptor1Electives = context.preceptorElectiveAssociations?.get('preceptor-1');
			expect(preceptor1Electives).toBeInstanceOf(Set);
			expect(preceptor1Electives?.size).toBe(2);
			expect(preceptor1Electives?.has('req-1')).toBe(true);
			expect(preceptor1Electives?.has('req-2')).toBe(true);

			const preceptor2Electives = context.preceptorElectiveAssociations?.get('preceptor-2');
			expect(preceptor2Electives?.size).toBe(1);
			expect(preceptor2Electives?.has('req-1')).toBe(true);
		});

		it('includes health systems in context when provided', () => {
			const optionalData = {
				healthSystems: [
					{
						id: 'hs-1',
						name: 'City Hospital',
						description: null,
						location: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{
						id: 'hs-2',
						name: 'County Medical Center',
						description: null,
						location: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.healthSystems).toBeDefined();
			expect(context.healthSystems).toHaveLength(2);
			expect(context.healthSystems?.[0].name).toBe('City Hospital');
			expect(context.healthSystems?.[1].name).toBe('County Medical Center');
		});

		it('includes teams in context when provided', () => {
			const optionalData = {
				teams: [
					{
						id: 'team-1',
						name: 'Family Medicine Team A',
						health_system_id: 'hs-1',
						description: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{
						id: 'team-2',
						name: 'Internal Medicine Team B',
						health_system_id: 'hs-2',
						description: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.teams).toBeDefined();
			expect(context.teams).toHaveLength(2);
			expect(context.teams?.[0].name).toBe('Family Medicine Team A');
			expect(context.teams?.[1].name).toBe('Internal Medicine Team B');
		});

		it('handles all optional data together', () => {
			const optionalData = {
				healthSystems: [
					{
						id: 'hs-1',
						name: 'City Hospital',
						description: null,
						location: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				],
				teams: [
					{
						id: 'team-1',
						name: 'Team A',
						health_system_id: 'hs-1',
						description: null,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				],
				studentOnboarding: [
					{
						student_id: 'student-1',
						health_system_id: 'hs-1',
						is_completed: 1
					}
				],
				preceptorSiteClerkships: [
					{
						preceptor_id: 'preceptor-1',
						site_id: 'site-1',
						clerkship_id: 'clerkship-1'
					}
				],
				preceptorElectives: [
					{
						preceptor_id: 'preceptor-1',
						elective_requirement_id: 'req-1'
					}
				]
			};

			const context = buildSchedulingContext(
				[],
				[],
				[],
				[],
				[],
				'2024-01-01',
				'2024-12-31',
				optionalData
			);

			expect(context.healthSystems).toBeDefined();
			expect(context.teams).toBeDefined();
			expect(context.studentOnboarding).toBeDefined();
			expect(context.preceptorClerkshipAssociations).toBeDefined();
			expect(context.preceptorElectiveAssociations).toBeDefined();

			expect(context.healthSystems).toHaveLength(1);
			expect(context.teams).toHaveLength(1);
			expect(context.studentOnboarding?.size).toBe(1);
			expect(context.preceptorClerkshipAssociations?.size).toBe(1);
			expect(context.preceptorElectiveAssociations?.size).toBe(1);
		});

		it('does not include optional data when not provided', () => {
			const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

			expect(context.healthSystems).toBeUndefined();
			expect(context.teams).toBeUndefined();
			expect(context.studentOnboarding).toBeUndefined();
			expect(context.preceptorClerkshipAssociations).toBeUndefined();
			expect(context.preceptorElectiveAssociations).toBeUndefined();
		});
	});
});
