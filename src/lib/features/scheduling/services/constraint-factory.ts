/**
 * Constraint Factory Service
 *
 * Bridges database-stored clerkship configuration and runtime constraint instances.
 * Implements the factory pattern to dynamically instantiate constraints
 * based on clerkship settings and global configuration.
 *
 * NOTE: clerkship_requirements table has been removed. Constraints are now
 * built based on the clerkship's type (inpatient/outpatient) and settings.
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

interface Clerkship {
	id: string | null;
	name: string;
	clerkship_type: string;
	required_days: number;
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
	clerkshipId: string;
	clerkshipType: string;
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

		// 2. Load clerkships
		const clerkships = await this.loadClerkships(clerkshipIds);

		// 3. Load global defaults
		const [outpatientDefaults, inpatientDefaults, electiveDefaults] = await Promise.all([
			this.loadGlobalDefaults('outpatient'),
			this.loadGlobalDefaults('inpatient'),
			this.loadGlobalDefaults('elective')
		]);

		// 4. Build clerkship-specific constraints
		for (const clerkship of clerkships) {
			// Skip clerkships without IDs (shouldn't happen in practice)
			if (!clerkship.id) {
				continue;
			}

			// Resolve configuration by merging global defaults with clerkship type
			const config = this.resolveConfiguration(
				clerkship,
				outpatientDefaults,
				inpatientDefaults,
				electiveDefaults
			);

			// Instantiate constraints based on resolved configuration

			// Health system continuity constraint
			if (config.healthSystemRule === 'enforce_same_system') {
				constraints.push(
					new HealthSystemContinuityConstraint(
						clerkship.id, // Use clerkshipId as the identifier
						config.clerkshipId,
						config.allowCrossSystem
					)
				);
			}

			// Student onboarding constraint (if context has onboarding data)
			if (context.studentOnboarding) {
				constraints.push(
					new StudentOnboardingConstraint(clerkship.id, config.clerkshipId)
				);
			}

			// Preceptor association constraint (if context has association data)
			if (context.preceptorClerkshipAssociations || context.preceptorElectiveAssociations) {
				constraints.push(
					new PreceptorClerkshipAssociationConstraint(
						clerkship.id,
						config.clerkshipId,
						config.clerkshipType as 'inpatient' | 'outpatient' | 'elective'
					)
				);
			}
		}

		// Sort by priority (lower priority = checked first)
		return constraints.sort((a, b) => (a.priority || 99) - (b.priority || 99));
	}

	/**
	 * Load clerkships from database
	 */
	private async loadClerkships(clerkshipIds: string[]): Promise<Clerkship[]> {
		if (clerkshipIds.length === 0) {
			return [];
		}

		const results = await this.db
			.selectFrom('clerkships')
			.select(['id', 'name', 'clerkship_type', 'required_days'])
			.where('id', 'in', clerkshipIds)
			.execute();

		return results as Clerkship[];
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
	 * Resolve configuration by merging global defaults with clerkship type
	 */
	private resolveConfiguration(
		clerkship: Clerkship,
		outpatientDefaults: GlobalDefaults | null,
		inpatientDefaults: GlobalDefaults | null,
		electiveDefaults: GlobalDefaults | null
	): ResolvedConfiguration {
		// Select appropriate global defaults based on clerkship type
		let globalDefaults: GlobalDefaults | null = null;
		const clerkshipType = clerkship.clerkship_type || 'outpatient';

		if (clerkshipType === 'outpatient') {
			globalDefaults = outpatientDefaults;
		} else if (clerkshipType === 'inpatient') {
			globalDefaults = inpatientDefaults;
		}

		// Start with global defaults or sensible fallbacks
		const resolved: ResolvedConfiguration = {
			clerkshipId: clerkship.id!,
			clerkshipType: clerkshipType,
			requiredDays: clerkship.required_days,
			allowCrossSystem: false, // Default to not allowing cross-system
			assignmentStrategy: globalDefaults?.assignment_strategy || 'continuous_single',
			healthSystemRule: globalDefaults?.health_system_rule || 'enforce_same_system',
			blockLengthDays: globalDefaults?.block_length_days || undefined,
			allowSplitAssignments: (globalDefaults?.allow_split_assignments ?? 0) === 1,
			preceptorContinuityPreference:
				globalDefaults?.preceptor_continuity_preference || 'prefer_same',
			teamContinuityPreference: globalDefaults?.team_continuity_preference || 'prefer_same'
		};

		return resolved;
	}

	/**
	 * Get resolved configuration for a specific clerkship (for UI display)
	 */
	async getResolvedConfiguration(clerkshipId: string): Promise<ResolvedConfiguration | null> {
		// Load the clerkship
		const clerkship = await this.db
			.selectFrom('clerkships')
			.select(['id', 'name', 'clerkship_type', 'required_days'])
			.where('id', '=', clerkshipId)
			.executeTakeFirst();

		if (!clerkship) {
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
			clerkship as Clerkship,
			outpatientDefaults,
			inpatientDefaults,
			electiveDefaults
		);
	}
}
