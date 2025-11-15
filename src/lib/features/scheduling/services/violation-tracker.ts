import type { Assignment, ConstraintViolation, ViolationStats } from '../types';

/**
 * Tracks and aggregates constraint violations during scheduling
 *
 * Records all attempted assignments that failed constraint validation,
 * providing statistics and insights into why scheduling failed.
 */
export class ViolationTracker {
	private violations: ConstraintViolation[] = [];

	/**
	 * Record a constraint violation
	 *
	 * @param constraintName - Name of the violated constraint
	 * @param assignment - The assignment that violated the constraint
	 * @param reason - Human-readable explanation
	 * @param metadata - Optional constraint-specific data for debugging
	 */
	recordViolation(
		constraintName: string,
		assignment: Assignment,
		reason: string,
		metadata?: Record<string, any>
	): void {
		this.violations.push({
			constraintName,
			timestamp: new Date(),
			assignment,
			reason,
			metadata,
		});
	}

	/**
	 * Get aggregated statistics grouped by constraint
	 *
	 * @returns Map of constraint name to violation statistics
	 */
	getStatsByConstraint(): Map<string, ViolationStats> {
		const statsMap = new Map<string, ViolationStats>();

		for (const violation of this.violations) {
			if (!statsMap.has(violation.constraintName)) {
				statsMap.set(violation.constraintName, {
					constraintName: violation.constraintName,
					count: 0,
					violations: [],
					summary: {
						affectedStudents: new Set(),
						affectedDates: new Set(),
						affectedPreceptors: new Set(),
					},
				});
			}

			const stats = statsMap.get(violation.constraintName)!;
			stats.count++;
			stats.violations.push(violation);
			stats.summary!.affectedStudents.add(violation.assignment.studentId);
			stats.summary!.affectedDates.add(violation.assignment.date);
			stats.summary!.affectedPreceptors.add(violation.assignment.preceptorId);
		}

		return statsMap;
	}

	/**
	 * Get top N most violated constraints
	 *
	 * @param n - Number of top constraints to return
	 * @returns Array of violation stats sorted by count (descending)
	 */
	getTopViolations(n: number = 10): ViolationStats[] {
		const stats = Array.from(this.getStatsByConstraint().values());
		return stats.sort((a, b) => b.count - a.count).slice(0, n);
	}

	/**
	 * Get total number of violations recorded
	 *
	 * @returns Total violation count
	 */
	getTotalViolations(): number {
		return this.violations.length;
	}

	/**
	 * Clear all recorded violations
	 * Use this before starting a new scheduling run
	 */
	clear(): void {
		this.violations = [];
	}

	/**
	 * Export all violations for external analysis
	 *
	 * @returns Array of all violation records
	 */
	exportViolations(): ConstraintViolation[] {
		return [...this.violations];
	}
}
