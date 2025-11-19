/**
 * Configurable Scheduling Engine
 *
 * Main orchestrator that coordinates strategies, validation, and assignment generation.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Student } from '$lib/features/students/types';
import type { Clerkship } from '$lib/features/clerkships/types';
import { StrategySelector, StrategyContextBuilder } from '../strategies';
import { CapacityChecker } from '../capacity';
import { FallbackResolver } from '../fallback';
import { ResultBuilder, type SchedulingResult } from './result-builder';

/**
 * Engine Options
 */
export interface EngineOptions {
  enableTeamFormation?: boolean;
  enableFallbacks?: boolean;
  enableOptimization?: boolean;
  maxRetriesPerStudent?: number;
  dryRun?: boolean;
}

/**
 * Configurable Scheduling Engine
 *
 * Orchestrates the entire scheduling workflow:
 * 1. Load students and clerkships
 * 2. Prioritize students
 * 3. For each student:
 *    a. Select clerkship
 *    b. Load configuration
 *    c. Execute strategy
 *    d. Validate assignments
 *    e. Try fallbacks if needed
 *    f. Commit valid assignments
 * 4. Generate results
 */
export class ConfigurableSchedulingEngine {
  private strategySelector: StrategySelector;
  private contextBuilder: StrategyContextBuilder;
  private capacityChecker: CapacityChecker;
  private fallbackResolver: FallbackResolver;
  private resultBuilder: ResultBuilder;

  constructor(private db: Kysely<DB>) {
    this.strategySelector = new StrategySelector();
    this.contextBuilder = new StrategyContextBuilder(db);
    this.capacityChecker = new CapacityChecker(db);
    this.fallbackResolver = new FallbackResolver(db);
    this.resultBuilder = new ResultBuilder();
  }

  /**
   * Schedule students to clerkships
   */
  async schedule(
    studentIds: string[],
    clerkshipIds: string[],
    options: EngineOptions = {}
  ): Promise<SchedulingResult> {
    const {
      enableTeamFormation = false,
      enableFallbacks = true,
      enableOptimization = false,
      maxRetriesPerStudent = 3,
      dryRun = false,
    } = options;

    this.resultBuilder.reset();

    // Phase 1: Load data
    console.log('[Engine] Loading students and clerkships...');
    const students = await this.loadStudents(studentIds);
    const clerkships = await this.loadClerkships(clerkshipIds);

    if (students.length === 0 || clerkships.length === 0) {
      return this.resultBuilder.build();
    }

    // Phase 2: Prioritize students
    console.log('[Engine] Prioritizing students...');
    const prioritizedStudents = this.prioritizeStudents(students);

    // Phase 3: Schedule each student
    for (const student of prioritizedStudents) {
      console.log(`[Engine] Scheduling student ${student.name} (${student.id})...`);

      for (const clerkship of clerkships) {
        await this.scheduleStudentToClerkship(
          student,
          clerkship,
          {
            enableTeamFormation,
            enableFallbacks,
            maxRetries: maxRetriesPerStudent,
          }
        );
      }
    }

    // Phase 4: Build result
    console.log('[Engine] Generating results...');
    const result = this.resultBuilder.build();

    // Commit to database if not dry run
    if (!dryRun && result.success) {
      await this.commitAssignments(result.assignments);
    }

    return result;
  }

  /**
   * Schedule single student to single clerkship
   */
  private async scheduleStudentToClerkship(
    student: Student,
    clerkship: Clerkship,
    options: {
      enableTeamFormation: boolean;
      enableFallbacks: boolean;
      maxRetries: number;
    }
  ): Promise<void> {
    // Validate required IDs
    if (!student.id || !clerkship.id) {
      console.error('[Engine] Student or clerkship missing valid ID');
      return;
    }

    try {
      // Build strategy context
      const config: any = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'prefer_same_system',
        requirementType: 'outpatient',
      };

      const context = await this.contextBuilder.buildContext(student, clerkship, config, {
        startDate: new Date().toISOString().split('T')[0],
      });

      // Select and execute strategy
      const strategy = this.strategySelector.selectStrategy(config);
      if (!strategy) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: clerkship.name,
          requirementType: 'outpatient',
          requiredDays: clerkship.required_days,
          assignedDays: 0,
          remainingDays: clerkship.required_days,
          reason: 'No suitable strategy found',
        });
        return;
      }

      console.log(`[Engine] Using strategy: ${strategy.getName()}`);
      const result = await strategy.generateAssignments(context);

      if (!result.success) {
        // Try fallback if enabled
        if (options.enableFallbacks) {
          console.log(`[Engine] Strategy failed, trying fallback...`);
          await this.tryFallbackAssignment(student, clerkship, context, config);
        } else {
          this.resultBuilder.addUnmetRequirement({
            studentId: student.id,
            studentName: student.name,
            clerkshipId: clerkship.id,
            clerkshipName: clerkship.name,
            requirementType: 'outpatient',
            requiredDays: clerkship.required_days,
            assignedDays: 0,
            remainingDays: clerkship.required_days,
            reason: result.error || 'Strategy execution failed',
          });
        }
        return;
      }

      // Validate assignments
      const validationResult = await this.validateAssignments(result.assignments);

      if (validationResult.isValid) {
        // Commit assignments
        result.assignments.forEach(assignment => {
          this.resultBuilder.addAssignment(assignment);
        });
        console.log(`[Engine] Successfully assigned ${result.assignments.length} days`);
      } else {
        // Record violations
        validationResult.violations.forEach(violation => {
          this.resultBuilder.addViolation(violation);
        });

        // Record unmet requirement
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: clerkship.name,
          requirementType: 'outpatient',
          requiredDays: clerkship.required_days,
          assignedDays: 0,
          remainingDays: clerkship.required_days,
          reason: `Validation failed: ${validationResult.violations.map(v => v.message).join(', ')}`,
        });
      }
    } catch (error) {
      console.error(`[Engine] Error scheduling ${student.name} to ${clerkship.name}:`, error);
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: clerkship.name,
        requirementType: 'outpatient',
        requiredDays: clerkship.required_days,
        assignedDays: 0,
        remainingDays: clerkship.required_days,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Try fallback assignment when primary strategy fails
   */
  private async tryFallbackAssignment(
    student: Student,
    clerkship: Clerkship,
    context: any,
    config: any
  ): Promise<void> {
    // This would use FallbackResolver to find alternative preceptors
    // Simplified for now
    console.log('[Engine] Fallback resolution not yet fully implemented');
  }

  /**
   * Validate proposed assignments
   */
  private async validateAssignments(assignments: any[]): Promise<{
    isValid: boolean;
    violations: any[];
  }> {
    const violations: any[] = [];

    // Validate each assignment
    for (const assignment of assignments) {
      // Check capacity
      const capacityCheck = await this.capacityChecker.checkCapacity(
        assignment.preceptorId,
        assignment.date,
        {
          clerkshipId: assignment.clerkshipId,
          requirementType: assignment.requirementType,
        }
      );

      if (!capacityCheck.hasCapacity) {
        violations.push({
          studentId: assignment.studentId,
          preceptorId: assignment.preceptorId,
          date: assignment.date,
          constraintType: 'capacity',
          severity: 'error',
          message: capacityCheck.reason || 'Capacity exceeded',
        });
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Load students from database
   */
  private async loadStudents(studentIds: string[]): Promise<Student[]> {
    const students = await this.db
      .selectFrom('students')
      .selectAll()
      .where('id', 'in', studentIds)
      .execute();

    return students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
    }));
  }

  /**
   * Load clerkships from database
   */
  private async loadClerkships(clerkshipIds: string[]): Promise<Clerkship[]> {
    const clerkships = await this.db
      .selectFrom('clerkships')
      .selectAll()
      .where('id', 'in', clerkshipIds)
      .execute();

    return clerkships.map(c => ({
      id: c.id,
      name: c.name,
      specialty: c.specialty,
      required_days: c.required_days,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
  }

  /**
   * Prioritize students (simpler students first for now)
   */
  private prioritizeStudents(students: Student[]): Student[] {
    // Could implement complex prioritization logic here
    // For now, just return as-is
    return [...students];
  }

  /**
   * Commit assignments to database
   */
  private async commitAssignments(assignments: any[]): Promise<void> {
    for (const assignment of assignments) {
      await this.db
        .insertInto('schedule_assignments')
        .values({
          id: `assignment-${Date.now()}-${Math.random()}`,
          student_id: assignment.studentId,
          preceptor_id: assignment.preceptorId,
          clerkship_id: assignment.clerkshipId,
          date: assignment.date,
          // TODO: block_number field doesn't exist in schema, skipping
          // block_number: assignment.blockNumber || null,
          created_at: new Date().toISOString(),
        })
        .execute();
    }

    console.log(`[Engine] Committed ${assignments.length} assignments to database`);
  }
}
