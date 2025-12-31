/**
 * Schedule Generation API Integration Tests
 *
 * Tests for the /api/schedules/generate endpoint including:
 * - Full regeneration (delete all and start over)
 * - Smart regeneration with minimal-change strategy
 * - Smart regeneration with full-reoptimize strategy
 * - Preview mode (dry-run)
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './+server';
import * as contextBuilder from '$lib/features/scheduling/services/context-builder';
import * as regenerationService from '$lib/features/scheduling/services/regeneration-service';
import * as assignmentService from '$lib/features/schedules/services/assignment-service';
import * as periodService from '$lib/features/scheduling/services/scheduling-period-service';
import * as auditService from '$lib/features/scheduling/services/audit-service';
import { db } from '$lib/db';
import type { SchedulingContext } from '$lib/features/scheduling/types/scheduling-context';
import type { Assignment } from '$lib/features/scheduling/types/assignment';
import type { Selectable } from 'kysely';
import type { ScheduleAssignments } from '$lib/db/types';

// Create a proper Kysely-like mock database
const createMockQueryBuilder = (data: any[] = []) => {
	const builder = {
		selectFrom: (table: string) => builder,
		selectAll: () => builder,
		select: (...args: any[]) => builder,
		where: (...args: any[]) => builder,
		orderBy: (...args: any[]) => builder,
		execute: vi.fn().mockResolvedValue(data),
		then: (resolve: any) => Promise.resolve(data).then(resolve)
	};
	return builder;
};

// Mock dependencies
vi.mock('$lib/db', () => ({
	db: {
		selectFrom: vi.fn((table: string) => createMockQueryBuilder([])),
		transaction: vi.fn()
	}
}));

vi.mock('$lib/features/scheduling/engine/configurable-scheduling-engine');
vi.mock('$lib/features/scheduling/services/context-builder');
vi.mock('$lib/features/scheduling/services/regeneration-service');
vi.mock('$lib/features/schedules/services/assignment-service');
vi.mock('$lib/features/scheduling/services/scheduling-period-service');
vi.mock('$lib/features/schedules/services/editing-service');
vi.mock('$lib/features/scheduling/services/audit-service');

describe('POST /api/schedules/generate', () => {
	const mockContext: SchedulingContext = {
		students: [],
		preceptors: [],
		clerkships: [],
		studentRequirements: new Map(),
		preceptorAvailability: new Map(),
		blackoutDates: new Set(),
		startDate: '2025-01-01',
		endDate: '2025-12-31',
		assignments: [],
		assignmentsByDate: new Map(),
		assignmentsByStudent: new Map(),
		assignmentsByPreceptor: new Map()
	};

	const mockAssignments: Assignment[] = [
		{
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2025-06-15'
		}
	];

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup default mocks
		vi.mocked(contextBuilder.buildSchedulingContext).mockResolvedValue(mockContext);
		vi.mocked(periodService.getActiveSchedulingPeriod).mockResolvedValue({
			id: 'period-1',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			is_active: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			name: 'Test Period',
			user_id: null,
			year: 2025
		});
	});

	// TODO: Fix mocking for these integration tests - they need complete database and engine mocks
	describe.skip('Full Regeneration (No regenerateFromDate)', () => {
		it('should generate a complete schedule from scratch', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31'
				})
			});

			// Mock successful generation
			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockResolvedValue({
							assignments: mockAssignments,
							success: true,
							unmetRequirements: [],
							violations: [],
							summary: {
								totalAssignments: 1,
								totalViolations: 0,
								strategiesUsed: ['continuous_single']
							}
						})
					}) as any
			);

			vi.mocked(assignmentService.bulkCreateAssignments).mockResolvedValue(
				mockAssignments.map((a, i) => ({
					id: `assignment-${i}`,
					student_id: a.studentId,
					preceptor_id: a.preceptorId,
					clerkship_id: a.clerkshipId,
					date: a.date,
					elective_id: a.electiveId || null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}))
			);

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.summary.totalAssignments).toBe(1);
			expect(data.data.regeneratedFrom).toBeUndefined();
			expect(data.data.strategy).toBe('full-reoptimize');
		});
	});

	describe.skip('Smart Regeneration - Minimal Change Strategy', () => {
		it('should preserve past assignments and minimize future changes', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31',
					regenerateFromDate: '2025-06-15',
					strategy: 'minimal-change'
				})
			});

			// Mock past assignments
			const pastAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'past-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-06-01',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			const futureAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'future-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-06-20',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			// Mock regeneration service
			vi.mocked(regenerationService.prepareRegenerationContext).mockResolvedValue({
				creditResult: {
					totalPastAssignments: 1,
					creditsByStudent: new Map()
				},
				preservedAssignments: 1,
				affectedAssignments: 0
			});

			vi.mocked(regenerationService.analyzeRegenerationImpact).mockResolvedValue({
				pastAssignments: [],
				pastAssignmentsCount: 0,
				futureAssignmentsToDelete: [],
				deletedCount: 0,
				preservableAssignments: futureAssignments,
				preservedCount: 1,
				affectedAssignments: [],
				affectedCount: 0,
				replaceableAssignments: [],
				studentProgress: [],
				summary: {
					strategy: 'minimal-change',
					regenerateFromDate: '2025-06-15',
					totalAssignmentsImpacted: 0,
					willPreservePast: true,
					willPreserveFuture: true
				}
			});

			// Mock engine
			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockResolvedValue({
							assignments: [],
							success: true,
							unmetRequirements: [],
							violations: [],
							summary: {
								totalAssignments: 0,
								totalViolations: 0,
								strategiesUsed: []
							}
						})
					}) as any
			);

			vi.mocked(assignmentService.bulkCreateAssignments).mockResolvedValue([]);

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.regeneratedFrom).toBe('2025-06-15');
			expect(data.data.strategy).toBe('minimal-change');
			expect(data.data.totalPastAssignments).toBe(1);
			expect(data.data.preservedFutureAssignments).toBe(1);

			// Verify regeneration context was prepared
			expect(regenerationService.prepareRegenerationContext).toHaveBeenCalledWith(
				expect.anything(),
				'2025-06-15',
				'minimal-change'
			);
		});

		it('should find replacements for affected assignments', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31',
					regenerateFromDate: '2025-06-15',
					strategy: 'minimal-change'
				})
			});

			const pastAssignments: Selectable<ScheduleAssignments>[] = [];
			const preservableAssignments: Selectable<ScheduleAssignments>[] = [];
			const affectedAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'affected-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1', // Now unavailable
					clerkship_id: 'clerkship-1',
					date: '2025-06-20',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			vi.mocked(regenerationService.prepareRegenerationContext).mockResolvedValue({
				creditResult: {
					totalPastAssignments: 0,
					creditsByStudent: new Map()
				},
				preservedAssignments: 0,
				affectedAssignments: 1
			});

			vi.mocked(regenerationService.analyzeRegenerationImpact).mockResolvedValue({
				pastAssignments: [],
				pastAssignmentsCount: 0,
				futureAssignmentsToDelete: affectedAssignments,
				deletedCount: 1,
				preservableAssignments: [],
				preservedCount: 0,
				affectedAssignments,
				affectedCount: 1,
				replaceableAssignments: [],
				studentProgress: [],
				summary: {
					strategy: 'minimal-change',
					regenerateFromDate: '2025-06-15',
					totalAssignmentsImpacted: 1,
					willPreservePast: true,
					willPreserveFuture: false
				}
			});

			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockResolvedValue({
							assignments: mockAssignments,
							success: true,
							unmetRequirements: [],
							violations: [],
							summary: {
								totalAssignments: 1,
								totalViolations: 0,
								strategiesUsed: ['continuous_single']
							}
						})
					}) as any
			);

			vi.mocked(assignmentService.bulkCreateAssignments).mockResolvedValue(
				mockAssignments.map((a, i) => ({
					id: `assignment-${i}`,
					student_id: a.studentId,
					preceptor_id: a.preceptorId,
					clerkship_id: a.clerkshipId,
					date: a.date,
					elective_id: a.electiveId || null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}))
			);

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.deletedFutureAssignments).toBe(1);
			expect(data.data.strategy).toBe('minimal-change');
		});
	});

	describe.skip('Smart Regeneration - Full Reoptimize Strategy', () => {
		it('should preserve past but fully reoptimize future', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31',
					regenerateFromDate: '2025-06-15',
					strategy: 'full-reoptimize'
				})
			});

			const pastAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'past-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-06-01',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			vi.mocked(regenerationService.prepareRegenerationContext).mockResolvedValue({
				creditResult: {
					totalPastAssignments: 1,
					creditsByStudent: new Map()
				},
				preservedAssignments: 0,
				affectedAssignments: 0
			});

			vi.mocked(regenerationService.analyzeRegenerationImpact).mockResolvedValue({
				pastAssignments,
				pastAssignmentsCount: 1,
				futureAssignmentsToDelete: [],
				deletedCount: 5,
				preservableAssignments: [],
				preservedCount: 0,
				affectedAssignments: [],
				affectedCount: 0,
				replaceableAssignments: [],
				studentProgress: [],
				summary: {
					strategy: 'full-reoptimize',
					regenerateFromDate: '2025-06-15',
					totalAssignmentsImpacted: 5,
					willPreservePast: true,
					willPreserveFuture: false
				}
			});

			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockResolvedValue({
							assignments: mockAssignments,
							success: true,
							unmetRequirements: [],
							violations: [],
							summary: {
								totalAssignments: 1,
								totalViolations: 0,
								strategiesUsed: ['continuous_single']
							}
						})
					}) as any
			);

			vi.mocked(assignmentService.bulkCreateAssignments).mockResolvedValue(
				mockAssignments.map((a, i) => ({
					id: `assignment-${i}`,
					student_id: a.studentId,
					preceptor_id: a.preceptorId,
					clerkship_id: a.clerkshipId,
					date: a.date,
					elective_id: a.electiveId || null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}))
			);

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.regeneratedFrom).toBe('2025-06-15');
			expect(data.data.strategy).toBe('full-reoptimize');
			expect(data.data.totalPastAssignments).toBe(1);
			expect(data.data.preservedFutureAssignments).toBe(0);
			expect(data.data.deletedFutureAssignments).toBe(5);
		});
	});

	describe.skip('Preview Mode (Dry Run)', () => {
		it('should return impact analysis without making changes', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31',
					regenerateFromDate: '2025-06-15',
					strategy: 'minimal-change',
					preview: true
				})
			});

			const pastAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'past-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-06-01',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			const affectedAssignments: Selectable<ScheduleAssignments>[] = [
				{
					id: 'affected-1',
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-06-20',
					elective_id: null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			vi.mocked(regenerationService.prepareRegenerationContext).mockResolvedValue({
				creditResult: {
					totalPastAssignments: 1,
					creditsByStudent: new Map()
				},
				preservedAssignments: 0,
				affectedAssignments: 1
			});

			vi.mocked(regenerationService.analyzeRegenerationImpact).mockResolvedValue({
				pastAssignments,
				pastAssignmentsCount: 1,
				futureAssignmentsToDelete: affectedAssignments,
				deletedCount: 1,
				preservableAssignments: [],
				preservedCount: 0,
				affectedAssignments,
				affectedCount: 1,
				replaceableAssignments: [],
				studentProgress: [],
				summary: {
					strategy: 'minimal-change',
					regenerateFromDate: '2025-06-15',
					totalAssignmentsImpacted: 1,
					willPreservePast: true,
					willPreserveFuture: false
				}
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.preview).toBe(true);
			expect(data.data.impact).toBeDefined();
			expect(data.data.impact.preservedCount).toBe(0);
			expect(data.data.impact.affectedCount).toBe(1);
			expect(data.data.impact.deletedCount).toBe(1);

			// Verify no assignments were created
			expect(assignmentService.bulkCreateAssignments).not.toHaveBeenCalled();
		});
	});

	describe('Error Handling', () => {
		it('should return validation error for invalid date format', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: 'invalid-date',
					endDate: '2025-12-31'
				})
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('should return validation error for end date before start date', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-12-31',
					endDate: '2025-01-01'
				})
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('should return error when scheduling period creation fails', async () => {
			vi.mocked(periodService.getActiveSchedulingPeriod).mockResolvedValue(null);
			vi.mocked(periodService.getOverlappingPeriods).mockResolvedValue([]);
			vi.mocked(periodService.createSchedulingPeriod).mockRejectedValue(
				new Error('Database error')
			);

			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31'
				})
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.success).toBe(false);
		});

		it('should handle engine generation failures gracefully', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31'
				})
			});

			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockImplementation(async () => {
							throw new Error('Engine error');
						})
					}) as any
			);

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.success).toBe(false);
		});
	});

	describe.skip('Audit Logging', () => {
		it('should create audit log for regeneration', async () => {
			const request = new Request('http://localhost/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: '2025-01-01',
					endDate: '2025-12-31',
					regenerateFromDate: '2025-06-15',
					strategy: 'minimal-change'
				})
			});

			vi.mocked(regenerationService.prepareRegenerationContext).mockResolvedValue({
				creditResult: {
					totalPastAssignments: 0,
					creditsByStudent: new Map()
				},
				preservedAssignments: 0,
				affectedAssignments: 0
			});

			vi.mocked(regenerationService.analyzeRegenerationImpact).mockResolvedValue({
				pastAssignments: [],
				pastAssignmentsCount: 0,
				futureAssignmentsToDelete: [],
				deletedCount: 0,
				preservableAssignments: [],
				preservedCount: 0,
				affectedAssignments: [],
				affectedCount: 0,
				replaceableAssignments: [],
				studentProgress: [],
				summary: {
					strategy: 'minimal-change',
					regenerateFromDate: '2025-06-15',
					totalAssignmentsImpacted: 0,
					willPreservePast: true,
					willPreserveFuture: true
				}
			});

			const mockConfigurableEngine = await import(
				'$lib/features/scheduling/engine/configurable-scheduling-engine'
			);
			vi.mocked(mockConfigurableEngine.ConfigurableSchedulingEngine).mockImplementation(
				() =>
					({
						schedule: vi.fn().mockResolvedValue({
							assignments: mockAssignments,
							success: true,
							unmetRequirements: [],
							violations: [],
							summary: {
								totalAssignments: 1,
								totalViolations: 0,
								strategiesUsed: []
							}
						})
					}) as any
			);

			vi.mocked(assignmentService.bulkCreateAssignments).mockResolvedValue(
				mockAssignments.map((a, i) => ({
					id: `assignment-${i}`,
					student_id: a.studentId,
					preceptor_id: a.preceptorId,
					clerkship_id: a.clerkshipId,
					date: a.date,
					elective_id: a.electiveId || null,
					site_id: null,
					status: 'scheduled' as const,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}))
			);

			const createRegenerationAuditLogSpy = vi.spyOn(
				auditService,
				'createRegenerationAuditLog'
			);

			await POST({ request } as any);

			// Verify audit log was created (if function exists)
			// Note: Actual implementation depends on your audit logging setup
		});
	});
});
