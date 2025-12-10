/**
 * Base Strategy Interface
 *
 * Defines the contract for all scheduling strategies.
 */

import type { Student } from '$lib/features/students/types';
import type { Clerkship } from '$lib/features/clerkships/types';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

/**
 * Proposed Assignment (before validation)
 */
export interface ProposedAssignment {
  studentId: string;
  preceptorId: string;
  clerkshipId: string;
  date: string; // YYYY-MM-DD
  requirementType?: 'outpatient' | 'inpatient' | 'elective';
  blockNumber?: number; // For block-based strategies
  teamId?: string; // For team strategies
}

/**
 * Strategy Context
 *
 * All information needed by strategies to make assignment decisions.
 */
export interface StrategyContext {
  // Core data
  student: Student;
  clerkship: Clerkship;
  config: ResolvedRequirementConfiguration;

  // Available dates (excluding blackouts, student unavailability)
  availableDates: string[];

  // Preceptor information
  availablePreceptors: Array<{
    id: string;
    name: string;
    healthSystemId: string | null;
    siteId: string | null; // Primary site (for backwards compat)
    siteIds?: string[]; // All sites preceptor is associated with
    availability: string[]; // Dates this preceptor is available
    currentAssignmentCount: number; // For load balancing
    maxStudentsPerDay: number;
    maxStudentsPerYear: number;
    isGlobalFallbackOnly?: boolean; // If true, never assigned as primary for any clerkship
  }>;

  // Team configurations (if using team strategies)
  teams?: Array<{
    id: string;
    members: Array<{
      preceptorId: string;
      priority: number;
      role?: string;
      isFallbackOnly?: boolean; // If true, only used when primary capacity exhausted
    }>;
    requireSameHealthSystem: boolean;
    requireSameSite: boolean;
    requireSameSpecialty: boolean;
  }>;

  // Existing assignments (for conflict checking)
  existingAssignments: Array<{
    studentId: string;
    preceptorId: string;
    date: string;
  }>;

  // Health system information
  healthSystems: Map<string, { id: string; name: string }>;
  sites: Map<string, { id: string; healthSystemId: string | null; name: string }>;

  // Daily assignment counts per preceptor (for maxStudentsPerDay enforcement)
  // Map<preceptorId, Map<date, count>>
  assignmentsByPreceptorDate?: Map<string, Map<string, number>>;
}

/**
 * Strategy Result
 */
export interface StrategyResult {
  success: boolean;
  assignments: ProposedAssignment[];
  error?: string;
  metadata?: {
    strategyUsed: string;
    preceptorsConsidered: number;
    assignmentCount: number;
    blocksCreated?: number;
    teamUsed?: string;
  };
}

/**
 * Base Strategy Interface
 *
 * All scheduling strategies must implement this interface.
 */
export interface SchedulingStrategy {
  /**
   * Get strategy name (for logging/debugging)
   */
  getName(): string;

  /**
   * Check if this strategy can handle the given configuration
   */
  canHandle(config: ResolvedRequirementConfiguration): boolean;

  /**
   * Generate proposed assignments
   *
   * Returns array of proposed assignments (not yet validated).
   * Scheduling engine will validate these before committing.
   */
  generateAssignments(context: StrategyContext): Promise<StrategyResult>;

  /**
   * Estimate number of assignments this strategy will create
   */
  estimateAssignments(
    student: Student,
    clerkship: Clerkship,
    config: ResolvedRequirementConfiguration
  ): number;
}

/**
 * Abstract base class with common utility methods
 */
export abstract class BaseStrategy implements SchedulingStrategy {
  abstract getName(): string;
  abstract canHandle(config: ResolvedRequirementConfiguration): boolean;
  abstract generateAssignments(context: StrategyContext): Promise<StrategyResult>;

  estimateAssignments(
    student: Student,
    clerkship: Clerkship,
    config: ResolvedRequirementConfiguration
  ): number {
    // Default: one assignment per required day
    return clerkship.required_days;
  }

  /**
   * Helper: Filter preceptors by specialty (currently disabled)
   *
   * Note: Returns all preceptors since specialty field was removed from preceptors.
   */
  protected filterBySpecialty(
    preceptors: StrategyContext['availablePreceptors'],
    specialty: string | undefined
  ): StrategyContext['availablePreceptors'] {
    // Specialty matching disabled - preceptors no longer have specialty field
    return preceptors;
  }

  /**
   * Helper: Filter preceptors by health system
   */
  protected filterByHealthSystem(
    preceptors: StrategyContext['availablePreceptors'],
    healthSystemId: string | null
  ): StrategyContext['availablePreceptors'] {
    if (!healthSystemId) return preceptors;
    return preceptors.filter(p => p.healthSystemId === healthSystemId);
  }

  /**
   * Helper: Find preceptor available for all dates
   */
  protected findPreceptorAvailableForAllDates(
    preceptors: StrategyContext['availablePreceptors'],
    dates: string[]
  ): StrategyContext['availablePreceptors'][0] | null {
    const dateSet = new Set(dates);

    for (const preceptor of preceptors) {
      const availableSet = new Set(preceptor.availability);
      const hasAllDates = dates.every(date => availableSet.has(date));

      if (hasAllDates) {
        return preceptor;
      }
    }

    return null;
  }

  /**
   * Helper: Sort preceptors by load (fewer assignments first)
   */
  protected sortByLoad(
    preceptors: StrategyContext['availablePreceptors']
  ): StrategyContext['availablePreceptors'] {
    return [...preceptors].sort((a, b) => a.currentAssignmentCount - b.currentAssignmentCount);
  }

  /**
   * Helper: Check if date is available for preceptor
   */
  protected isDateAvailable(
    preceptor: StrategyContext['availablePreceptors'][0],
    date: string
  ): boolean {
    return preceptor.availability.includes(date);
  }

  /**
   * Helper: Check if preceptor has daily capacity remaining on a specific date
   */
  protected hasDailyCapacity(
    context: StrategyContext,
    preceptor: StrategyContext['availablePreceptors'][0],
    date: string
  ): boolean {
    const dailyCount = context.assignmentsByPreceptorDate?.get(preceptor.id)?.get(date) ?? 0;
    return dailyCount < preceptor.maxStudentsPerDay;
  }

  /**
   * Helper: Check if preceptor has yearly capacity remaining
   */
  protected hasYearlyCapacity(
    preceptor: StrategyContext['availablePreceptors'][0],
    additionalAssignments: number = 1
  ): boolean {
    return preceptor.currentAssignmentCount + additionalAssignments <= preceptor.maxStudentsPerYear;
  }

  /**
   * Helper: Create proposed assignment
   */
  protected createAssignment(
    studentId: string,
    preceptorId: string,
    clerkshipId: string,
    date: string,
    options: {
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      blockNumber?: number;
      teamId?: string;
    } = {}
  ): ProposedAssignment {
    return {
      studentId,
      preceptorId,
      clerkshipId,
      date,
      ...options,
    };
  }
}
