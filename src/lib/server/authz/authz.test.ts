import { describe, expect, it } from 'vitest';
import { ROLES, type OrgMembership, type Role } from '../identity/types';
import { PERMISSIONS, ROLE_PERMISSIONS, can, requirePermission, type Permission } from './index';

function member(role: Role): OrgMembership {
	return { organizationId: 'org-1', organizationName: 'Program', role };
}

describe('authz', () => {
	it('declares permissions for every role, using only known permissions', () => {
		expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
		for (const role of ROLES) {
			for (const permission of ROLE_PERMISSIONS[role]) {
				expect(PERMISSIONS).toContain(permission);
			}
		}
	});

	// The full matrix, spelled out so a change to it is a deliberate test edit.
	const matrix: Record<Role, Record<Permission, boolean>> = {
		owner: {
			'billing:manage': true,
			'org:manage_members': true,
			'schedule:edit': true,
			'schedule:view_own': true
		},
		admin: {
			'billing:manage': true,
			'org:manage_members': true,
			'schedule:edit': true,
			'schedule:view_own': true
		},
		preceptor: {
			'billing:manage': false,
			'org:manage_members': false,
			'schedule:edit': false,
			'schedule:view_own': true
		},
		student: {
			'billing:manage': false,
			'org:manage_members': false,
			'schedule:edit': false,
			'schedule:view_own': true
		}
	};

	for (const role of ROLES) {
		for (const permission of PERMISSIONS) {
			it(`${role} ${matrix[role][permission] ? 'may' : 'may not'} ${permission}`, () => {
				expect(can(member(role), permission)).toBe(matrix[role][permission]);
			});
		}
	}

	it('grants nothing without a membership', () => {
		for (const permission of PERMISSIONS) {
			expect(can(null, permission)).toBe(false);
			expect(can(undefined, permission)).toBe(false);
		}
	});

	it('requirePermission throws 403 when the permission is missing', () => {
		const locals = { organization: member('student') } as App.Locals;
		expect(() => requirePermission(locals, 'billing:manage')).toThrow(
			expect.objectContaining({ status: 403 })
		);
		expect(() => requirePermission(locals, 'schedule:view_own')).not.toThrow();
		expect(() =>
			requirePermission({ organization: null } as App.Locals, 'schedule:view_own')
		).toThrow(expect.objectContaining({ status: 403 }));
	});
});
