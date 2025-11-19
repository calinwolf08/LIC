/**
 * Health System and Site Types
 *
 * Defines health systems and clinical sites.
 */

/**
 * Health System
 *
 * A hospital network or health system (e.g., "Memorial Health System").
 */
export interface HealthSystem {
  id: string;
  name: string;
  location?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Site
 *
 * A specific clinical site within a health system (e.g., "Memorial Downtown Clinic").
 */
export interface Site {
  id: string;
  healthSystemId: string;
  name: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}
