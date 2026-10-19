/**
 * TEMPORARY: tier testing on deployed environments.
 *
 * When ENABLE_TIER_TESTING=true, sign-up offers a Standard/Pro choice and the
 * app sidebar offers a switch between them, so testers can exercise both tiers
 * without payments. Remove the variable (or set it to anything else) to hide
 * both; the code can be deleted once real plan selection ships.
 *
 * Read at request time from the process environment, so toggling it needs a
 * restart, not a rebuild.
 */
export function isTierTestingEnabled(
	env: Record<string, string | undefined> = process.env
): boolean {
	return env.ENABLE_TIER_TESTING?.trim().toLowerCase() === 'true';
}
