/**
 * Elective Service
 *
 * Manages clerkship elective options with validation.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { ClerkshipElective } from '$lib/features/scheduling-config/types';
import {
  clerkshipElectiveInputSchema,
  type ClerkshipElectiveInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';

/**
 * Elective Service
 *
 * Provides CRUD operations for clerkship electives with validation.
 */
export class ElectiveService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new elective
   */
  async createElective(
    requirementId: string,
    input: ClerkshipElectiveInput
  ): ServiceResult<ClerkshipElective> {
    // Validate input
    const validation = clerkshipElectiveInputSchema.safeParse(input);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid elective data', validation.error.errors)
      );
    }

    try {
      // Check requirement exists and is elective type
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .select(['id', 'requirement_type', 'required_days'])
        .where('id', '=', requirementId)
        .executeTakeFirst();

      if (!requirement) {
        return Result.failure(ServiceErrors.notFound('Requirement', requirementId));
      }

      if (requirement.requirement_type !== 'elective') {
        return Result.failure(
          ServiceErrors.conflict('Electives can only be added to elective requirements')
        );
      }

      // Validate minimum days
      if (input.minimumDays > requirement.required_days) {
        return Result.failure(
          ServiceErrors.conflict(
            `Minimum days (${input.minimumDays}) cannot exceed requirement total (${requirement.required_days})`
          )
        );
      }

      // Verify all preceptors exist
      if (input.availablePreceptorIds.length === 0) {
        return Result.failure(
          ServiceErrors.validationError('At least one preceptor must be available')
        );
      }

      for (const preceptorId of input.availablePreceptorIds) {
        const preceptor = await this.db
          .selectFrom('preceptors')
          .select(['id', 'specialty'])
          .where('id', '=', preceptorId)
          .executeTakeFirst();

        if (!preceptor) {
          return Result.failure(ServiceErrors.notFound('Preceptor', preceptorId));
        }

        // If specialty specified, validate match
        if (input.specialty && preceptor.specialty !== input.specialty) {
          return Result.failure(
            ServiceErrors.conflict(
              `Preceptor ${preceptorId} specialty (${preceptor.specialty}) does not match elective specialty (${input.specialty})`
            )
          );
        }
      }

      const elective = await this.db
        .insertInto('clerkship_electives')
        .values({
          id: nanoid(),
          requirement_id: requirementId,
          name: input.name,
          minimum_days: input.minimumDays,
          specialty: input.specialty || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapElective(elective));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to create elective', error));
    }
  }

  /**
   * Get elective by ID
   */
  async getElective(id: string): ServiceResult<ClerkshipElective | null> {
    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!elective) {
        return Result.success(null);
      }

      return Result.success(this.mapElective(elective));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch elective', error));
    }
  }

  /**
   * Get all electives for a requirement
   */
  async getElectivesByRequirement(requirementId: string): ServiceResult<ClerkshipElective[]> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('requirement_id', '=', requirementId)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch electives', error));
    }
  }

  /**
   * Update elective
   */
  async updateElective(
    id: string,
    input: Partial<ClerkshipElectiveInput>
  ): ServiceResult<ClerkshipElective> {
    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return Result.failure(ServiceErrors.notFound('Elective', id));
      }

      // Get requirement for validation
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .select(['id', 'required_days'])
        .where('id', '=', existing.requirement_id)
        .executeTakeFirst();

      if (!requirement) {
        return Result.failure(ServiceErrors.notFound('Requirement', existing.requirement_id));
      }

      // Build update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.minimumDays !== undefined) {
        if (input.minimumDays > requirement.required_days) {
          return Result.failure(
            ServiceErrors.conflict(
              `Minimum days (${input.minimumDays}) cannot exceed requirement total (${requirement.required_days})`
            )
          );
        }
        updateData.minimum_days = input.minimumDays;
      }
      if (input.specialty !== undefined) updateData.specialty = input.specialty || null;
      if (input.availablePreceptorIds !== undefined) {
        if (input.availablePreceptorIds.length === 0) {
          return Result.failure(
            ServiceErrors.validationError('At least one preceptor must be available')
          );
        }
        updateData.available_preceptor_ids = JSON.stringify(input.availablePreceptorIds);
      }

      const updated = await this.db
        .updateTable('clerkship_electives')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapElective(updated));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to update elective', error));
    }
  }

  /**
   * Delete elective
   */
  async deleteElective(id: string): ServiceResult<boolean> {
    try {
      // TODO: Check for current student assignments
      // For now, just delete

      const result = await this.db.deleteFrom('clerkship_electives').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        return Result.failure(ServiceErrors.notFound('Elective', id));
      }

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to delete elective', error));
    }
  }

  /**
   * Get available preceptors for an elective
   */
  async getAvailablePreceptors(electiveId: string): ServiceResult<any[]> {
    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .select('specialty')
        .where('id', '=', electiveId)
        .executeTakeFirst();

      if (!elective) {
        return Result.failure(ServiceErrors.notFound('Elective', electiveId));
      }

      // Return preceptors matching the elective's specialty
      const preceptors = await this.db
        .selectFrom('preceptors')
        .selectAll()
        .where('specialty', '=', elective.specialty || '')
        .execute();

      return Result.success(preceptors);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch available preceptors', error));
    }
  }

  /**
   * Map database row to ClerkshipElective type
   */
  private mapElective(row: any): ClerkshipElective {
    return {
      id: row.id,
      requirementId: row.requirement_id,
      name: row.name,
      minimumDays: row.minimum_days,
      specialty: row.specialty || undefined,
      availablePreceptorIds: JSON.parse(row.available_preceptor_ids as string),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
