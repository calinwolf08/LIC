/**
 * Type definitions for electives
 *
 * Electives link directly to clerkships (not through requirements).
 * Each elective can inherit settings from its clerkship or override them.
 */

export interface ClerkshipElective {
	id: string;
	clerkshipId: string;
	name: string;
	specialty?: string;
	minimumDays: number;
	isRequired: boolean;
	overrideMode: 'inherit' | 'override';
	createdAt: Date;
	updatedAt: Date;
}

export interface ElectiveSite {
	id: string;
	electiveId: string;
	siteId: string;
	createdAt: string;
}

export interface ElectivePreceptor {
	id: string;
	electiveId: string;
	preceptorId: string;
	createdAt: string;
}
