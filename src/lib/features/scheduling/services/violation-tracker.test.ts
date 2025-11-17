// @ts-nocheck
/**
 * ViolationTracker Unit Tests
 *
 * Tests for violation tracking and aggregation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ViolationTracker } from './violation-tracker';
import type { Assignment } from '../types';

describe('ViolationTracker', () => {
	let tracker: ViolationTracker;
	let sampleAssignment: Assignment;

	beforeEach(() => {
		tracker = new ViolationTracker();
		sampleAssignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};
	});

	describe('recordViolation()', () => {
		it('records a basic violation', () => {
			tracker.recordViolation('TestConstraint', sampleAssignment, 'Test reason');

			expect(tracker.getTotalViolations()).toBe(1);
			const violations = tracker.exportViolations();
			expect(violations).toHaveLength(1);
			expect(violations[0].constraintName).toBe('TestConstraint');
			expect(violations[0].reason).toBe('Test reason');
		});

		it('records violation with metadata', () => {
			const metadata = { extra: 'data', count: 5 };
			tracker.recordViolation('TestConstraint', sampleAssignment, 'Test reason', metadata);

			const violations = tracker.exportViolations();
			expect(violations[0].metadata).toEqual(metadata);
		});

		it('records multiple violations', () => {
			tracker.recordViolation('Constraint1', sampleAssignment, 'Reason 1');
			tracker.recordViolation('Constraint2', sampleAssignment, 'Reason 2');
			tracker.recordViolation('Constraint1', sampleAssignment, 'Reason 3');

			expect(tracker.getTotalViolations()).toBe(3);
		});

		it('includes timestamp in violation', () => {
			const before = new Date();
			tracker.recordViolation('TestConstraint', sampleAssignment, 'Test reason');
			const after = new Date();

			const violations = tracker.exportViolations();
			expect(violations[0].timestamp).toBeInstanceOf(Date);
			expect(violations[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(violations[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
		});
	});

	describe('getTotalViolations()', () => {
		it('returns 0 for new tracker', () => {
			expect(tracker.getTotalViolations()).toBe(0);
		});

		it('returns correct count after recording violations', () => {
			tracker.recordViolation('C1', sampleAssignment, 'R1');
			tracker.recordViolation('C2', sampleAssignment, 'R2');
			tracker.recordViolation('C3', sampleAssignment, 'R3');

			expect(tracker.getTotalViolations()).toBe(3);
		});
	});

	describe('getStatsByConstraint()', () => {
		it('returns empty map for no violations', () => {
			const stats = tracker.getStatsByConstraint();
			expect(stats.size).toBe(0);
		});

		it('aggregates violations by constraint', () => {
			tracker.recordViolation('ConstraintA', sampleAssignment, 'R1');
			tracker.recordViolation('ConstraintB', sampleAssignment, 'R2');
			tracker.recordViolation('ConstraintA', sampleAssignment, 'R3');

			const stats = tracker.getStatsByConstraint();
			expect(stats.size).toBe(2);
			expect(stats.get('ConstraintA')?.count).toBe(2);
			expect(stats.get('ConstraintB')?.count).toBe(1);
		});

		it('tracks affected students, dates, and preceptors', () => {
			const assignment1: Assignment = { studentId: 's1', preceptorId: 'p1', clerkshipId: 'c1', date: '2024-01-01' };
			const assignment2: Assignment = { studentId: 's2', preceptorId: 'p1', clerkshipId: 'c1', date: '2024-01-02' };
			const assignment3: Assignment = { studentId: 's1', preceptorId: 'p2', clerkshipId: 'c1', date: '2024-01-01' };

			tracker.recordViolation('TestConstraint', assignment1, 'R1');
			tracker.recordViolation('TestConstraint', assignment2, 'R2');
			tracker.recordViolation('TestConstraint', assignment3, 'R3');

			const stats = tracker.getStatsByConstraint();
			const testStats = stats.get('TestConstraint')!;

			expect(testStats.summary?.affectedStudents.size).toBe(2);
			expect(testStats.summary?.affectedStudents.has('s1')).toBe(true);
			expect(testStats.summary?.affectedStudents.has('s2')).toBe(true);

			expect(testStats.summary?.affectedPreceptors.size).toBe(2);
			expect(testStats.summary?.affectedPreceptors.has('p1')).toBe(true);
			expect(testStats.summary?.affectedPreceptors.has('p2')).toBe(true);

			expect(testStats.summary?.affectedDates.size).toBe(2);
			expect(testStats.summary?.affectedDates.has('2024-01-01')).toBe(true);
			expect(testStats.summary?.affectedDates.has('2024-01-02')).toBe(true);
		});

		it('includes all violations in stats', () => {
			tracker.recordViolation('TestConstraint', sampleAssignment, 'R1');
			tracker.recordViolation('TestConstraint', sampleAssignment, 'R2');

			const stats = tracker.getStatsByConstraint();
			const testStats = stats.get('TestConstraint')!;

			expect(testStats.violations).toHaveLength(2);
			expect(testStats.violations[0].reason).toBe('R1');
			expect(testStats.violations[1].reason).toBe('R2');
		});
	});

	describe('getTopViolations()', () => {
		it('returns empty array for no violations', () => {
			const top = tracker.getTopViolations(5);
			expect(top).toEqual([]);
		});

		it('returns violations sorted by count (descending)', () => {
			// Record violations with different frequencies
			tracker.recordViolation('C1', sampleAssignment, 'R');
			tracker.recordViolation('C2', sampleAssignment, 'R');
			tracker.recordViolation('C2', sampleAssignment, 'R');
			tracker.recordViolation('C3', sampleAssignment, 'R');
			tracker.recordViolation('C3', sampleAssignment, 'R');
			tracker.recordViolation('C3', sampleAssignment, 'R');

			const top = tracker.getTopViolations(10);

			expect(top).toHaveLength(3);
			expect(top[0].constraintName).toBe('C3');
			expect(top[0].count).toBe(3);
			expect(top[1].constraintName).toBe('C2');
			expect(top[1].count).toBe(2);
			expect(top[2].constraintName).toBe('C1');
			expect(top[2].count).toBe(1);
		});

		it('limits results to N items', () => {
			tracker.recordViolation('C1', sampleAssignment, 'R');
			tracker.recordViolation('C2', sampleAssignment, 'R');
			tracker.recordViolation('C3', sampleAssignment, 'R');
			tracker.recordViolation('C4', sampleAssignment, 'R');
			tracker.recordViolation('C5', sampleAssignment, 'R');

			const top = tracker.getTopViolations(3);
			expect(top).toHaveLength(3);
		});

		it('defaults to 10 items', () => {
			for (let i = 0; i < 15; i++) {
				tracker.recordViolation(`C${i}`, sampleAssignment, 'R');
			}

			const top = tracker.getTopViolations();
			expect(top).toHaveLength(10);
		});
	});

	describe('clear()', () => {
		it('removes all violations', () => {
			tracker.recordViolation('C1', sampleAssignment, 'R1');
			tracker.recordViolation('C2', sampleAssignment, 'R2');
			tracker.recordViolation('C3', sampleAssignment, 'R3');

			expect(tracker.getTotalViolations()).toBe(3);

			tracker.clear();

			expect(tracker.getTotalViolations()).toBe(0);
			expect(tracker.exportViolations()).toEqual([]);
			expect(tracker.getStatsByConstraint().size).toBe(0);
		});

		it('allows recording new violations after clear', () => {
			tracker.recordViolation('C1', sampleAssignment, 'R1');
			tracker.clear();
			tracker.recordViolation('C2', sampleAssignment, 'R2');

			expect(tracker.getTotalViolations()).toBe(1);
			const violations = tracker.exportViolations();
			expect(violations[0].constraintName).toBe('C2');
		});
	});

	describe('exportViolations()', () => {
		it('returns copy of violations array', () => {
			tracker.recordViolation('C1', sampleAssignment, 'R1');

			const exported1 = tracker.exportViolations();
			tracker.recordViolation('C2', sampleAssignment, 'R2');
			const exported2 = tracker.exportViolations();

			// First export should not be affected by new violations
			expect(exported1).toHaveLength(1);
			expect(exported2).toHaveLength(2);
		});

		it('returns all violation details', () => {
			const metadata = { detail: 'test' };
			tracker.recordViolation('TestConstraint', sampleAssignment, 'Test reason', metadata);

			const violations = tracker.exportViolations();
			expect(violations[0].constraintName).toBe('TestConstraint');
			expect(violations[0].reason).toBe('Test reason');
			expect(violations[0].assignment).toEqual(sampleAssignment);
			expect(violations[0].metadata).toEqual(metadata);
			expect(violations[0].timestamp).toBeInstanceOf(Date);
		});
	});
});
