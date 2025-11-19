/**
 * Capacity Rule Types
 *
 * Defines preceptor capacity constraints with hierarchical rules.
 */

import type { RequirementType } from './enums';

/**
 * Preceptor Capacity Rule
 *
 * Defines how many students a preceptor can supervise.
 * Supports 5-level hierarchy:
 * 1. Preceptor + Clerkship + Requirement Type (most specific)
 * 2. Preceptor + Clerkship
 * 3. Preceptor + Requirement Type
 * 4. Preceptor-wide
 * 5. Global defaults (least specific)
 */
export interface PreceptorCapacityRule {
  id: string;
  preceptorId: string;
  clerkshipId?: string; // Optional for hierarchy
  requirementType?: RequirementType; // Optional for hierarchy
  maxStudentsPerDay: number;
  maxStudentsPerYear: number;
  maxStudentsPerBlock?: number; // Only for block-based strategies
  maxBlocksPerYear?: number; // Only for block-based strategies
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Capacity Rule Priority
 *
 * Defines the priority order for applying capacity rules (higher = more specific).
 */
export enum CapacityRulePriority {
  GLOBAL_DEFAULT = 0,
  PRECEPTOR_WIDE = 1,
  PRECEPTOR_REQUIREMENT_TYPE = 2,
  PRECEPTOR_CLERKSHIP = 3,
  PRECEPTOR_CLERKSHIP_REQUIREMENT_TYPE = 4,
}
