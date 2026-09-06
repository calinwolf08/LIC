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
import { StrategySelector, StrategyContextBuilder } from '../strategies';
import { FallbackResolver, FallbackGapFiller, type UnmetRequirement as FallbackUnmetRequirement } from '../fallback';
import { ResultBuilder, type SchedulingResult, type UnmetRequirement } from './result-builder';
import { ProposalValidator } from './proposal-validator';
import { getEligiblePreceptorIds } from '../eligibility/eligibility';
import { AssignmentStrategy } from '$lib/features/scheduling-config/types';
import { insertGeneratedAssignments } from '$lib/features/schedules/services/assignment-service';
import {
  ClerkshipSettingsService,
  type ClerkshipSettings,
} from '$lib/features/clerkships/services/clerkship-settings.service';

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
  /**
   * The schedule this run belongs to. When set, preceptor eligibility is
   * limited to that schedule's `schedule_preceptors` and committed rows carry
   * the id (review finding F-02). Left undefined by direct engine callers
   * (tests), which keeps the pre-scoping behaviour.
   */
  scheduleId?: string;
  /**
   * Days already satisfied per student per clerkship (non-elective portion),
   * subtracted from each clerkship's required days so past, locked and existing
   * assignments are credited instead of re-scheduled (review finding F-01).
   * Map: studentId -> clerkshipId -> days.
   */
  credit?: Map<string, Map<string, number>>;
  /**
   * Days already satisfied per student per elective, subtracted from each
   * elective's minimum days. Map: studentId -> electiveId -> days.
   */
  electiveCredit?: Map<string, Map<string, number>>;
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
  private fallbackResolver: FallbackResolver;
  private fallbackGapFiller: FallbackGapFiller;
  private resultBuilder: ResultBuilder;
  private clerkshipSettingsService: ClerkshipSettingsService;
  private proposalValidator: ProposalValidator | null = null;
  private proposalBudget = Number.MAX_SAFE_INTEGER;
  private proposalsUsed = 0;
  private clerkshipConfigs: Map<string, ResolvedRequirementConfiguration> = new Map();
  private electiveConfigs: Map<string, ResolvedRequirementConfiguration> = new Map();
  private electivesByClerkship: Map<string, any[]> = new Map();
  private pendingAssignments: PendingAssignment[] = [];

  constructor(private db: Kysely<DB>) {
    this.strategySelector = new StrategySelector();
    this.contextBuilder = new StrategyContextBuilder(db);
    this.fallbackResolver = new FallbackResolver(db);
    this.fallbackGapFiller = new FallbackGapFiller(db);
    this.resultBuilder = new ResultBuilder();
    this.clerkshipSettingsService = new ClerkshipSettingsService(db);
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
      scheduleId,
      credit,
      electiveCredit,
    } = options;

    this.resultBuilder.reset();
    this.clerkshipConfigs.clear();
    this.electiveConfigs.clear();
    this.electivesByClerkship.clear();
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

    // Phase 3: Prepare the proposal validator. Every proposed day is checked
    // through the single validateAssignmentCandidate validator (F-05), using the
    // run's bypassedConstraints (Stage 1 codes) to decide which soft violations
    // are accepted-with-override vs surfaced (F-11).
    this.proposalValidator = new ProposalValidator(
      this.db,
      scheduleId ?? null,
      new Set(bypassedConstraints)
    );

    // Phase 4: Prioritize students
    console.log('[Engine] Prioritizing students...');
    const prioritizedStudents = this.prioritizeStudents(students);

    // Phase 5: Schedule (student, clerkship) pairs in scarcity order (D-01) —
    // tightest requirements first — with a deterministic tie-break so a run is
    // reproducible. A proposal budget guards against a mis-configured range
    // hanging the request.
    const candidateDays = await this.computeCandidateDays(
      clerkshipIds,
      startDate,
      endDate,
      scheduleId
    );
    const orderedPairs = this.orderPairsByScarcity(
      prioritizedStudents,
      clerkships,
      candidateDays,
      credit
    );

    const rangeDays = Math.max(1, this.countDays(startDate, endDate));
    this.proposalBudget = Math.max(
      10000,
      prioritizedStudents.length * clerkships.length * rangeDays
    );
    this.proposalsUsed = 0;

    for (const { student, clerkship } of orderedPairs) {
      if (this.proposalsUsed > this.proposalBudget) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id!,
          studentName: student.name,
          clerkshipId: clerkship.id!,
          clerkshipName: clerkship.name,
          requirementType: (clerkship.clerkship_type || 'outpatient') as any,
          requiredDays: clerkship.required_days,
          assignedDays: 0,
          remainingDays: clerkship.required_days,
          reason: 'Generation budget exhausted before this requirement could be scheduled',
        });
        continue;
      }
      await this.scheduleStudentToClerkship(student, clerkship, {
        startDate,
        endDate,
        enableTeamFormation,
        enableFallbacks,
        maxRetries: maxRetriesPerStudent,
        bypassedConstraints: new Set(bypassedConstraints),
        scheduleId,
        credit,
        electiveCredit,
      });
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
      await this.commitAssignments(result.assignments, scheduleId);
    }

    return result;
  }

  /**
   * Load resolved configurations for all clerkships
   *
   * With the new model:
   * - Each clerkship has a type (inpatient/outpatient) directly on the clerkship record
   * - Electives link directly to clerkships via clerkship_id
   * - Non-elective days = clerkship.required_days - sum(elective.minimum_days)
   */
  private async loadClerkshipConfigurations(
    clerkshipIds: string[],
    clerkships: Clerkship[]
  ): Promise<void> {
    // Load all electives for these clerkships
    const electives = await this.db
      .selectFrom('clerkship_electives')
      .selectAll()
      .where('clerkship_id', 'in', clerkshipIds)
      .execute();

    // Load site and preceptor associations for electives
    const electiveIds = electives.map(e => e.id).filter((id): id is string => id !== null);
    const [siteAssociations, preceptorAssociations] = electiveIds.length > 0
      ? await Promise.all([
          this.db.selectFrom('elective_sites').selectAll().where('elective_id', 'in', electiveIds).execute(),
          this.db.selectFrom('elective_preceptors').selectAll().where('elective_id', 'in', electiveIds).execute(),
        ])
      : [[], []];

    // Group electives by clerkship_id with their associations
    for (const clerkship of clerkships) {
      if (!clerkship.id) continue;

      const clerkshipElectives = electives
        .filter(e => e.clerkship_id === clerkship.id)
        .map(elective => ({
          ...elective,
          siteIds: siteAssociations
            .filter(sa => sa.elective_id === elective.id)
            .map(sa => sa.site_id),
          preceptorIds: preceptorAssociations
            .filter(pa => pa.elective_id === elective.id)
            .map(pa => pa.preceptor_id),
        }));

      this.electivesByClerkship.set(clerkship.id, clerkshipElectives);
    }

    // Build resolved configuration for each clerkship. Configuration is resolved
    // through the single source of truth — `ClerkshipSettingsService` — so that
    // per-clerkship overrides (`clerkship_configurations.override_*`) actually
    // take effect during generation (review finding F-08), matching what the
    // Stage 2 settings UI shows.
    for (const clerkship of clerkships) {
      if (!clerkship.id) continue;

      const requirementType = (clerkship.clerkship_type ||
        'outpatient') as ResolvedRequirementConfiguration['requirementType'];

      // Calculate non-elective days.
      // Only REQUIRED electives carve days out of the clerkship's required total
      // (review finding F-09): optional electives (`is_required = 0`) are never
      // scheduled by the engine, so subtracting their `minimum_days` here would
      // silently shrink the clerkship and report it complete while under-scheduled.
      // Optional electives are additive alternatives, not part of the required count.
      const clerkshipElectives = this.electivesByClerkship.get(clerkship.id) || [];
      const totalElectiveDays = clerkshipElectives
        .filter(e => e.is_required)
        .reduce((sum, e) => sum + (e.minimum_days || 0), 0);
      const nonElectiveDays = Math.max(0, clerkship.required_days - totalElectiveDays);

      const settings = await this.clerkshipSettingsService.getClerkshipSettings(clerkship.id);
      this.clerkshipConfigs.set(
        clerkship.id,
        this.settingsToConfig(clerkship.id, requirementType, nonElectiveDays, settings)
      );

      // Resolve each elective's own configuration (review finding F-10) so the
      // elective's strategy, health-system rule, capacity and fallback settings
      // drive its scheduling rather than the parent clerkship's.
      for (const elective of clerkshipElectives) {
        if (!elective.id) continue;
        const electiveSettings = await this.clerkshipSettingsService.getElectiveSettings(
          elective.id
        );
        this.electiveConfigs.set(
          elective.id,
          this.settingsToConfig(
            clerkship.id,
            'elective',
            elective.minimum_days,
            electiveSettings,
            elective.id
          )
        );
      }
    }
  }

  /**
   * Map fully-resolved settings (from `ClerkshipSettingsService`) onto the
   * `ResolvedRequirementConfiguration` shape the strategies and constraints use.
   * `requiredDays` and `requirementType` are supplied by the caller because they
   * are computed by the engine (non-elective remainder / elective minimum), not
   * stored on the settings row.
   */
  private settingsToConfig(
    clerkshipId: string,
    requirementType: ResolvedRequirementConfiguration['requirementType'],
    requiredDays: number,
    settings: ClerkshipSettings,
    requirementId?: string
  ): ResolvedRequirementConfiguration {
    return {
      clerkshipId,
      requirementId,
      requirementType,
      requiredDays,
      assignmentStrategy:
        (settings.assignmentStrategy as ResolvedRequirementConfiguration['assignmentStrategy']) ||
        AssignmentStrategy.CONTINUOUS_SINGLE,
      healthSystemRule:
        settings.healthSystemRule as ResolvedRequirementConfiguration['healthSystemRule'],
      maxStudentsPerDay: settings.maxStudentsPerDay,
      maxStudentsPerYear: settings.maxStudentsPerYear,
      blockSizeDays: settings.blockSizeDays,
      allowPartialBlocks: settings.allowPartialBlocks,
      preferContinuousBlocks: settings.preferContinuousBlocks,
      maxStudentsPerBlock: settings.maxStudentsPerBlock,
      maxBlocksPerYear: settings.maxBlocksPerYear,
      allowTeams: settings.allowTeams,
      teamSizeMin: settings.teamSizeMin,
      teamSizeMax: settings.teamSizeMax,
      allowFallbacks: settings.allowFallbacks,
      fallbackRequiresApproval: settings.fallbackRequiresApproval,
      fallbackAllowCrossSystem: settings.fallbackAllowCrossSystem,
      source: settings.overrideMode === 'override' ? 'full_override' : 'global_defaults',
    };
  }

  /**
   * Schedule single student to single clerkship
   *
   * With the new model:
   * 1. First schedules all required electives for the clerkship
   * 2. Then schedules the remaining non-elective days (clerkship.required_days - sum of elective days)
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
      scheduleId?: string;
      credit?: Map<string, Map<string, number>>;
      electiveCredit?: Map<string, Map<string, number>>;
    }
  ): Promise<void> {
    // Validate required IDs
    if (!student.id || !clerkship.id) {
      console.error('[Engine] Student or clerkship missing valid ID');
      return;
    }

    try {
      // Get configuration for this clerkship
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

      // Step 1: Schedule all required electives first
      const electives = this.electivesByClerkship.get(clerkship.id) || [];
      const requiredElectives = electives.filter(e => e.is_required);

      if (requiredElectives.length > 0) {
        console.log(`[Engine] Scheduling ${requiredElectives.length} required electives for ${student.name} in ${clerkship.name}`);

        for (const elective of requiredElectives) {
          // Use the elective's own resolved configuration (F-10), falling back
          // to the clerkship config only if it somehow was not resolved.
          const electiveConfig =
            (elective.id && this.electiveConfigs.get(elective.id)) || config;
          await this.scheduleStudentToElective(
            student,
            clerkship,
            elective,
            electiveConfig,
            options
          );
        }
      }

      // Step 2: Schedule non-elective days (if any remaining after credit).
      // Existing/past/locked days already satisfying this clerkship are credited
      // (review finding F-01) so the engine only schedules what is still needed.
      const nonElectiveCredit = options.credit?.get(student.id)?.get(clerkship.id) ?? 0;
      const remainingNonElective = Math.max(0, config.requiredDays - nonElectiveCredit);
      if (remainingNonElective > 0) {
        console.log(`[Engine] Scheduling ${remainingNonElective} non-elective days for ${student.name} in ${clerkship.name} (credited ${nonElectiveCredit})`);
        await this.scheduleStudentNonElectiveDays(
          student,
          clerkship,
          { ...config, requiredDays: remainingNonElective },
          options
        );
      }
    } catch (error) {
      console.error(`[Engine] Error scheduling ${student.name} to ${clerkship.name}:`, error);
    }
  }

  /**
   * Schedule non-elective days for a student within a clerkship
   *
   * These are the regular clerkship days that aren't part of any elective.
   */
  private async scheduleStudentNonElectiveDays(
    student: Student,
    clerkship: Clerkship,
    config: ResolvedRequirementConfiguration,
    options: {
      startDate: string;
      endDate: string;
      enableTeamFormation: boolean;
      enableFallbacks: boolean;
      maxRetries: number;
      bypassedConstraints: Set<string>;
      scheduleId?: string;
      credit?: Map<string, Map<string, number>>;
      electiveCredit?: Map<string, Map<string, number>>;
    }
  ): Promise<void> {
    try {
      // Build strategy context with proper date range and pending assignments
      const context = await this.contextBuilder.buildContext(student, clerkship, config, {
        startDate: options.startDate,
        endDate: options.endDate,
        requirementType: config.requirementType,
        pendingAssignments: this.pendingAssignments,
        scheduleId: options.scheduleId,
      });

      // Get dates already assigned to this student (to avoid conflicts with electives)
      const studentAssignedDates = new Set(
        this.pendingAssignments
          .filter(a => a.studentId === student.id)
          .map(a => a.date)
      );

      // Filter context.availableDates to exclude student's assigned dates
      context.availableDates = context.availableDates.filter(date => !studentAssignedDates.has(date));

      // Select strategy based on configuration
      const strategy = this.strategySelector.selectStrategy(config);
      if (!strategy) {
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id!,
          studentName: student.name,
          clerkshipId: clerkship.id!,
          clerkshipName: clerkship.name,
          requirementType: config.requirementType,
          requiredDays: config.requiredDays,
          assignedDays: 0,
          remainingDays: config.requiredDays,
          reason: `No suitable strategy found for ${config.assignmentStrategy}`,
        });
        return;
      }

      console.log(`[Engine] Using strategy: ${strategy.getName()} for ${clerkship.name} (non-elective days)`);
      const result = await strategy.generateAssignments(context);

      // Process any assignments (even partial ones when success=false)
      const assignmentsToProcess = result.assignments || [];

      // Only assignments that survive validation count as scheduled — a rejected
      // batch must be reported as unmet, not silently counted (review finding F-06).
      let acceptedDays = 0;
      const rejectionReasons: string[] = [];

      if (assignmentsToProcess.length > 0) {
        // Validate assignments against the single validator (F-05).
        const validationResult = await this.validateAssignments(
          assignmentsToProcess,
          options.bypassedConstraints
        );

        // Always record violations on the run — soft (warning) violations are
        // surfaced even when the day is placed, so a problematic auto schedule no
        // longer reports zero issues (F-05).
        validationResult.violations.forEach(violation => {
          this.resultBuilder.addViolation(violation);
          if (violation.severity === 'error' && violation.message) {
            rejectionReasons.push(violation.message);
          }
        });

        if (validationResult.isValid) {
          // Add assignments to result and track as pending for future students
          assignmentsToProcess.forEach(assignment => {
            this.resultBuilder.addAssignment(assignment);
            // Track pending assignment for capacity calculations
            this.pendingAssignments.push({
              studentId: assignment.studentId,
              preceptorId: assignment.preceptorId,
              clerkshipId: assignment.clerkshipId,
              date: assignment.date,
            });
          });
          acceptedDays = assignmentsToProcess.length;
          console.log(`[Engine] Successfully assigned ${acceptedDays} non-elective days for ${student.name} to ${clerkship.name}`);
        }
      }

      // Record unmet requirement from ACCEPTED days, not proposed ones.
      if (acceptedDays < config.requiredDays) {
        const uniqueReasons = [...new Set(rejectionReasons)];
        const reason =
          uniqueReasons.length > 0
            ? `Rejected by constraints: ${uniqueReasons.join('; ')}`
            : result.error || `Only ${acceptedDays} of ${config.requiredDays} days could be assigned`;
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id!,
          studentName: student.name,
          clerkshipId: clerkship.id!,
          clerkshipName: clerkship.name,
          requirementType: config.requirementType,
          requiredDays: config.requiredDays,
          assignedDays: acceptedDays,
          remainingDays: config.requiredDays - acceptedDays,
          reason,
        });
      }
    } catch (error) {
      console.error(`[Engine] Error scheduling ${student.name} non-elective days in ${clerkship.name}:`, error);
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id!,
        studentName: student.name,
        clerkshipId: clerkship.id!,
        clerkshipName: clerkship.name,
        requirementType: config.requirementType,
        requiredDays: config.requiredDays,
        assignedDays: 0,
        remainingDays: config.requiredDays,
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
      scheduleId?: string;
      credit?: Map<string, Map<string, number>>;
      electiveCredit?: Map<string, Map<string, number>>;
    }
  ): Promise<void> {
    if (!student.id || !clerkship.id || !elective.id) {
      console.error('[Engine] Student, clerkship, or elective missing valid ID');
      return;
    }

    // Credit elective days already satisfied (review finding F-01); schedule only
    // what remains. Nothing to do when the elective is already complete.
    const electiveCreditDays = options.electiveCredit?.get(student.id)?.get(elective.id) ?? 0;
    const remainingMin = Math.max(0, elective.minimum_days - electiveCreditDays);
    if (remainingMin === 0) {
      return;
    }

    try {
      console.log(`[Engine] Scheduling elective "${elective.name}" (${remainingMin} of ${elective.minimum_days} days remaining) for ${student.name}`);

      // Create modified config with the elective's remaining days
      const electiveConfig = {
        ...config,
        requiredDays: remainingMin,
      };

      // Build strategy context (don't use its preceptor list, we'll build our own)
      const context = await this.contextBuilder.buildContext(student, clerkship, electiveConfig as any, {
        startDate: options.startDate,
        endDate: options.endDate,
        requirementType: 'elective',
        pendingAssignments: this.pendingAssignments,
        scheduleId: options.scheduleId,
      });

      // Get dates already assigned to this student (to avoid conflicts with other electives)
      const studentAssignedDates = new Set(
        this.pendingAssignments
          .filter(a => a.studentId === student.id)
          .map(a => a.date)
      );

      // Filter context.availableDates to exclude student's assigned dates
      context.availableDates = context.availableDates.filter(date => !studentAssignedDates.has(date));

      // For electives, load preceptors directly from elective associations (not from teams)
      if (elective.preceptorIds && elective.preceptorIds.length > 0) {
        const preceptorRecords = await this.db
          .selectFrom('preceptors')
          .selectAll()
          .where('id', 'in', elective.preceptorIds)
          .execute();

        // Get availability for these preceptors
        const availability = await this.db
          .selectFrom('preceptor_availability')
          .select(['preceptor_id', 'date', 'site_id'])
          .where('preceptor_id', 'in', elective.preceptorIds)
          .where('is_available', '=', 1)
          .execute();

        // Build available preceptors list with their availability, excluding student's assigned dates
        context.availablePreceptors = preceptorRecords
          .filter((p): p is typeof p & { id: string } => p.id !== null)
          .map(preceptor => {
            const preceptorAvailability = availability.filter(a => a.preceptor_id === preceptor.id);
            const availableDates = preceptorAvailability
              .map(a => a.date)
              .filter(date => !studentAssignedDates.has(date)); // Exclude dates student is already assigned

            return {
              id: preceptor.id,
              name: preceptor.name,
              healthSystemId: preceptor.health_system_id,
              siteId: null, // Site determined by availability, not preceptor record
              siteIds: [], // Sites determined by availability
              availability: availableDates,
              currentAssignmentCount: 0,
              // Use preceptor's max_students setting for daily capacity
              maxStudentsPerDay: preceptor.max_students ?? config.maxStudentsPerDay ?? 1,
              maxStudentsPerYear: config.maxStudentsPerYear,
            };
          });
      } else {
        context.availablePreceptors = [];
      }

      if (context.availablePreceptors.length === 0) {
        console.warn(`[Engine] No available preceptors for elective "${elective.name}"`);
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: remainingMin,
          assignedDays: 0,
          remainingDays: remainingMin,
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
          requiredDays: remainingMin,
          assignedDays: 0,
          remainingDays: remainingMin,
          reason: `No suitable strategy found for ${config.assignmentStrategy}`,
        });
        return;
      }

      const result = await strategy.generateAssignments(context);

      // Process any assignments (even partial ones when success=false)
      const assignmentsToProcess = result.assignments || [];

      // Only validated assignments count (review finding F-06).
      let acceptedDays = 0;
      const rejectionReasons: string[] = [];

      if (assignmentsToProcess.length > 0) {
        // Add elective_id to all assignments
        const electiveAssignments = assignmentsToProcess.map(assignment => ({
          ...assignment,
          electiveId: elective.id,
          requirementType: 'elective' as const,
        }));

        // Validate assignments
        const validationResult = await this.validateAssignments(
          electiveAssignments,
          options.bypassedConstraints
        );

        validationResult.violations.forEach(violation => {
          this.resultBuilder.addViolation(violation);
          if (violation.severity === 'error' && violation.message) {
            rejectionReasons.push(violation.message);
          }
        });

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
          acceptedDays = electiveAssignments.length;
          console.log(`[Engine] Successfully assigned ${acceptedDays} days for "${elective.name}" to ${student.name}`);
        }
      }

      // Record unmet requirement from ACCEPTED days.
      if (acceptedDays < remainingMin) {
        const uniqueReasons = [...new Set(rejectionReasons)];
        const reason =
          uniqueReasons.length > 0
            ? `Rejected by constraints: ${uniqueReasons.join('; ')}`
            : result.error || `Only ${acceptedDays} of ${remainingMin} elective days could be assigned`;
        this.resultBuilder.addUnmetRequirement({
          studentId: student.id,
          studentName: student.name,
          clerkshipId: clerkship.id,
          clerkshipName: `${clerkship.name} - ${elective.name}`,
          requirementType: 'elective',
          requiredDays: remainingMin,
          assignedDays: acceptedDays,
          remainingDays: remainingMin - acceptedDays,
          reason,
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
    _bypassedConstraints: Set<string>
  ): Promise<{
    isValid: boolean;
    violations: any[];
  }> {
    const violations: any[] = [];
    const validator = this.proposalValidator;
    // Every proposal evaluated counts against the run's budget (D-01).
    this.proposalsUsed += assignments.length;

    for (const assignment of assignments) {
      if (!validator) break;
      const decision = await validator.validate({
        studentId: assignment.studentId,
        preceptorId: assignment.preceptorId,
        clerkshipId: assignment.clerkshipId,
        date: assignment.date,
      });

      // Hard violations block the day (should be rare — strategies avoid
      // double-booking by construction).
      for (const v of decision.hard) {
        violations.push({
          studentId: assignment.studentId,
          preceptorId: assignment.preceptorId,
          date: assignment.date,
          constraintType: v.code,
          severity: 'error',
          message: v.message,
        });
      }

      // Soft violations not covered by bypassedConstraints are surfaced on the
      // run (no longer silently zero — F-05); the day is still placed. Bypassed
      // soft codes are stamped on the row as override_codes (F-11), so the
      // health panel shows a bypassed auto day exactly like a manual override.
      for (const v of decision.surfaced) {
        violations.push({
          studentId: assignment.studentId,
          preceptorId: assignment.preceptorId,
          date: assignment.date,
          constraintType: v.code,
          severity: 'warning',
          message: v.message,
        });
      }

      assignment.overrideCodes = decision.overrideCodes;
    }

    // A batch is invalid only when a HARD violation was found; soft violations
    // are recorded but do not reject the batch.
    const hasHard = violations.some((v) => v.severity === 'error');
    return { isValid: !hasHard, violations };
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

  /** Inclusive count of calendar days in a date range. */
  private countDays(startDate: string, endDate: string): number {
    const start = new Date(startDate + 'T00:00:00.000Z').getTime();
    const end = new Date(endDate + 'T00:00:00.000Z').getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
    return Math.floor((end - start) / 86400000) + 1;
  }

  /**
   * Candidate supply per clerkship: how many preceptor-available slots exist for
   * the clerkship's eligible preceptors within the range (design §4). Used as the
   * denominator of the scarcity score, so a clerkship with few open days is
   * scheduled before one with plenty.
   */
  private async computeCandidateDays(
    clerkshipIds: string[],
    startDate: string,
    endDate: string,
    scheduleId?: string
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const clerkshipId of clerkshipIds) {
      const eligible = await getEligiblePreceptorIds(this.db, clerkshipId, { scheduleId });
      if (eligible.size === 0) {
        result.set(clerkshipId, 0);
        continue;
      }
      const row = await this.db
        .selectFrom('preceptor_availability')
        .select(({ fn }) => [fn.count<number>('id').as('c')])
        .where('preceptor_id', 'in', [...eligible])
        .where('is_available', '=', 1)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .executeTakeFirst();
      result.set(clerkshipId, Number(row?.c ?? 0));
    }
    return result;
  }

  /**
   * Order (student, clerkship) pairs by scarcity — `remainingDays / candidateDays`
   * descending, so the tightest requirements are placed first — with a
   * deterministic id tie-break for reproducibility (design §4 / D-01).
   */
  private orderPairsByScarcity(
    students: Student[],
    clerkships: Clerkship[],
    candidateDays: Map<string, number>,
    credit?: Map<string, Map<string, number>>
  ): Array<{ student: Student; clerkship: Clerkship; score: number }> {
    const pairs: Array<{ student: Student; clerkship: Clerkship; score: number }> = [];
    for (const student of students) {
      for (const clerkship of clerkships) {
        if (!student.id || !clerkship.id) continue;
        const config = this.clerkshipConfigs.get(clerkship.id);
        const required = config?.requiredDays ?? clerkship.required_days;
        const credited = credit?.get(student.id)?.get(clerkship.id) ?? 0;
        const remaining = Math.max(0, required - credited);
        const supply = candidateDays.get(clerkship.id) ?? 0;
        // Scarcer (higher remaining per available slot) sorts first. A clerkship
        // with zero supply is maximally scarce.
        const score = supply === 0 ? Number.POSITIVE_INFINITY : remaining / supply;
        pairs.push({ student, clerkship, score });
      }
    }
    return pairs.sort(
      (a, b) =>
        b.score - a.score ||
        a.student.id!.localeCompare(b.student.id!) ||
        a.clerkship.id!.localeCompare(b.clerkship.id!)
    );
  }

  /**
   * Commit assignments to database.
   *
   * Delegates to the single generated-assignment persistence path
   * (`insertGeneratedAssignments`) so engine-committed rows and route-saved
   * rows are stamped identically — `schedule_id`, resolved `site_id`,
   * `elective_id`, `source='generated'` (review findings F-14 / P-10). Occupied
   * (student, date) slots (locked / manual rows) are skipped.
   */
  private async commitAssignments(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: any[],
    scheduleId?: string
  ): Promise<void> {
    if (assignments.length === 0) return;

    const { inserted, skipped } = await insertGeneratedAssignments(
      this.db,
      scheduleId ?? null,
      assignments.map((a) => ({
        studentId: a.studentId,
        preceptorId: a.preceptorId,
        clerkshipId: a.clerkshipId,
        date: a.date,
        electiveId: a.electiveId ?? null,
        overrideCodes: a.overrideCodes ?? [],
        status: a.status,
      }))
    );

    console.log(
      `[Engine] Committed ${inserted.length} assignments to database (${skipped.length} slots already occupied)`
    );
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
      // Honour fallbackRequiresApproval (F-17 residue): a fallback day for a
      // clerkship that requires sign-off is written `pending_approval` rather
      // than `scheduled`, so a coordinator can review it.
      const requiresApproval =
        this.clerkshipConfigs.get(assignment.clerkshipId)?.fallbackRequiresApproval ?? false;
      this.resultBuilder.addAssignment({
        studentId: assignment.studentId,
        preceptorId: assignment.preceptorId,
        clerkshipId: assignment.clerkshipId,
        date: assignment.date,
        status: requiresApproval ? 'pending_approval' : undefined,
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
