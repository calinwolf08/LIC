import { error } from '@sveltejs/kit';
import { ENTITLEMENT_AUTOGEN } from '../billing/plans';

/** Known entitlement identifiers — defined with the plan catalog. */
export { ENTITLEMENT_AUTOGEN };

/**
 * Parse the raw `user.entitlements` JSON string into a string array.
 * Malformed or missing input is treated as no entitlements.
 *
 * `user.entitlements` is retired as a source of access (entitlements now come
 * from the organization's plan); this survives only so the subscription
 * backfill can carry an existing `autogen` grant over to a Pro plan.
 */
export function parseEntitlements(raw: unknown): string[] {
	if (typeof raw !== 'string' || raw.length === 0) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** True when the current user has the Stage 2 auto-generation entitlement. */
export function hasAutogen(locals: App.Locals): boolean {
	return locals.entitlements?.includes(ENTITLEMENT_AUTOGEN) ?? false;
}

/**
 * Guard for Stage 2 (auto-generation) endpoints and loaders.
 * Throws a 403 when the current user lacks the entitlement.
 */
export function requireAutogen(locals: App.Locals): void {
	if (!hasAutogen(locals)) {
		throw error(403, 'Auto-generation requires an upgraded plan');
	}
}
