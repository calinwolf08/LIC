/**
 * Registers the app's organization roles with better-auth's organization
 * plugin, which refuses a membership whose role it does not know.
 *
 * The permissions declared here only govern better-auth's own organization
 * endpoints (inviting, removing members, …). What a role may do in the app is
 * decided by `$lib/server/authz`, so this file can be dropped along with
 * better-auth without changing app behaviour.
 */

import { createAccessControl } from 'better-auth/plugins/access';
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc
} from 'better-auth/plugins/organization/access';
import type { Role } from '../types';

export const organizationAccessControl = createAccessControl(defaultStatements);

/**
 * Owners and admins manage the organization. Preceptors and students get the
 * plugin's plain-member statements: no organization management at all.
 */
export const organizationRoles = {
	owner: organizationAccessControl.newRole(ownerAc.statements),
	admin: organizationAccessControl.newRole(adminAc.statements),
	preceptor: organizationAccessControl.newRole(memberAc.statements),
	student: organizationAccessControl.newRole(memberAc.statements)
} satisfies Record<Role, unknown>;
