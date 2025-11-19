/**
 * Block-Based Strategy
 *
 * Schedules in fixed-size blocks (e.g., 14-day blocks) with one preceptor per block.
 */

import { BaseStrategy, type StrategyContext, type StrategyResult } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

/**
 * Block-Based Strategy
 *
 * Divides required days into fixed-size blocks and assigns one preceptor per block.
 * Commonly used for inpatient rotations (e.g., 2-week blocks).
 *
 * Algorithm:
 * 1. Divide required days into blocks of configured size
 * 2. For each block:
 *    a. Find preceptor available for entire block
 *    b. Prefer same preceptor as previous block (if prefer_continuous_blocks)
 *    c. Check block capacity constraints
 * 3. Handle partial blocks at end (if allowed)
 * 4. Generate assignments per block
 */
export class BlockBasedStrategy extends BaseStrategy {
  getName(): string {
    return 'BlockBasedStrategy';
  }

  canHandle(config: ResolvedRequirementConfiguration): boolean {
    return config.assignmentStrategy === 'block_based' && config.blockSizeDays !== undefined;
  }

  async generateAssignments(context: StrategyContext): Promise<StrategyResult> {
    const { student, clerkship, config, availableDates, availablePreceptors } = context;

    // Validate required IDs
    if (!student.id) {
      return { success: false, assignments: [], error: 'Student must have a valid ID' };
    }
    if (!clerkship.id) {
      return { success: false, assignments: [], error: 'Clerkship must have a valid ID' };
    }

    const blockSize = config.blockSizeDays!;
    const totalDays = clerkship.required_days;

    // Check if we have enough dates
    if (availableDates.length < totalDays) {
      return {
        success: false,
        assignments: [],
        error: `Insufficient available dates: ${availableDates.length} < ${totalDays}`,
      };
    }

    // Calculate blocks
    const fullBlocks = Math.floor(totalDays / blockSize);
    const remainderDays = totalDays % blockSize;
    const hasPartialBlock = remainderDays > 0;

    // Check if partial blocks allowed
    if (hasPartialBlock && config.allowPartialBlocks === false) {
      return {
        success: false,
        assignments: [],
        error: `Total days (${totalDays}) not divisible by block size (${blockSize}) and partial blocks not allowed`,
      };
    }

    const totalBlocks = fullBlocks + (hasPartialBlock ? 1 : 0);

    // Filter preceptors by specialty
    let candidates = clerkship.specialty
      ? this.filterBySpecialty(availablePreceptors, clerkship.specialty)
      : availablePreceptors;

    // Sort by load
    candidates = this.sortByLoad(candidates);

    const assignments = [];
    let previousPreceptor: typeof candidates[0] | null = null;

    // Assign each block
    for (let blockNum = 0; blockNum < totalBlocks; blockNum++) {
      const startIdx = blockNum * blockSize;
      const endIdx =
        blockNum === fullBlocks && hasPartialBlock
          ? startIdx + remainderDays
          : startIdx + blockSize;

      const blockDates = availableDates.slice(startIdx, endIdx);

      // Try to use previous preceptor if prefer_continuous_blocks
      let selectedPreceptor: typeof candidates[0] | null = null;

      if (config.preferContinuousBlocks && previousPreceptor) {
        const canUsePrevious = blockDates.every(date =>
          this.isDateAvailable(previousPreceptor!, date)
        );

        if (canUsePrevious) {
          selectedPreceptor = previousPreceptor;
        }
      }

      // If no previous preceptor or couldn't use them, find new one
      if (!selectedPreceptor) {
        selectedPreceptor = this.findPreceptorAvailableForAllDates(candidates, blockDates);
      }

      if (!selectedPreceptor) {
        return {
          success: false,
          assignments: [],
          error: `No preceptor available for block ${blockNum + 1} (dates ${blockDates[0]} to ${blockDates[blockDates.length - 1]})`,
          metadata: {
            strategyUsed: this.getName(),
            preceptorsConsidered: candidates.length,
            assignmentCount: 0,
            blocksCreated: blockNum,
          },
        };
      }

      // Generate assignments for this block
      for (const date of blockDates) {
        assignments.push(
          this.createAssignment(student.id, selectedPreceptor.id, clerkship.id, date, {
            requirementType: config.requirementType,
            blockNumber: blockNum + 1,
          })
        );
      }

      previousPreceptor = selectedPreceptor;
    }

    return {
      success: true,
      assignments,
      metadata: {
        strategyUsed: this.getName(),
        preceptorsConsidered: candidates.length,
        assignmentCount: assignments.length,
        blocksCreated: totalBlocks,
      },
    };
  }
}
