/**
 * The catalogue of constraints the journeys MUST cover. `generate-coverage.ts`
 * cross-checks `@constraint(...)` annotations against this list and fails
 * `coverage:map --check` (CI) if any required constraint has no covering journey —
 * so if a rule is added here but no test exercises it, the build goes red and names
 * the gap. Add a code here the moment the product gains a new scheduling rule.
 *
 * Each entry is a validation code the whole-schedule validator / assignment
 * validator can emit (see assignment-validation.ts `ViolationCode`).
 */
export const REQUIRED_CONSTRAINTS: readonly string[] = [
	// soft (overridable) codes
	'session_clash',
	'mutual_exclusion',
	'block_week_conflict',
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule',
	'past_date',
	// hard code
	'entity_missing'
];
