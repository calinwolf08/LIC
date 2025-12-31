/**
 * Type definitions for electives
 */

export interface ClerkshipElective {
	id: string;
	requirementId: string;
	name: string;
	specialty: string | null;
	minimumDays: number;
	isRequired: boolean;
	createdAt: string;
	updatedAt: string;
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
