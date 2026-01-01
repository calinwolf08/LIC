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
import { FallbackResolver, FallbackGapFiller, type UnmetRequirement as FallbackUnmetRequirement } from '../fallback';
import { ResultBuilder, type SchedulingResult, type UnmetRequirement } from './result-builder';
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
/**
 * Pending assignment tracking for batch scheduling
 */
export interface PendingAssignment {
  studentId: string;
  preceptorId: string;
  clerkshipId: string;
  date: string;
}

export class ConfigurableSchedulingEngine {
  private strategySelector: StrategySelector;
  private contextBuilder: StrategyContextBuilder;
  private capacityChecker: CapacityChecker;
  private fallbackResolver: FallbackResolver;
  private fallbackGapFiller: FallbackGapFiller;
  private resultBuilder: ResultBuilder;
  private constraintFactory: ConstraintFactory;
  private constraints: Constraint[] = [];
  private clerkshipConfigs: Map<string, ResolvedRequirementConfiguration> = new Map();
  private electivesByRequirement: Map<string, any[]> = new Map();
  private pendingAssignments: PendingAssignment[] = [];

  constructor(private db: Kysely<DB>) {
    this.strategySelector = new StrategySelector();
    this.contextBuilder = new StrategyContextBuilder(db);
    this.capacityChecker = new CapacityChecker(db);
    this.fallbackResolver = new FallbackResolver(db);
    this.fallbackGapFiller = new FallbackGapFiller(db);
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
      enableFallbacks = false,
      enableOptimization = false,
      maxRetriesPerStudent = 3,
      dryRun = false,
      bypassedConstraints = [],
    } = options;

    this.resultBuilder.reset();
    this.clerkshipConfigs.clear();
    this.electivesByRequirement.clear();
    this.pendingAssignments = [];

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

    // Phase 5: Schedule each student (primary scheduling)
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

    // Phase 6: Fallback gap filling (if enabled and there are unmet requirements)
    const intermediateResult = this.resultBuilder.build();
    if (enableFallbacks && intermediateResult.unmetRequirements.length > 0) {
      console.log(`[Engine] Running fallback gap filling for ${intermediateResult.unmetRequirements.length} unmet requirements...`);
      await this.runFallbackGapFilling(
        intermediateResult.unmetRequirements,
        { startDate, endDate }
      );
    }

    // Phase 7: Build final result
    console.log('[Engine] Generating results...');
    const result = this.resultBuilder.build();

    // Commit to database if not dry run
    if (!dryRun && result.assignments.length > 0) {
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

    // Load electives for elective-type requirements
    const electiveRequirements = requirements.filter(r => r.requirement_type === 'elective');
    if (electiveRequirements.length > 0) {
      const requirementIds = electiveRequirements.map(r => r.id).filter((id): id is string => id !== null);

      // Load all electives with their associated sites and preceptors
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('requirement_id', 'in', requirementIds)
        .execute();

      // Load site associations
      const electiveIds = electives.map(e => e.id).filter((id): id is string => id !== null);
      const siteAssociations = electiveIds.length > 0 ? await this.db
        .selectFrom('elective_sites')
        .selectAll()
        .where('elective_id', 'in', electiveIds)
        .execute() : [];

      // Load preceptor associations
      const preceptorAssociations = electiveIds.length > 0 ? await this.db
        .selectFrom('elective_preceptors')
        .selectAll()
        .where('elective_id', 'in', electiveIds)
        .execute() : [];

      // Group by requirement_id
      for (const requirement of electiveRequirements) {
        const requirementElectives = electives
          .filter(e => e.requirement_id === requirement.id)
          .map(elective => ({
            ...elective,
            siteIds: siteAssociations
              .filter(sa => sa.elective_id === elective.id)
              .map(sa => sa.site_id),
            preceptorIds: preceptorAssociations
              .filter(pa => pa.elective_id === elective.id)
              .map(pa => pa.preceptor_id),
          }));

        if (requirement.id) {
          this.electivesByRequirement.set(requirement.id, requirementElectives);
        }
      }
    }

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
      requirementId: requirement?.id || undefined,
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

      // Handle elective requirements - schedule each required elective separately
      if (config.requirementType === 'elective' && config.requirementId) {
        const electives = this.electivesByRequirement.get(config.requirementId) || [];
        const requiredElectives = electives.filter(e => e.is_required);

        if (requiredElectives.length === 0) {
          console.log(`[Engine] No required electives found for ${clerkship.name}, skipping`);
          return;
        }

        console.log(`[Engine] Scheduling ${requiredElectives.length} required electives for ${student.name} in ${clerkship.name}`);

        for (const elective of requiredElectives) {
          await this.scheduleStudentToElective(
            student,
            clerkship,
            elective,
            config,
            options
          );
        }
        return; // Elective scheduling handled separately
      }

      // Build strategy context with proper date range and pending assignments
      const context = await this.contextBuilder.buildContext(student, clerkship, config, {
        startDate: options.startDate,
        endDate: options.endDate,
        requirementType: config.requirementType,
        pendingAssignments: this.pendingAssignments,
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
        // Add assignments to result and track as pending for future students
        result.assignments.forEach(assignment => {
          this.resultBuilder.addAssignment(assignment);
          // Track pending assignment for capacity calculations
          this.pendingAssignments.push({
            studentId: assignment.studentId,
            preceptorId: assignment.preceptorId,
            clerkshipId: assignment.clerkshipId,
            date: assignment.date,
          });
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
   * Schedule single student to single elective
   */
  private async scheduleStudentToElective(
    student: Student,
    clerkship: Clerkship,
    elective: any,
    config: ResolvedRequirementConfiguration,
    options: {
      startDate: string;
      endDate: string;
      enableTeamFormation: boolean;
      enableFallbacks: boolean;
      maxRetries: number;
      bypassedConstraints: Set<string>;
    }
  ): Promise<void> {
    if (!student.id || !clerkship.id || !elective.id) {
      console.error('[Engine] Student, clerkship, or elective missing valid ID');
      return;
    }

    try {
      console.log(`[Engine] Scheduling elective "${elective.name}" (${elective.minimum_days} days) for ${student.name}`);

      // Create modified config with elective's minimum_days
      const electiveConfig = {
        ...config,
        requiredDays: elective.minimum_days,
      };

      // Build strategy context
      const context = await this.contextBuilder.buildContext(student, clerkship, electiveConfig as any, {
        startDate: options.startDate,
        endDate: options.endDate,
        requirementType: 'elective',
        pendingAssignments: this.pendingAssignments,
      });

      // Filter preceptors to only those associated with this elective
      if (elective.preceptorIds && elective.preceptorIds.length > 0) {
        context.availablePreceptors = context.availablePreceptors.filter(p =>
          elective.preceptorIds.includes(p.id)
        );
      }

      if (context.availablePreceptors.length === 0) {
        console.warn(`[Engine] No available preceptors for elective "${elective.name}"`);
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: elective.minimum_days,
          assignedDays: 0,
          remainingDays: elective.minimum_days,
          reason: `No available preceptors for elective "${elective.name}"`,
        });
        return;
      }

      // Select and execute strategy
      const strategy = this.strategySelector.selectStrategy(config);
      if (!strategy) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: elective.minimum_days,
          assignedDays: 0,
          remainingDays: elective.minimum_days,
          reason: `No suitable strategy found for ${config.assignmentStrategy}`,
        });
        return;
      }

      const result = await strategy.generateAssignments(context);

      if (!result.success) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: elective.minimum_days,
          assignedDays: 0,
          remainingDays: elective.minimum_days,
          reason: result.error || 'Strategy execution failed',
        });
        return;
      }

      // Add elective_id to all assignments
      const electiveAssignments = result.assignments.map(assignment => ({
        ...assignment,
        electiveId: elective.id,
        requirementType: 'elective' as const,
      }));

      // Validate assignments
      const validationResult = await this.validateAssignments(
        electiveAssignments,
        options.bypassedConstraints
      );

      if (validationResult.isValid) {
        electiveAssignments.forEach(assignment => {
          this.resultBuilder.addAssignment(assignment);
          this.pendingAssignments.push({
            studentId: assignment.studentId,
            preceptorId: assignment.preceptorId,
            clerkshipId: assignment.clerkshipId,
            date: assignment.date,
          });
        });
        console.log(`[Engine] Successfully assigned ${electiveAssignments.length} days for "${elective.name}" to ${student.name}`);
      } else {
        validationResult.violations.forEach(violation => {
          this.resultBuilder.addViolation(violation);
        });

        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: elective.minimum_days,
          assignedDays: 0,
          remainingDays: elective.minimum_days,
          reason: `Validation failed: ${validationResult.violations.map(v => v.message).join(', ')}`,
        });
      }
    } catch (error) {
      console.error(`[Engine] Error scheduling ${student.name} to elective "${elective.name}":`, error);
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: `${clerkship.name} - ${elective.name}`,
        requirementType: 'elective',
        requiredDays: elective.minimum_days,
        assignedDays: 0,
        remainingDays: elective.minimum_days,
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
      elective_id: assignment.electiveId || null,
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

  /**
   * Run fallback gap filling for unmet requirements
   *
   * This phase runs AFTER primary scheduling completes to fill gaps
   * using preceptors from associated teams in priority order:
   * 1. Other preceptors on same team
   * 2. Preceptors on teams in same health system
   * 3. Preceptors on any team for clerkship (if cross-system allowed)
   */
  private async runFallbackGapFilling(
    unmetRequirements: UnmetRequirement[],
    options: { startDate: string; endDate: string }
  ): Promise<void> {
    // Convert unmet requirements to the format expected by gap filler
    const fallbackUnmetRequirements: FallbackUnmetRequirement[] = unmetRequirements.map(req => ({
      studentId: req.studentId,
      studentName: req.studentName,
      clerkshipId: req.clerkshipId,
      clerkshipName: req.clerkshipName,
      requirementType: req.requirementType,
      requiredDays: req.requiredDays,
      assignedDays: req.assignedDays,
      remainingDays: req.remainingDays,
      reason: req.reason,
      // Primary team info would need to be tracked during primary scheduling
      // For now, the gap filler will use the first team for the clerkship
      primaryTeamId: undefined,
      primaryHealthSystemId: undefined,
    }));

    // Run gap filling
    const result = await this.fallbackGapFiller.fillGaps(
      fallbackUnmetRequirements,
      this.pendingAssignments,
      this.clerkshipConfigs,
      options
    );

    console.log(`[Engine] Fallback filled ${result.assignments.length} additional assignments`);
    console.log(`[Engine] Fully fulfilled: ${result.fulfilledRequirements.length}, Partial: ${result.partialFulfillments.length}, Still unmet: ${result.stillUnmet.length}`);

    // Clear existing unmet requirements and rebuild based on fallback results
    this.resultBuilder.clearUnmetRequirements();

    // Add fallback assignments to result builder and pending assignments
    for (const assignment of result.assignments) {
      this.resultBuilder.addAssignment({
        studentId: assignment.studentId,
        preceptorId: assignment.preceptorId,
        clerkshipId: assignment.clerkshipId,
        date: assignment.date,
        // Add metadata about fallback
        metadata: {
          isFallback: true,
          fallbackTier: assignment.tier,
          fallbackTeamId: assignment.fallbackTeamId,
          originalTeamId: assignment.originalTeamId,
        },
      });

      // Track for capacity calculations
      this.pendingAssignments.push({
        studentId: assignment.studentId,
        preceptorId: assignment.preceptorId,
        clerkshipId: assignment.clerkshipId,
        date: assignment.date,
      });
    }

    // Add partial fulfillments back as unmet requirements
    for (const partial of result.partialFulfillments) {
      const config = this.clerkshipConfigs.get(partial.clerkshipId);
      const originalReq = unmetRequirements.find(
        r => r.studentId === partial.studentId && r.clerkshipId === partial.clerkshipId
      );

      this.resultBuilder.addUnmetRequirement({
        studentId: partial.studentId,
        studentName: originalReq?.studentName || 'Unknown',
        clerkshipId: partial.clerkshipId,
        clerkshipName: originalReq?.clerkshipName || 'Unknown',
        requirementType: config?.requirementType || 'outpatient',
        requiredDays: partial.requiredDays,
        assignedDays: partial.assignedDays,
        remainingDays: partial.requiredDays - partial.assignedDays,
        reason: `Partially fulfilled by fallback: ${partial.assignedDays}/${partial.requiredDays} days assigned`,
      });
    }

    // Add still unmet requirements
    for (const unmet of result.stillUnmet) {
      this.resultBuilder.addUnmetRequirement({
        studentId: unmet.studentId,
        studentName: unmet.studentName,
        clerkshipId: unmet.clerkshipId,
        clerkshipName: unmet.clerkshipName,
        requirementType: unmet.requirementType,
        requiredDays: unmet.requiredDays,
        assignedDays: unmet.assignedDays,
        remainingDays: unmet.remainingDays,
        reason: `${unmet.reason} (fallback also failed)`,
      });
    }
  }
}
