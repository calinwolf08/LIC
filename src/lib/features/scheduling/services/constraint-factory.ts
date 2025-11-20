/**
 * Constraint Factory Service
 *
 * Bridges database-stored requirements and runtime constraint instances.
 * Implements the factory pattern to dynamically instantiate constraints
 * based on clerkship requirements and global configuration.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Constraint } from '../types/constraint';
import type { SchedulingContext } from '../types/scheduling-context';

// Import existing constraints
import { BlackoutDateConstraint } from '../constraints/blackout-date.constraint';
import { NoDoubleBookingConstraint } from '../constraints/no-double-booking.constraint';
import { SpecialtyMatchConstraint } from '../constraints/specialty-match.constraint';

// Import new constraints
import { HealthSystemContinuityConstraint } from '../constraints/health-system-continuity.constraint';
import { StudentOnboardingConstraint } from '../constraints/student-onboarding.constraint';
import { PreceptorClerkshipAssociationConstraint } from '../constraints/preceptor-clerkship-association.constraint';

// Import site-based constraints
import { SiteContinuityConstraint } from '../constraints/site-continuity.constraint';
import { SiteAvailabilityConstraint } from '../constraints/site-availability.constraint';
import { SiteCapacityConstraint } from '../constraints/site-capacity.constraint';
import { ValidSiteForClerkshipConstraint } from '../constraints/valid-site-for-clerkship.constraint';
import { SamePreceptorTeamConstraint } from '../constraints/same-preceptor-team.constraint';

interface ClerkshipRequirement {
	id: string | null;
	clerkship_id: string;
	requirement_type: string;
	required_days: number;
	allow_cross_system: number;
	require_same_site: number;
	require_same_preceptor_team: number;
	override_mode: string;
	override_assignment_strategy: string | null;
	override_health_system_rule: string | null;
	override_block_length_days: number | null;
	override_allow_split_assignments: number | null;
	override_preceptor_continuity_preference: string | null;
	override_team_continuity_preference: string | null;
	created_at: string;
	updated_at: string;
}

interface GlobalDefaults {
	assignment_strategy?: string;
	health_system_rule?: string;
	block_length_days?: number;
	allow_split_assignments?: number;
	preceptor_continuity_preference?: string;
	team_continuity_preference?: string;
}

interface ResolvedConfiguration {
	requirementId: string | null;
	clerkshipId: string;
	requirementType: string;
	requiredDays: number;
	allowCrossSystem: boolean;
	assignmentStrategy: string;
	healthSystemRule: string;
	blockLengthDays?: number;
	allowSplitAssignments: boolean;
	preceptorContinuityPreference: string;
	teamContinuityPreference: string;
}

/**
 * ConstraintFactory - Dynamically builds constraints from database configuration
 */
export class ConstraintFactory {
	constructor(private db: Kysely<DB>) {}

	/**
	 * Build complete constraint set for given clerkships
	 *
	 * @param clerkshipIds - Array of clerkship IDs to build constraints for
	 * @param context - Scheduling context (for accessing master data)
	 * @returns Array of constraint instances ready for validation
	 */
	async buildConstraints(
		clerkshipIds: string[],
		context: SchedulingContext
	): Promise<Constraint[]> {
		const constraints: Constraint[] = [];

		// 1. Add base constraints (always present)
		constraints.push(new BlackoutDateConstraint());
		constraints.push(new NoDoubleBookingConstraint());
		constraints.push(new SpecialtyMatchConstraint());

		// 1b. Add site-based constraints (context-dependent)
		if (context.siteAvailability) {
			constraints.push(new SiteAvailabilityConstraint());
		}

		if (context.siteCapacityRules) {
			constraints.push(new SiteCapacityConstraint());
		}

		if (context.clerkshipSites || context.preceptorClerkshipAssociations) {
			constraints.push(new ValidSiteForClerkshipConstraint());
		}

		// 2. Load requirements for the given clerkships
		const requirements = await this.loadRequirements(clerkshipIds);

		// 3. Load global defaults
		const [outpatientDefaults, inpatientDefaults, electiveDefaults] = await Promise.all([
			this.loadGlobalDefaults('outpatient'),
			this.loadGlobalDefaults('inpatient'),
			this.loadGlobalDefaults('elective')
		]);

		// 4. Build requirement-specific constraints
		for (const requirement of requirements) {
			// Skip requirements without IDs (shouldn't happen in practice)
			if (!requirement.id) {
				continue;
			}

			// Resolve configuration by merging global defaults with requirement overrides
			const config = this.resolveConfiguration(
				requirement,
				outpatientDefaults,
				inpatientDefaults,
				electiveDefaults
			);

			// Instantiate constraints based on resolved configuration

			// Health system continuity constraint
			if (config.healthSystemRule === 'enforce_same_system' && config.requirementId) {
				constraints.push(
					new HealthSystemContinuityConstraint(
						config.requirementId,
						config.clerkshipId,
						config.allowCrossSystem
					)
				);
			}

			// Student onboarding constraint (if context has onboarding data)
			if (context.studentOnboarding && config.requirementId) {
				constraints.push(
					new StudentOnboardingConstraint(config.requirementId, config.clerkshipId)
				);
			}

			// Preceptor association constraint (if context has association data)
			if (
				(context.preceptorClerkshipAssociations || context.preceptorElectiveAssociations) &&
				config.requirementId
			) {
				constraints.push(
					new PreceptorClerkshipAssociationConstraint(
						config.requirementId,
						config.clerkshipId,
						config.requirementType as 'inpatient' | 'outpatient' | 'elective'
					)
				);
			}

			// Site continuity constraint
			if (requirement.require_same_site === 1 && config.requirementId) {
				constraints.push(
					new SiteContinuityConstraint(
						config.requirementId,
						config.clerkshipId,
						true
					)
				);
			}

			// Same preceptor team constraint
			if (requirement.require_same_preceptor_team === 1 && config.requirementId) {
				constraints.push(
					new SamePreceptorTeamConstraint(
						config.requirementId,
						config.clerkshipId,
						true
					)
				);
			}
		}

		// Sort by priority (lower priority = checked first)
		return constraints.sort((a, b) => (a.priority || 99) - (b.priority || 99));
	}

	/**
	 * Load requirements for given clerkships from database
	 */
	private async loadRequirements(clerkshipIds: string[]): Promise<ClerkshipRequirement[]> {
		if (clerkshipIds.length === 0) {
			return [];
		}

		return await this.db
			.selectFrom('clerkship_requirements')
			.selectAll()
			.where('clerkship_id', 'in', clerkshipIds)
			.execute();
	}

	/**
	 * Load global defaults for a requirement type
	 */
	private async loadGlobalDefaults(
		requirementType: 'inpatient' | 'outpatient' | 'elective'
	): Promise<GlobalDefaults | null> {
		const tableName =
			requirementType === 'inpatient'
				? 'global_inpatient_defaults'
				: requirementType === 'outpatient'
					? 'global_outpatient_defaults'
					: 'global_elective_defaults';

		const result = await this.db
			.selectFrom(tableName as any)
			.selectAll()
			.where('school_id', '=', 'default')
			.executeTakeFirst();

		return result || null;
	}

	/**
	 * Resolve configuration by merging global defaults with requirement overrides
	 */
	private resolveConfiguration(
		requirement: ClerkshipRequirement,
		outpatientDefaults: GlobalDefaults | null,
		inpatientDefaults: GlobalDefaults | null,
		electiveDefaults: GlobalDefaults | null
	): ResolvedConfiguration {
		// Select appropriate global defaults based on requirement type
		let globalDefaults: GlobalDefaults | null = null;
		if (requirement.requirement_type === 'outpatient') {
			globalDefaults = outpatientDefaults;
		} else if (requirement.requirement_type === 'inpatient') {
			globalDefaults = inpatientDefaults;
		} else if (requirement.requirement_type === 'elective') {
			globalDefaults = electiveDefaults;
		}

		// Start with global defaults or sensible fallbacks
		const resolved: ResolvedConfiguration = {
			requirementId: requirement.id,
			clerkshipId: requirement.clerkship_id,
			requirementType: requirement.requirement_type,
			requiredDays: requirement.required_days,
			allowCrossSystem: requirement.allow_cross_system === 1,
			assignmentStrategy: globalDefaults?.assignment_strategy || 'continuous_single',
			healthSystemRule: globalDefaults?.health_system_rule || 'enforce_same_system',
			blockLengthDays: globalDefaults?.block_length_days || undefined,
			allowSplitAssignments: (globalDefaults?.allow_split_assignments ?? 0) === 1,
			preceptorContinuityPreference:
				globalDefaults?.preceptor_continuity_preference || 'prefer_same',
			teamContinuityPreference: globalDefaults?.team_continuity_preference || 'prefer_same'
		};

		// If override mode is 'inherit', return as-is
		if (requirement.override_mode === 'inherit') {
			return resolved;
		}

		// Apply field-specific overrides
		if (requirement.override_assignment_strategy) {
			resolved.assignmentStrategy = requirement.override_assignment_strategy;
		}
		if (requirement.override_health_system_rule) {
			resolved.healthSystemRule = requirement.override_health_system_rule;
		}
		if (requirement.override_block_length_days !== null) {
			resolved.blockLengthDays = requirement.override_block_length_days || undefined;
		}
		if (requirement.override_allow_split_assignments !== null) {
			resolved.allowSplitAssignments = requirement.override_allow_split_assignments === 1;
		}
		if (requirement.override_preceptor_continuity_preference) {
			resolved.preceptorContinuityPreference =
				requirement.override_preceptor_continuity_preference;
		}
		if (requirement.override_team_continuity_preference) {
			resolved.teamContinuityPreference = requirement.override_team_continuity_preference;
		}

		return resolved;
	}

	/**
	 * Get resolved configuration for a specific requirement (for UI display)
	 */
	async getResolvedConfiguration(requirementId: string): Promise<ResolvedConfiguration | null> {
		// Load the requirement
		const requirement = await this.db
			.selectFrom('clerkship_requirements')
			.selectAll()
			.where('id', '=', requirementId)
			.executeTakeFirst();

		if (!requirement) {
			return null;
		}

		// Load global defaults
		const [outpatientDefaults, inpatientDefaults, electiveDefaults] = await Promise.all([
			this.loadGlobalDefaults('outpatient'),
			this.loadGlobalDefaults('inpatient'),
			this.loadGlobalDefaults('elective')
		]);

		// Resolve and return
		return this.resolveConfiguration(
			requirement as ClerkshipRequirement,
			outpatientDefaults,
			inpatientDefaults,
			electiveDefaults
		);
	}
}
