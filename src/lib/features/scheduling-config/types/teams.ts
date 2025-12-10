/**
 * Team Configuration Types
 *
 * Defines preceptor teams for clerkships.
 */

/**
 * Preceptor Team
 *
 * A configured team of preceptors that can be assigned together to students.
 * Teams are clerkship-specific (not global).
 */
export interface PreceptorTeam {
  id: string;
  clerkshipId: string;
  name?: string;
  requireSameHealthSystem: boolean;
  requireSameSite: boolean;
  requireSameSpecialty: boolean;
  requiresAdminApproval: boolean;
  members: PreceptorTeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Preceptor Team Member
 *
 * Individual member of a preceptor team.
 */
export interface PreceptorTeamMember {
  id: string;
  teamId: string;
  preceptorId: string;
  role?: string;
  priority: number; // Order in rotation
  isFallbackOnly?: boolean; // If true, only used when primary capacity exhausted (default: false)
  createdAt: Date;
}

/**
 * Preceptor Fallback
 *
 * Defines backup preceptors when primary is unavailable.
 */
export interface PreceptorFallback {
  id: string;
  primaryPreceptorId: string;
  fallbackPreceptorId: string;
  clerkshipId?: string; // Optional - can be clerkship-specific or global
  priority: number; // Order in fallback chain
  requiresApproval: boolean;
  allowDifferentHealthSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
