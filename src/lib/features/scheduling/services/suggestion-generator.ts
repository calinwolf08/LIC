import type { ViolationStat } from '$lib/features/schedules/types/schedule-views';

export interface Suggestion {
	id: string;
	title: string;
	description: string;
	action: string;
	impact: 'high' | 'medium' | 'low';
	constraintType: string;
	violationCount: number;
	actionLink?: {
		href: string;
		label: string;
	};
}

/**
 * Generate actionable suggestions from violation statistics
 */
export function generateSuggestions(violations: ViolationStat[]): Suggestion[] {
	const suggestions: Suggestion[] = [];

	for (const violation of violations) {
		const suggestion = analyzeSingleViolation(violation);
		if (suggestion) {
			suggestions.push(suggestion);
		}
	}

	// Sort by impact then violation count
	return suggestions.sort((a, b) => {
		const impactOrder = { high: 0, medium: 1, low: 2 };
		if (impactOrder[a.impact] !== impactOrder[b.impact]) {
			return impactOrder[a.impact] - impactOrder[b.impact];
		}
		return b.violationCount - a.violationCount;
	});
}

/**
 * Analyze a single constraint violation and generate suggestion
 */
function analyzeSingleViolation(violation: ViolationStat): Suggestion | null {
	const { constraintName, count } = violation;

	// Determine impact level
	const impact = count > 30 ? 'high' : count > 15 ? 'medium' : 'low';

	switch (constraintName) {
		case 'preceptor-capacity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Increase Preceptor Capacity',
				description: `Preceptors reached max capacity ${count} times. Consider increasing capacity limits for busy preceptors.`,
				action: 'Review preceptor capacity settings and increase where possible',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors',
					label: 'View Preceptors'
				}
			};

		case 'site-availability':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Site Availability',
				description: `Sites were unavailable ${count} times. Add more days or sites to increase availability.`,
				action: 'Add availability days to sites or activate more sites',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/sites',
					label: 'View Sites'
				}
			};

		case 'preceptor-availability':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Preceptor Availability',
				description: `Preceptors were unavailable ${count} times. Update preceptor schedules to add more available days.`,
				action: 'Review and update preceptor availability patterns',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors',
					label: 'View Preceptors'
				}
			};

		case 'specialty-match':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Specialized Preceptors',
				description: `Specialty requirements couldn't be met ${count} times. Need more preceptors in specific specialties.`,
				action: 'Add preceptors with needed specialty certifications',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors?action=add',
					label: 'Add Preceptor'
				}
			};

		case 'no-double-booking':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Schedule Conflicts Detected',
				description: `Students had conflicting assignments ${count} times. This is usually a data issue.`,
				action: 'Review existing assignments for conflicts',
				impact,
				constraintType: constraintName,
				violationCount: count
			};

		case 'blackout-date':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Reduce Blackout Dates',
				description: `Blackout dates prevented ${count} assignments. Consider reducing unnecessary blackouts.`,
				action: 'Review blackout date list and remove unnecessary dates',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/calendar',
					label: 'Manage Blackout Dates'
				}
			};

		case 'site-capacity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Increase Site Capacity',
				description: `Sites reached max capacity ${count} times. Increase site limits or add more sites.`,
				action: 'Update site capacity settings or add new clinical sites',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/sites',
					label: 'View Sites'
				}
			};

		case 'health-system-continuity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Health System Continuity Issues',
				description: `Could not maintain health system continuity ${count} times. Consider relaxing continuity requirements or adding capacity.`,
				action: 'Review continuity settings or increase preceptor capacity',
				impact: 'low', // Usually lower priority
				constraintType: constraintName,
				violationCount: count
			};

		case 'valid-site-for-clerkship':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Associate Sites with Clerkships',
				description: `Sites were invalid for clerkships ${count} times. Configure which sites support which clerkship types.`,
				action: 'Update clerkship-site associations in configuration',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/clerkships',
					label: 'Configure Clerkships'
				}
			};

		default:
			// Generic suggestion for unknown constraints
			return {
				id: `suggestion-${constraintName}`,
				title: `Address ${formatConstraintName(constraintName)}`,
				description: `This constraint blocked ${count} assignments.`,
				action: 'Review constraint configuration',
				impact,
				constraintType: constraintName,
				violationCount: count
			};
	}
}

/**
 * Format constraint name for display
 */
function formatConstraintName(name: string): string {
	return name
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
