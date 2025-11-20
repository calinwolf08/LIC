// @ts-nocheck
/**
 * ConstraintFactory Unit Tests
 *
 * Tests for the ConstraintFactory service that dynamically builds constraints from database configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConstraintFactory } from './constraint-factory';
import { HealthSystemContinuityConstraint } from '../constraints/health-system-continuity.constraint';
import { StudentOnboardingConstraint } from '../constraints/student-onboarding.constraint';
import { PreceptorClerkshipAssociationConstraint } from '../constraints/preceptor-clerkship-association.constraint';
import { BlackoutDateConstraint } from '../constraints/blackout-date.constraint';
import { NoDoubleBookingConstraint } from '../constraints/no-double-booking.constraint';
import { SpecialtyMatchConstraint } from '../constraints/specialty-match.constraint';
import type { SchedulingContext } from '../types';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

// Mock database
const createMockDb = () => {
	const mockSelectFrom = (table: string) => {
		const mockQuery = {
			selectAll: () => mockQuery,
			select: () => mockQuery,
			where: () => mockQuery,
			execute: async () => [],
			executeTakeFirst: async () => null
		};
		return mockQuery;
	};

	return {
		selectFrom: mockSelectFrom
	} as unknown as Kysely<DB>;
};

describe('ConstraintFactory', () => {
	let factory: ConstraintFactory;
	let mockDb: Kysely<DB>;
	let context: SchedulingContext;

	beforeEach(() => {
		mockDb = createMockDb();
		factory = new ConstraintFactory(mockDb);

		context = {
			students: [],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map(),
			blackoutDates: new Set(),
			preceptorAvailability: new Map(),
			startDate: '2024-01-01',
			endDate: '2024-12-31'
		};
	});

	describe('buildConstraints', () => {
		it('always returns base constraints', async () => {
			mockDb.selectFrom = vi.fn((table) => ({
				selectAll: () => ({
					where: () => ({
						execute: async () => []
					})
				}),
				select: () => ({
					where: () => ({
						executeTakeFirst: async () => null
					})
				})
			})) as any;

			const constraints = await factory.buildConstraints([], context);

			// Should have 3 base constraints
			expect(constraints.length).toBeGreaterThanOrEqual(3);

			const names = constraints.map((c) => c.name);
			expect(names).toContain('BlackoutDate');
			expect(names).toContain('NoDoubleBooking');
			expect(names).toContain('SpecialtyMatch');
		});

		it('builds HealthSystemContinuityConstraint when health_system_rule is enforce_same_system', async () => {
			const mockRequirement = {
				id: 'req-1',
				clerkship_id: 'clerkship-1',
				requirement_type: 'outpatient',
				required_days: 5,
				allow_cross_system: 0,
				override_mode: 'inherit',
				override_assignment_strategy: null,
				override_health_system_rule: null,
				override_block_length_days: null,
				override_allow_split_assignments: null,
				override_preceptor_continuity_preference: null,
				override_team_continuity_preference: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			const mockOutpatientDefaults = {
				assignment_strategy: 'continuous_single',
				health_system_rule: 'enforce_same_system',
				allow_teams: 0,
				allow_fallbacks: 0,
				fallback_allow_cross_system: 0,
				fallback_requires_approval: 0,
				default_max_students_per_day: 1,
				default_max_students_per_year: 1,
				id: 'default-1',
				school_id: 'default',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								execute: async () => [mockRequirement]
							})
						})
					};
				}
				if (table === 'global_outpatient_defaults') {
					return {
						selectAll: () => ({
							where: () => ({
								executeTakeFirst: async () => mockOutpatientDefaults
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			const constraints = await factory.buildConstraints(['clerkship-1'], context);

			const hasHealthSystemConstraint = constraints.some(
				(c) => c instanceof HealthSystemContinuityConstraint
			);
			expect(hasHealthSystemConstraint).toBe(true);
		});

		it('builds StudentOnboardingConstraint when context has onboarding data', async () => {
			const mockRequirement = {
				id: 'req-1',
				clerkship_id: 'clerkship-1',
				requirement_type: 'outpatient',
				required_days: 5,
				allow_cross_system: 0,
				override_mode: 'inherit',
				override_assignment_strategy: null,
				override_health_system_rule: null,
				override_block_length_days: null,
				override_allow_split_assignments: null,
				override_preceptor_continuity_preference: null,
				override_team_continuity_preference: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								execute: async () => [mockRequirement]
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			context.studentOnboarding = new Map([['student-1', new Set(['hs-1'])]]);

			const constraints = await factory.buildConstraints(['clerkship-1'], context);

			const hasOnboardingConstraint = constraints.some(
				(c) => c instanceof StudentOnboardingConstraint
			);
			expect(hasOnboardingConstraint).toBe(true);
		});

		it('builds PreceptorClerkshipAssociationConstraint when context has association data', async () => {
			const mockRequirement = {
				id: 'req-1',
				clerkship_id: 'clerkship-1',
				requirement_type: 'inpatient',
				required_days: 5,
				allow_cross_system: 0,
				override_mode: 'inherit',
				override_assignment_strategy: null,
				override_health_system_rule: null,
				override_block_length_days: null,
				override_allow_split_assignments: null,
				override_preceptor_continuity_preference: null,
				override_team_continuity_preference: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								execute: async () => [mockRequirement]
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			context.preceptorClerkshipAssociations = new Map([['preceptor-1', new Set(['clerkship-1'])]]);

			const constraints = await factory.buildConstraints(['clerkship-1'], context);

			const hasAssociationConstraint = constraints.some(
				(c) => c instanceof PreceptorClerkshipAssociationConstraint
			);
			expect(hasAssociationConstraint).toBe(true);
		});

		it('sorts constraints by priority', async () => {
			mockDb.selectFrom = vi.fn((table) => ({
				selectAll: () => ({
					where: () => ({
						execute: async () => []
					})
				}),
				select: () => ({
					where: () => ({
						executeTakeFirst: async () => null
					})
				})
			})) as any;

			const constraints = await factory.buildConstraints([], context);

			// Check that constraints are sorted by priority
			for (let i = 1; i < constraints.length; i++) {
				const prev = constraints[i - 1].priority || 99;
				const curr = constraints[i].priority || 99;
				expect(prev).toBeLessThanOrEqual(curr);
			}
		});

		it('handles multiple requirements for different clerkships', async () => {
			const mockRequirements = [
				{
					id: 'req-1',
					clerkship_id: 'clerkship-1',
					requirement_type: 'outpatient',
					required_days: 5,
					allow_cross_system: 0,
					override_mode: 'inherit',
					override_assignment_strategy: null,
					override_health_system_rule: null,
					override_block_length_days: null,
					override_allow_split_assignments: null,
					override_preceptor_continuity_preference: null,
					override_team_continuity_preference: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				},
				{
					id: 'req-2',
					clerkship_id: 'clerkship-2',
					requirement_type: 'inpatient',
					required_days: 10,
					allow_cross_system: 1,
					override_mode: 'inherit',
					override_assignment_strategy: null,
					override_health_system_rule: null,
					override_block_length_days: null,
					override_allow_split_assignments: null,
					override_preceptor_continuity_preference: null,
					override_team_continuity_preference: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								execute: async () => mockRequirements
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			context.studentOnboarding = new Map();
			context.preceptorClerkshipAssociations = new Map();

			const constraints = await factory.buildConstraints(
				['clerkship-1', 'clerkship-2'],
				context
			);

			expect(constraints.length).toBeGreaterThanOrEqual(3); // At least base constraints
		});

		it('handles requirements without IDs by skipping them', async () => {
			const mockRequirements = [
				{
					id: null,
					clerkship_id: 'clerkship-1',
					requirement_type: 'outpatient',
					required_days: 5,
					allow_cross_system: 0,
					override_mode: 'inherit',
					override_assignment_strategy: null,
					override_health_system_rule: null,
					override_block_length_days: null,
					override_allow_split_assignments: null,
					override_preceptor_continuity_preference: null,
					override_team_continuity_preference: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								execute: async () => mockRequirements
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			context.studentOnboarding = new Map();

			const constraints = await factory.buildConstraints(['clerkship-1'], context);

			// Should only have base constraints, no onboarding constraint
			const hasOnboardingConstraint = constraints.some(
				(c) => c instanceof StudentOnboardingConstraint
			);
			expect(hasOnboardingConstraint).toBe(false);
		});
	});

	describe('getResolvedConfiguration', () => {
		it('returns null when requirement is not found', async () => {
			mockDb.selectFrom = vi.fn((table) => ({
				selectAll: () => ({
					where: () => ({
						executeTakeFirst: async () => null
					})
				})
			})) as any;

			const config = await factory.getResolvedConfiguration('nonexistent-req');
			expect(config).toBeNull();
		});

		it('returns resolved configuration with global defaults', async () => {
			const mockRequirement = {
				id: 'req-1',
				clerkship_id: 'clerkship-1',
				requirement_type: 'outpatient',
				required_days: 5,
				allow_cross_system: 0,
				override_mode: 'inherit',
				override_assignment_strategy: null,
				override_health_system_rule: null,
				override_block_length_days: null,
				override_allow_split_assignments: null,
				override_preceptor_continuity_preference: null,
				override_team_continuity_preference: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			const mockOutpatientDefaults = {
				assignment_strategy: 'continuous_single',
				health_system_rule: 'enforce_same_system',
				allow_teams: 0,
				allow_fallbacks: 0,
				fallback_allow_cross_system: 0,
				fallback_requires_approval: 0,
				default_max_students_per_day: 1,
				default_max_students_per_year: 1,
				id: 'default-1',
				school_id: 'default',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								executeTakeFirst: async () => mockRequirement
							})
						})
					};
				}
				if (table === 'global_outpatient_defaults') {
					return {
						selectAll: () => ({
							where: () => ({
								executeTakeFirst: async () => mockOutpatientDefaults
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			const config = await factory.getResolvedConfiguration('req-1');

			expect(config).not.toBeNull();
			expect(config?.requirementId).toBe('req-1');
			expect(config?.clerkshipId).toBe('clerkship-1');
			expect(config?.requirementType).toBe('outpatient');
			expect(config?.requiredDays).toBe(5);
			expect(config?.allowCrossSystem).toBe(false);
			expect(config?.assignmentStrategy).toBe('continuous_single');
			expect(config?.healthSystemRule).toBe('enforce_same_system');
		});

		it('applies requirement overrides when override_mode is override_fields', async () => {
			const mockRequirement = {
				id: 'req-1',
				clerkship_id: 'clerkship-1',
				requirement_type: 'inpatient',
				required_days: 10,
				allow_cross_system: 1,
				override_mode: 'override_fields',
				override_assignment_strategy: 'flexible',
				override_health_system_rule: 'allow_cross_system',
				override_block_length_days: 5,
				override_allow_split_assignments: 1,
				override_preceptor_continuity_preference: 'prefer_different',
				override_team_continuity_preference: 'prefer_different',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			const mockInpatientDefaults = {
				assignment_strategy: 'continuous_single',
				health_system_rule: 'enforce_same_system',
				allow_teams: 0,
				allow_fallbacks: 0,
				fallback_allow_cross_system: 0,
				fallback_requires_approval: 0,
				default_max_students_per_day: 1,
				default_max_students_per_year: 1,
				default_max_students_per_block: 1,
				default_max_blocks_per_year: 1,
				block_size_days: 7,
				allow_partial_blocks: 0,
				prefer_continuous_blocks: 1,
				team_size_min: null,
				team_size_max: null,
				team_require_same_health_system: null,
				team_require_same_specialty: null,
				id: 'default-1',
				school_id: 'default',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkship_requirements') {
					return {
						selectAll: () => ({
							where: () => ({
								executeTakeFirst: async () => mockRequirement
							})
						})
					};
				}
				if (table === 'global_inpatient_defaults') {
					return {
						selectAll: () => ({
							where: () => ({
								executeTakeFirst: async () => mockInpatientDefaults
							})
						})
					};
				}
				return {
					selectAll: () => ({
						where: () => ({
							executeTakeFirst: async () => null
						})
					})
				};
			}) as any;

			const config = await factory.getResolvedConfiguration('req-1');

			expect(config).not.toBeNull();
			expect(config?.assignmentStrategy).toBe('flexible');
			expect(config?.healthSystemRule).toBe('allow_cross_system');
			expect(config?.blockLengthDays).toBe(5);
			expect(config?.allowSplitAssignments).toBe(true);
			expect(config?.preceptorContinuityPreference).toBe('prefer_different');
			expect(config?.teamContinuityPreference).toBe('prefer_different');
		});
	});
});
