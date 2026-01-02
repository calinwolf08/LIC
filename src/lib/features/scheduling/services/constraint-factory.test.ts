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
						execute: async () => [],
						executeTakeFirst: async () => null
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
			const mockClerkship = {
				id: 'clerkship-1',
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 5
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
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								execute: async () => [mockClerkship]
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
			const mockClerkship = {
				id: 'clerkship-1',
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 5
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								execute: async () => [mockClerkship]
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
			const mockClerkship = {
				id: 'clerkship-1',
				name: 'Internal Medicine',
				clerkship_type: 'inpatient',
				required_days: 5
			};

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								execute: async () => [mockClerkship]
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
						execute: async () => [],
						executeTakeFirst: async () => null
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

		it('handles multiple clerkships', async () => {
			const mockClerkships = [
				{
					id: 'clerkship-1',
					name: 'Family Medicine',
					clerkship_type: 'outpatient',
					required_days: 5
				},
				{
					id: 'clerkship-2',
					name: 'Internal Medicine',
					clerkship_type: 'inpatient',
					required_days: 10
				}
			];

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								execute: async () => mockClerkships
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

		it('handles clerkships without IDs by skipping them', async () => {
			const mockClerkships = [
				{
					id: null,
					name: 'Family Medicine',
					clerkship_type: 'outpatient',
					required_days: 5
				}
			];

			mockDb.selectFrom = vi.fn((table) => {
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								execute: async () => mockClerkships
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

			// Should only have base constraints, no onboarding constraint (clerkship has null ID)
			const hasOnboardingConstraint = constraints.some(
				(c) => c instanceof StudentOnboardingConstraint
			);
			expect(hasOnboardingConstraint).toBe(false);
		});
	});

	describe('getResolvedConfiguration', () => {
		/**
		 * NOTE: In the new model, getResolvedConfiguration queries the clerkships table directly
		 * instead of the clerkship_requirements table. The clerkship's clerkship_type field
		 * determines the configuration behavior.
		 */
		it('returns null when clerkship is not found', async () => {
			mockDb.selectFrom = vi.fn((table) => ({
				select: () => ({
					where: () => ({
						executeTakeFirst: async () => null
					})
				}),
				selectAll: () => ({
					where: () => ({
						executeTakeFirst: async () => null
					})
				})
			})) as any;

			const config = await factory.getResolvedConfiguration('nonexistent-clerkship');
			expect(config).toBeNull();
		});

		it('returns resolved configuration with global defaults for outpatient clerkship', async () => {
			const mockClerkship = {
				id: 'clerkship-1',
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 20
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
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								executeTakeFirst: async () => mockClerkship
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

			const config = await factory.getResolvedConfiguration('clerkship-1');

			expect(config).not.toBeNull();
			expect(config?.clerkshipId).toBe('clerkship-1');
			expect(config?.clerkshipType).toBe('outpatient');
			expect(config?.requiredDays).toBe(20);
			expect(config?.allowCrossSystem).toBe(false);
			expect(config?.assignmentStrategy).toBe('continuous_single');
			expect(config?.healthSystemRule).toBe('enforce_same_system');
		});

		it('returns resolved configuration with global defaults for inpatient clerkship', async () => {
			const mockClerkship = {
				id: 'clerkship-1',
				name: 'Internal Medicine',
				clerkship_type: 'inpatient',
				required_days: 28
			};

			const mockInpatientDefaults = {
				assignment_strategy: 'block_based',
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
				if (table === 'clerkships') {
					return {
						select: () => ({
							where: () => ({
								executeTakeFirst: async () => mockClerkship
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

			const config = await factory.getResolvedConfiguration('clerkship-1');

			expect(config).not.toBeNull();
			expect(config?.clerkshipId).toBe('clerkship-1');
			expect(config?.clerkshipType).toBe('inpatient');
			expect(config?.requiredDays).toBe(28);
			expect(config?.assignmentStrategy).toBe('block_based');
			expect(config?.healthSystemRule).toBe('enforce_same_system');
		});
	});
});
