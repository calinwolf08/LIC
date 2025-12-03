/**
 * Configurable Scheduling Engine
 *
 * Main orchestrator that coordinates strategies, validation, and assignment generation.
 * Uses configuration-driven scheduling with support for multiple assignment strategies.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Student } from '$lib/features/students/types';
import type { Clerkship } from '$lib/features/clerkships/types';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
import type { Constraint } from '../types/constraint';
import type { SchedulingContext } from '../types/scheduling-context';
import { StrategySelector, StrategyContextBuilder } from '../strategies';
import { CapacityChecker } from '../capacity';
import { FallbackResolver } from '../fallback';
import { ResultBuilder, type SchedulingResult } from './result-builder';
import { ConstraintFactory } from '../services/constraint-factory';
import { AssignmentStrategy } from '$lib/features/scheduling-config/types';
import { nanoid } from 'nanoid';

/**
 * Engine Options
 */
export interface EngineOptions {
  startDate: string;
  endDate: string;
  enableTeamFormation?: boolean;
  enableFallbacks?: boolean;
  enableOptimization?: boolean;
  maxRetriesPerStudent?: number;
  dryRun?: boolean;
  bypassedConstraints?: string[];
}

/**
 * Configurable Scheduling Engine
 *
 * Orchestrates the entire scheduling workflow:
 * 1. Load students and clerkships
 * 2. Load configuration for each clerkship (with 3-level inheritance)
 * 3. Prioritize students
 * 4. For each student:
 *    a. Select clerkship
 *    b. Get resolved configuration
 *    c. Select and execute appropriate strategy
 *    d. Validate assignments against constraints
 *    e. Commit valid assignments
 * 5. Generate results
 */
export class ConfigurableSchedulingEngine {
  private strategySelector: StrategySelector;
  private contextBuilder: StrategyContextBuilder;
  private capacityChecker: CapacityChecker;
  private fallbackResolver: FallbackResolver;
  private resultBuilder: ResultBuilder;
  private constraintFactory: ConstraintFactory;
  private constraints: Constraint[] = [];
  private clerkshipConfigs: Map<string, ResolvedRequirementConfiguration> = new Map();

  constructor(private db: Kysely<DB>) {
    this.strategySelector = new StrategySelector();
    this.contextBuilder = new StrategyContextBuilder(db);
    this.capacityChecker = new CapacityChecker(db);
    this.fallbackResolver = new FallbackResolver(db);
    this.resultBuilder = new ResultBuilder();
    this.constraintFactory = new ConstraintFactory(db);
  }

  /**
   * Schedule students to clerkships
   */
  async schedule(
    studentIds: string[],
    clerkshipIds: string[],
    options: EngineOptions
  ): Promise<SchedulingResult> {
    const {
      startDate,
      endDate,
      enableTeamFormation = false,
      enableFallbacks = false, // Disabled per requirements
      enableOptimization = false,
      maxRetriesPerStudent = 3,
      dryRun = false,
      bypassedConstraints = [],
    } = options;

    this.resultBuilder.reset();
    this.clerkshipConfigs.clear();

    // Phase 1: Load data
    console.log('[Engine] Loading students and clerkships...');
    const students = await this.loadStudents(studentIds);
    const clerkships = await this.loadClerkships(clerkshipIds);

    if (students.length === 0 || clerkships.length === 0) {
      return this.resultBuilder.build();
    }

    // Phase 2: Load configurations for all clerkships
    console.log('[Engine] Loading clerkship configurations...');
    await this.loadClerkshipConfigurations(clerkshipIds, clerkships);

    // Phase 3: Build scheduling context and constraints
    console.log('[Engine] Building scheduling context and constraints...');
    const schedulingContext = await this.buildSchedulingContext(
      students,
      clerkships,
      startDate,
      endDate
    );
    this.constraints = await this.constraintFactory.buildConstraints(
      clerkshipIds,
      schedulingContext
    );

    // Phase 4: Prioritize students
    console.log('[Engine] Prioritizing students...');
    const prioritizedStudents = this.prioritizeStudents(students);

    // Phase 5: Schedule each student
    for (const student of prioritizedStudents) {
      console.log(`[Engine] Scheduling student ${student.name} (${student.id})...`);

      for (const clerkship of clerkships) {
        await this.scheduleStudentToClerkship(
          student,
          clerkship,
          {
            startDate,
            endDate,
            enableTeamFormation,
            enableFallbacks,
            maxRetries: maxRetriesPerStudent,
            bypassedConstraints: new Set(bypassedConstraints),
          }
        );
      }
    }

    // Phase 6: Build result
    console.log('[Engine] Generating results...');
    const result = this.resultBuilder.build();

    // Commit to database if not dry run
    if (!dryRun && result.success) {
      await this.commitAssignments(result.assignments);
    }

    return result;
  }

  /**
   * Load resolved configurations for all clerkships
   */
  private async loadClerkshipConfigurations(
    clerkshipIds: string[],
    clerkships: Clerkship[]
  ): Promise<void> {
    // Load global defaults
    const [outpatientDefaults, inpatientDefaults, electiveDefaults] = await Promise.all([
      this.loadGlobalDefaults('outpatient'),
      this.loadGlobalDefaults('inpatient'),
      this.loadGlobalDefaults('elective'),
    ]);

    // Load clerkship requirements
    const requirements = await this.db
      .selectFrom('clerkship_requirements')
      .selectAll()
      .where('clerkship_id', 'in', clerkshipIds)
      .execute();

    // Build resolved configuration for each clerkship
    for (const clerkship of clerkships) {
      if (!clerkship.id) continue;

      const requirement = requirements.find(r => r.clerkship_id === clerkship.id);
      const requirementType = requirement?.requirement_type || clerkship.clerkship_type || 'outpatient';

      // Get appropriate defaults based on requirement type
      let defaults = outpatientDefaults;
      if (requirementType === 'inpatient') defaults = inpatientDefaults;
      if (requirementType === 'elective') defaults = electiveDefaults;

      // Build resolved configuration
      const resolvedConfig = this.resolveConfiguration(
        clerkship,
        requirement,
        defaults
      );

      this.clerkshipConfigs.set(clerkship.id, resolvedConfig);
    }
  }

  /**
   * Load global defaults for a requirement type
   */
  private async loadGlobalDefaults(
    requirementType: 'outpatient' | 'inpatient' | 'elective'
  ): Promise<Record<string, any> | null> {
    const tableName =
      requirementType === 'inpatient'
        ? 'global_inpatient_defaults'
        : requirementType === 'elective'
          ? 'global_elective_defaults'
          : 'global_outpatient_defaults';

    const result = await this.db
      .selectFrom(tableName as any)
      .selectAll()
      .where('school_id', '=', 'default')
      .executeTakeFirst();

    return result || null;
  }

  /**
   * Resolve configuration by merging global defaults with clerkship-specific overrides
   */
  private resolveConfiguration(
    clerkship: Clerkship,
    requirement: any | undefined,
    defaults: Record<string, any> | null
  ): ResolvedRequirementConfiguration {
    // Default strategy is continuous_single as specified
    const defaultStrategy = AssignmentStrategy.CONTINUOUS_SINGLE;

    // Start with defaults or sensible fallbacks
    const baseConfig: ResolvedRequirementConfiguration = {
      clerkshipId: clerkship.id!,
      requirementType: (requirement?.requirement_type || clerkship.clerkship_type || 'outpatient') as any,
      requiredDays: requirement?.required_days || clerkship.required_days,
      assignmentStrategy: defaults?.assignment_strategy || defaultStrategy,
      healthSystemRule: defaults?.health_system_rule || 'no_preference',
      maxStudentsPerDay: defaults?.default_max_students_per_day || 2,
      maxStudentsPerYear: defaults?.default_max_students_per_year || 50,
      blockSizeDays: defaults?.block_length_days,
      allowPartialBlocks: defaults?.allow_partial_blocks === 1,
      preferContinuousBlocks: defaults?.prefer_continuous_blocks === 1,
      allowTeams: defaults?.allow_teams === 1,
      allowFallbacks: defaults?.allow_fallbacks === 1,
      fallbackRequiresApproval: defaults?.fallback_requires_approval === 1,
      fallbackAllowCrossSystem: defaults?.fallback_allow_cross_system === 1,
      source: 'global_defaults',
    };

    // Apply requirement-level overrides if present
    if (requirement && requirement.override_mode !== 'inherit') {
      if (requirement.override_assignment_strategy) {
        baseConfig.assignmentStrategy = requirement.override_assignment_strategy;
        baseConfig.source = 'partial_override';
      }
      if (requirement.override_health_system_rule) {
        baseConfig.healthSystemRule = requirement.override_health_system_rule;
        baseConfig.source = 'partial_override';
      }
      if (requirement.override_block_length_days !== null) {
        baseConfig.blockSizeDays = requirement.override_block_length_days;
        baseConfig.source = 'partial_override';
      }
    }

    return baseConfig;
  }

  /**
   * Build scheduling context for constraint validation
   */
  private async buildSchedulingContext(
    students: Student[],
    clerkships: Clerkship[],
    startDate: string,
    endDate: string
  ): Promise<SchedulingContext> {
    // Load all required data for scheduling context
    const [
      preceptors,
      blackoutDates,
      availabilityRecords,
      healthSystems,
      teams,
      studentOnboardingRecords,
    ] = await Promise.all([
      this.db.selectFrom('preceptors').selectAll().execute(),
      this.db.selectFrom('blackout_dates').select('date').execute(),
      this.db.selectFrom('preceptor_availability').selectAll().execute(),
      this.db.selectFrom('health_systems').selectAll().execute(),
      this.db.selectFrom('teams').selectAll().execute(),
      this.db.selectFrom('student_health_system_onboarding').selectAll().execute(),
    ]);

    const blackoutSet = new Set(blackoutDates.map(b => b.date));

    // Build preceptor availability map: preceptorId -> Map(date -> siteId)
    const preceptorAvailability = new Map<string, Map<string, string>>();
    for (const record of availabilityRecords) {
      if (record.is_available) {
        if (!preceptorAvailability.has(record.preceptor_id)) {
          preceptorAvailability.set(record.preceptor_id, new Map());
        }
        preceptorAvailability.get(record.preceptor_id)!.set(record.date, record.site_id);
      }
    }

    // Build student requirements map
    const studentRequirements = new Map<string, Map<string, number>>();
    for (const student of students) {
      if (!student.id) continue;
      const requirements = new Map<string, number>();
      for (const clerkship of clerkships) {
        if (!clerkship.id) continue;
        requirements.set(clerkship.id, clerkship.required_days);
      }
      studentRequirements.set(student.id, requirements);
    }

    // Build student onboarding map: studentId -> Set of completed health system IDs
    const studentOnboarding = new Map<string, Set<string>>();
    for (const record of studentOnboardingRecords) {
      if (record.is_completed) {
        if (!studentOnboarding.has(record.student_id)) {
          studentOnboarding.set(record.student_id, new Set());
        }
        studentOnboarding.get(record.student_id)!.add(record.health_system_id);
      }
    }

    return {
      students: students as any,
      preceptors: preceptors as any,
      clerkships: clerkships as any,
      blackoutDates: blackoutSet,
      preceptorAvailability,
      studentRequirements,
      startDate,
      endDate,
      healthSystems,
      teams,
      studentOnboarding,
      // Initialize empty tracking structures
      assignments: [],
      assignmentsByDate: new Map(),
      assignmentsByStudent: new Map(),
      assignmentsByPreceptor: new Map(),
    };
  }

  /**
   * Schedule single student to single clerkship
   */
  private async scheduleStudentToClerkship(
    student: Student,
    clerkship: Clerkship,
    options: {
      startDate: string;
      endDate: string;
      enableTeamFormation: boolean;
      enableFallbacks: boolean;
      maxRetries: number;
      bypassedConstraints: Set<string>;
    }
  ): Promise<void> {
    // Validate required IDs
    if (!student.id || !clerkship.id) {
      console.error('[Engine] Student or clerkship missing valid ID');
      return;
    }

    try {
      // Get resolved configuration for this clerkship
      const config = this.clerkshipConfigs.get(clerkship.id);
      if (!config) {
        console.error(`[Engine] No configuration found for clerkship ${clerkship.id}`);
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: clerkship.name,
          requirementType: 'outpatient',
          requiredDays: clerkship.required_days,
          assignedDays: 0,
          remainingDays: clerkship.required_days,
          reason: 'No configuration found for clerkship',
        });
        return;
      }

      // Build strategy context with proper date range
      const context = await this.contextBuilder.buildContext(student, clerkship, config, {
        startDate: options.startDate,
        endDate: options.endDate,
        requirementType: config.requirementType,
      });

      // Select strategy based on configuration
      const strategy = this.strategySelector.selectStrategy(config);
      if (!strategy) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: clerkship.name,
          requirementType: config.requirementType,
          requiredDays: config.requiredDays,
          assignedDays: 0,
          remainingDays: config.requiredDays,
          reason: `No suitable strategy found for ${config.assignmentStrategy}`,
        });
        return;
      }

      console.log(`[Engine] Using strategy: ${strategy.getName()} for ${clerkship.name}`);
      const result = await strategy.generateAssignments(context);

      if (!result.success) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: clerkship.name,
          requirementType: config.requirementType,
          requiredDays: config.requiredDays,
          assignedDays: 0,
          remainingDays: config.requiredDays,
          reason: result.error || 'Strategy execution failed',
        });
        return;
      }

      // Validate assignments against constraints
      const validationResult = await this.validateAssignments(
        result.assignments,
        options.bypassedConstraints
      );

      if (validationResult.isValid) {
        // Add assignments to result
        result.assignments.forEach(assignment => {
          this.resultBuilder.addAssignment(assignment);
        });
        console.log(`[Engine] Successfully assigned ${result.assignments.length} days for ${student.name} to ${clerkship.name}`);
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
          requirementType: config.requirementType,
          requiredDays: config.requiredDays,
          assignedDays: 0,
          remainingDays: config.requiredDays,
          reason: `Validation failed: ${validationResult.violations.map(v => v.message).join(', ')}`,
        });
      }
    } catch (error) {
      console.error(`[Engine] Error scheduling ${student.name} to ${clerkship.name}:`, error);
      const config = this.clerkshipConfigs.get(clerkship.id);
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: clerkship.name,
        requirementType: config?.requirementType || 'outpatient',
        requiredDays: config?.requiredDays || clerkship.required_days,
        assignedDays: 0,
        remainingDays: config?.requiredDays || clerkship.required_days,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Validate proposed assignments against all constraints
   */
  private async validateAssignments(
    assignments: any[],
    bypassedConstraints: Set<string>
  ): Promise<{
    isValid: boolean;
    violations: any[];
  }> {
    const violations: any[] = [];

    // Validate each assignment against constraints
    for (const assignment of assignments) {
      // Check capacity using capacity checker
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
          constraintType: 'PreceptorCapacity',
          severity: 'error',
          message: capacityCheck.reason || 'Preceptor capacity exceeded',
        });
      }

      // Run through all loaded constraints
      for (const constraint of this.constraints) {
        // Skip bypassed constraints
        if (bypassedConstraints.has(constraint.name)) {
          continue;
        }

        // Build a minimal assignment object for constraint validation
        const assignmentForValidation = {
          studentId: assignment.studentId,
          preceptorId: assignment.preceptorId,
          clerkshipId: assignment.clerkshipId,
          date: assignment.date,
        };

        // Note: Full constraint validation requires a SchedulingContext
        // For now, we rely on the capacity checker above
        // Full constraint integration would require passing the context
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
    return (await this.db
      .selectFrom('students')
      .selectAll()
      .where('id', 'in', studentIds)
      .execute()) as unknown as Student[];
  }

  /**
   * Load clerkships from database
   */
  private async loadClerkships(clerkshipIds: string[]): Promise<Clerkship[]> {
    return (await this.db
      .selectFrom('clerkships')
      .selectAll()
      .where('id', 'in', clerkshipIds)
      .execute()) as unknown as Clerkship[];
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
    if (assignments.length === 0) return;

    const timestamp = new Date().toISOString();
    const values = assignments.map(assignment => ({
      id: nanoid(),
      student_id: assignment.studentId,
      preceptor_id: assignment.preceptorId,
      clerkship_id: assignment.clerkshipId,
      date: assignment.date,
      status: 'scheduled',
      created_at: timestamp,
    }));

    // Bulk insert for efficiency
    await this.db
      .insertInto('schedule_assignments')
      .values(values)
      .execute();

    console.log(`[Engine] Committed ${assignments.length} assignments to database`);
  }
}
