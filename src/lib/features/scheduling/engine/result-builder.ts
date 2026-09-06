/**
 * Result Builder
 *
 * Builds comprehensive scheduling results with statistics and unmet requirements.
 */

import type { ProposedAssignment } from '../strategies/base-strategy';

/**
 * Scheduling Result
 */
export interface SchedulingResult {
  success: boolean;
  assignments: ProposedAssignment[];
  unmetRequirements: UnmetRequirement[];
  statistics: SchedulingStatistics;
  violations: ConstraintViolation[];
  pendingApprovals: PendingApproval[];
}

/**
 * Unmet Requirement
 */
export interface UnmetRequirement {
  studentId: string;
  studentName: string;
  clerkshipId: string;
  clerkshipName: string;
  requirementType: 'outpatient' | 'inpatient' | 'elective';
  requiredDays: number;
  assignedDays: number;
  remainingDays: number;
  reason: string;
}

/**
 * Scheduling Statistics
 */
export interface SchedulingStatistics {
  totalStudents: number;
  fullyScheduledStudents: number;
  partiallyScheduledStudents: number;
  unscheduledStudents: number;
  totalAssignments: number;
  totalDaysScheduled: number;
  preceptorsUtilized: number;
  averageAssignmentsPerPreceptor: number;
  completionRate: number;
}

/**
 * Constraint Violation
 */
export interface ConstraintViolation {
  studentId: string;
  preceptorId: string;
  date: string;
  constraintType: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Pending Approval
 */
export interface PendingApproval {
  assignmentId: string;
  studentId: string;
  preceptorId: string;
  fallbackPreceptorId: string;
  dates: string[];
  reason: string;
}

/**
 * Result Builder
 *
 * Assembles scheduling results with comprehensive reporting.
 */
export class ResultBuilder {
  private assignments: ProposedAssignment[] = [];
  private unmetRequirements: UnmetRequirement[] = [];
  private violations: ConstraintViolation[] = [];
  private pendingApprovals: PendingApproval[] = [];
  /** The full set of students the run considered (review finding F-13). */
  private rosterStudentIds: Set<string> | null = null;

  /**
   * Record the full student roster the run is scheduling for, so statistics are
   * computed over every student — not just those that happened to get an
   * assignment (which produced negative "fully scheduled" counts, F-13).
   */
  setRoster(studentIds: string[]): void {
    this.rosterStudentIds = new Set(studentIds);
  }

  /**
   * Add successful assignment
   */
  addAssignment(assignment: ProposedAssignment): void {
    this.assignments.push(assignment);
  }

  /**
   * Add unmet requirement
   */
  addUnmetRequirement(requirement: UnmetRequirement): void {
    this.unmetRequirements.push(requirement);
  }

  /**
   * Add constraint violation
   */
  addViolation(violation: ConstraintViolation): void {
    this.violations.push(violation);
  }

  /**
   * Add pending approval
   */
  addPendingApproval(approval: PendingApproval): void {
    this.pendingApprovals.push(approval);
  }

  /**
   * Build final result
   */
  build(): SchedulingResult {
    const statistics = this.calculateStatistics();

    return {
      success: this.unmetRequirements.length === 0 && this.violations.filter(v => v.severity === 'error').length === 0,
      assignments: this.assignments,
      unmetRequirements: this.unmetRequirements,
      statistics,
      violations: this.violations,
      pendingApprovals: this.pendingApprovals,
    };
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics(): SchedulingStatistics {
    // The roster is every student the run considered; fall back to the union of
    // students that appear in assignments or unmet requirements when the engine
    // did not set it. Counting only students-with-assignments is what produced
    // negative "fully scheduled" numbers (review finding F-13).
    const assignmentStudentIds = new Set(this.assignments.map(a => a.studentId));
    const unmetStudentIds = new Set(this.unmetRequirements.map(r => r.studentId));
    const roster =
      this.rosterStudentIds ?? new Set([...assignmentStudentIds, ...unmetStudentIds]);
    const totalStudents = roster.size;

    // A student is fully scheduled when they have no unmet requirement; partially
    // when they have both an assignment and an unmet requirement; unscheduled when
    // they have an unmet requirement and no assignment at all. Every count is a
    // partition of the roster, so none can go negative.
    let fullyScheduledStudents = 0;
    let partiallyScheduledStudents = 0;
    let unscheduledStudents = 0;
    for (const id of roster) {
      const hasUnmet = unmetStudentIds.has(id);
      const hasAssignment = assignmentStudentIds.has(id);
      if (!hasUnmet) fullyScheduledStudents++;
      else if (hasAssignment) partiallyScheduledStudents++;
      else unscheduledStudents++;
    }

    // Count unique preceptors
    const preceptorIds = new Set(this.assignments.map(a => a.preceptorId));
    const preceptorsUtilized = preceptorIds.size;

    // Calculate totals
    const totalAssignments = this.assignments.length;
    const totalDaysScheduled = this.assignments.length; // Each assignment is one day

    // Calculate averages
    const averageAssignmentsPerPreceptor =
      preceptorsUtilized > 0 ? totalAssignments / preceptorsUtilized : 0;

    // Calculate completion rate
    const completionRate = totalStudents > 0 ? (fullyScheduledStudents / totalStudents) * 100 : 0;

    return {
      totalStudents,
      fullyScheduledStudents,
      partiallyScheduledStudents,
      unscheduledStudents,
      totalAssignments,
      totalDaysScheduled,
      preceptorsUtilized,
      averageAssignmentsPerPreceptor: Math.round(averageAssignmentsPerPreceptor * 10) / 10,
      completionRate: Math.round(completionRate * 10) / 10,
    };
  }

  /**
   * Clear unmet requirements (used by fallback gap filler to rebuild list)
   */
  clearUnmetRequirements(): void {
    this.unmetRequirements = [];
  }

  /**
   * Reset builder for new run
   */
  reset(): void {
    this.assignments = [];
    this.unmetRequirements = [];
    this.violations = [];
    this.pendingApprovals = [];
    this.rosterStudentIds = null;
  }
}
