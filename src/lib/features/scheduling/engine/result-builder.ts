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
    // Count unique students
    const studentIds = new Set(this.assignments.map(a => a.studentId));
    const totalStudents = studentIds.size;

    // Count students by completion status
    const studentCompletionMap = new Map<string, { required: number; assigned: number }>();

    // This would need actual requirement data
    // For now, simplified calculation
    const fullyScheduledStudents = totalStudents - this.unmetRequirements.length;
    const partiallyScheduledStudents = Math.min(
      this.unmetRequirements.filter(r => r.assignedDays > 0).length,
      totalStudents - fullyScheduledStudents
    );
    const unscheduledStudents = this.unmetRequirements.filter(r => r.assignedDays === 0).length;

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
  }
}
