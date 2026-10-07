/**
 * What each organization role may do in the app.
 *
 * This is the app's own permission model — deliberately independent of the
 * auth provider's role machinery — so it survives a move off better-auth and
 * so future roles (admins, preceptors, students) plug in by editing one table.
 *
 * Only `billing:manage` guards anything yet; the rest document where the
 * roadmap's limited-access accounts will be checked.
 */

import { error } from '@sveltejs/kit';
import type { OrgMembership, Role } from '../identity/types';

export const PERMISSIONS = [
	/** Change the organization's plan and payment details. */
	'billing:manage',
	/** Invite, remove and re-role members. */
	'org:manage_members',
	/** Build and edit schedules and the data they draw on. */
	'schedule:edit',
	/** See one's own schedule (preceptor / student portals). */
	'schedule:view_own'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
	owner: ['billing:manage', 'org:manage_members', 'schedule:edit', 'schedule:view_own'],
	admin: ['billing:manage', 'org:manage_members', 'schedule:edit', 'schedule:view_own'],
	preceptor: ['schedule:view_own'],
	student: ['schedule:view_own']
};

/** True when `membership` grants `permission`. No membership grants nothing. */
export function can(membership: OrgMembership | null | undefined, permission: Permission): boolean {
	return membership ? ROLE_PERMISSIONS[membership.role].includes(permission) : false;
}

/**
 * Guard for loaders, actions and endpoints: throws 403 unless the request's
 * active membership grants `permission`.
 */
export function requirePermission(locals: App.Locals, permission: Permission): void {
	if (!can(locals.organization, permission)) {
		throw error(403, 'You do not have permission to do that');
	}
}
