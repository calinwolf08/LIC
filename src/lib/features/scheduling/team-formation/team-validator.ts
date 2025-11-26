/**
 * Team Validator
 *
 * Validates preceptor teams against configuration rules.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { CapacityChecker } from '../capacity/capacity-checker';

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Team Validation Result
 */
export interface TeamValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  requiresApproval: boolean;
}

/**
 * Team Member
 */
export interface TeamMember {
  preceptorId: string;
  priority: number;
  role?: string;
  assignedDates?: string[];
}

/**
 * Team Configuration
 */
export interface TeamConfig {
  requireSameHealthSystem: boolean;
  requireSameSite: boolean;
  requireSameSpecialty: boolean;
  requiresAdminApproval: boolean;
  minMembers?: number;
  maxMembers?: number;
}

/**
 * Team Validator
 *
 * Validates teams against formation rules:
 * - Team size constraints
 * - Health system consistency
 * - Site consistency
 * - Specialty consistency
 * - Capacity validation
 * - Availability validation
 */
export class TeamValidator {
  private capacityChecker: CapacityChecker;

  constructor(private db: Kysely<DB>) {
    this.capacityChecker = new CapacityChecker(db);
  }

  /**
   * Validate team against configuration rules
   */
  async validateTeam(
    members: TeamMember[],
    config: TeamConfig,
    options: {
      clerkshipId?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      specialty?: string;
      totalDates?: string[];
    } = {}
  ): Promise<TeamValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate team size
    const sizeErrors = this.validateTeamSize(members, config);
    errors.push(...sizeErrors);

    // Validate members exist
    const existenceErrors = await this.validateMembersExist(members);
    errors.push(...existenceErrors);

    // If members don't exist, skip further validation
    if (existenceErrors.length > 0) {
      return {
        isValid: false,
        errors,
        warnings,
        requiresApproval: config.requiresAdminApproval,
      };
    }

    // Validate health system consistency
    if (config.requireSameHealthSystem) {
      const hsErrors = await this.validateHealthSystemConsistency(members);
      errors.push(...hsErrors);
    }

    // Validate site consistency
    if (config.requireSameSite) {
      const siteErrors = await this.validateSiteConsistency(members);
      errors.push(...siteErrors);
    }

    // Validate specialty consistency
    if (config.requireSameSpecialty || options.specialty) {
      const specialtyErrors = await this.validateSpecialtyConsistency(
        members,
        options.specialty
      );
      errors.push(...specialtyErrors);
    }

    // Validate unique priorities
    const priorityErrors = this.validateUniquePriorities(members);
    errors.push(...priorityErrors);

    // Validate capacity if dates provided
    if (options.totalDates && options.totalDates.length > 0) {
      const capacityErrors = await this.validateCapacity(members, options);
      errors.push(...capacityErrors);
    }

    // Validate availability if dates provided
    if (options.totalDates && options.totalDates.length > 0) {
      const availErrors = await this.validateAvailability(members, options.totalDates);
      errors.push(...availErrors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      requiresApproval: config.requiresAdminApproval,
    };
  }

  /**
   * Validate team size
   */
  private validateTeamSize(members: TeamMember[], config: TeamConfig): ValidationError[] {
    const errors: ValidationError[] = [];
    const minMembers = config.minMembers || 2;
    const maxMembers = config.maxMembers || 3;

    if (members.length < minMembers) {
      errors.push({
        field: 'teamSize',
        message: `Team must have at least ${minMembers} members (has ${members.length})`,
        severity: 'error',
      });
    }

    if (members.length > maxMembers) {
      errors.push({
        field: 'teamSize',
        message: `Team cannot exceed ${maxMembers} members (has ${members.length})`,
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate all members exist as preceptors
   */
  private async validateMembersExist(members: TeamMember[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (const member of members) {
      const preceptor = await this.db
        .selectFrom('preceptors')
        .select('id')
        .where('id', '=', member.preceptorId)
        .executeTakeFirst();

      if (!preceptor) {
        errors.push({
          field: 'members',
          message: `Preceptor ${member.preceptorId} not found`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /**
   * Validate health system consistency
   */
  private async validateHealthSystemConsistency(
    members: TeamMember[]
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const preceptors = await this.db
      .selectFrom('preceptors')
      .select(['id', 'health_system_id'])
      .where(
        'id',
        'in',
        members.map(m => m.preceptorId)
      )
      .execute();

    const healthSystems = new Set(preceptors.map(p => p.health_system_id));
    const hasNull = preceptors.some(p => p.health_system_id === null);

    if (healthSystems.size > 1 || hasNull) {
      errors.push({
        field: 'healthSystem',
        message: 'All team members must belong to the same health system',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate site consistency
   */
  private async validateSiteConsistency(members: TeamMember[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const preceptors = await this.db
      .selectFrom('preceptors')
      .select(['id', 'site_id'])
      .where(
        'id',
        'in',
        members.map(m => m.preceptorId)
      )
      .execute();

    const sites = new Set(preceptors.map(p => p.site_id));

    if (sites.size > 1 || sites.has(null)) {
      errors.push({
        field: 'site',
        message: 'All team members must be at the same site',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate specialty consistency
   * Note: Specialty field was removed from preceptors, so this validation is no longer applicable
   */
  private async validateSpecialtyConsistency(
    _members: TeamMember[],
    _requiredSpecialty?: string
  ): Promise<ValidationError[]> {
    // Specialty field removed from preceptors - validation no longer applicable
    return [];
  }

  /**
   * Validate unique priorities
   */
  private validateUniquePriorities(members: TeamMember[]): ValidationError[] {
    const errors: ValidationError[] = [];

    const priorities = members.map(m => m.priority);
    const uniquePriorities = new Set(priorities);

    if (priorities.length !== uniquePriorities.size) {
      errors.push({
        field: 'priorities',
        message: 'Team member priorities must be unique',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Validate capacity for each member
   */
  private async validateCapacity(
    members: TeamMember[],
    options: {
      clerkshipId?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      totalDates?: string[];
    }
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (const member of members) {
      if (!member.assignedDates || member.assignedDates.length === 0) {
        continue;
      }

      for (const date of member.assignedDates) {
        const check = await this.capacityChecker.checkCapacity(member.preceptorId, date, {
          clerkshipId: options.clerkshipId,
          requirementType: options.requirementType,
        });

        if (!check.hasCapacity) {
          errors.push({
            field: 'capacity',
            message: `Preceptor ${member.preceptorId} lacks capacity on ${date}: ${check.reason}`,
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate team collectively covers all dates
   */
  private async validateAvailability(
    members: TeamMember[],
    requiredDates: string[]
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Get availability for all members
    const availability = await this.db
      .selectFrom('preceptor_availability')
      .select(['preceptor_id', 'date'])
      .where(
        'preceptor_id',
        'in',
        members.map(m => m.preceptorId)
      )
      .where('is_available', '=', 1)
      .execute();

    // Build availability map
    const availMap = new Map<string, Set<string>>();
    for (const avail of availability) {
      if (!availMap.has(avail.preceptor_id)) {
        availMap.set(avail.preceptor_id, new Set());
      }
      availMap.get(avail.preceptor_id)!.add(avail.date);
    }

    // Check each required date is covered by at least one member
    for (const date of requiredDates) {
      const covered = members.some(m => {
        const memberAvail = availMap.get(m.preceptorId);
        return memberAvail && memberAvail.has(date);
      });

      if (!covered) {
        errors.push({
          field: 'availability',
          message: `No team member available on ${date}`,
          severity: 'error',
        });
      }
    }

    return errors;
  }
}
