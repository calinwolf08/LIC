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
 * Assigns the student in stints ("blocks") with one preceptor per block.
 * Commonly used for inpatient rotations (e.g., 2-week blocks).
 *
 * Algorithm (review findings F-15, F-16, F-21):
 * 1. Work down the day budget in blocks of `blockSizeDays` (the final block may
 *    be shorter when `allowPartialBlocks` is not false).
 * 2. For each block, pick a preceptor and take the earliest window of that
 *    preceptor's *available* days that the student is still free on and that
 *    still has daily capacity — sliding over real availability, never a blind
 *    calendar slice (F-15). Prefer the previous block's preceptor when
 *    `preferContinuousBlocks`.
 * 3. Every placed day is checked against daily capacity, counting both the
 *    engine's pending assignments and days placed earlier in this same call
 *    (F-16).
 * 4. Return the best partial result with a reason rather than discarding
 *    everything when a block cannot be filled (F-21).
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

    if (!student.id) {
      return { success: false, assignments: [], error: 'Student must have a valid ID' };
    }
    if (!clerkship.id) {
      return { success: false, assignments: [], error: 'Clerkship must have a valid ID' };
    }

    const blockSize = config.blockSizeDays!;
    const totalDays = config.requiredDays;
    const allowPartialBlocks = config.allowPartialBlocks !== false;

    // Sort deterministically (load, then id) so runs are reproducible (D-01).
    const candidates = this.sortByLoad(
      clerkship.specialty
        ? this.filterBySpecialty(availablePreceptors, clerkship.specialty)
        : availablePreceptors
    );

    type Candidate = StrategyContext['availablePreceptors'][number];
    type Placement = { preceptor: Candidate; window: string[] };

    // `availableDates` are the student's free days in range (already filtered by
    // the engine); intersect with each preceptor's availability per block.
    const availableDateSet = new Set(availableDates);

    // Dates the student is used on within THIS call, plus per-preceptor per-date
    // occupancy layered on top of the engine's pending counts (F-16).
    const usedByStudent = new Set<string>();
    const localCapacity = new Map<string, Map<string, number>>();
    const dailyCount = (preceptorId: string, date: string): number => {
      const pending = context.assignmentsByPreceptorDate?.get(preceptorId)?.get(date) ?? 0;
      const local = localCapacity.get(preceptorId)?.get(date) ?? 0;
      return pending + local;
    };
    const takeDay = (preceptorId: string, date: string) => {
      usedByStudent.add(date);
      if (!localCapacity.has(preceptorId)) localCapacity.set(preceptorId, new Map());
      const m = localCapacity.get(preceptorId)!;
      m.set(date, (m.get(date) ?? 0) + 1);
    };

    /**
     * The earliest window of up to `size` days a preceptor can take: their
     * availability, in date order, restricted to the student's free days that
     * still have daily capacity and are not already used this call.
     */
    const windowFor = (preceptor: Candidate, size: number): string[] => {
      const window: string[] = [];
      for (const date of [...preceptor.availability].sort()) {
        if (window.length >= size) break;
        if (!availableDateSet.has(date)) continue;
        if (usedByStudent.has(date)) continue;
        if (dailyCount(preceptor.id, date) >= preceptor.maxStudentsPerDay) continue;
        window.push(date);
      }
      return window;
    };

    const assignments = [];
    let previousPreceptor: Candidate | null = null;
    let remaining = totalDays;
    let blockNum = 0;
    let stalledReason: string | null = null;

    while (remaining > 0) {
      const blockLen = Math.min(blockSize, remaining);
      // A short final block is only allowed when partial blocks are permitted.
      if (blockLen < blockSize && !allowPartialBlocks) {
        stalledReason = `Remaining ${remaining} day(s) do not fill a whole block of ${blockSize} and partial blocks are not allowed`;
        break;
      }

      // Prefer the previous preceptor for continuity when configured.
      const prev = previousPreceptor;
      const order: Candidate[] =
        config.preferContinuousBlocks && prev
          ? [prev, ...candidates.filter((c) => c.id !== prev.id)]
          : candidates;

      let placed: Placement | null = null;
      let bestPartial: Placement | null = null;
      for (const preceptor of order) {
        const window = windowFor(preceptor, blockLen);
        if (window.length === blockLen) {
          placed = { preceptor, window };
          break;
        }
        if (window.length > (bestPartial?.window.length ?? 0)) {
          bestPartial = { preceptor, window };
        }
      }

      // No preceptor can fill a full block — take the best partial window (F-21)
      // so the student still gets the days that ARE placeable, then stop.
      const chosen = placed ?? bestPartial;
      if (!chosen || chosen.window.length === 0) {
        stalledReason = `No preceptor available for block ${blockNum + 1} (${remaining} day(s) remaining)`;
        break;
      }

      blockNum++;
      for (const date of chosen.window) {
        takeDay(chosen.preceptor.id, date);
        assignments.push(
          this.createAssignment(student.id, chosen.preceptor.id, clerkship.id, date, {
            requirementType: config.requirementType,
            blockNumber: blockNum,
          })
        );
      }
      remaining -= chosen.window.length;
      previousPreceptor = chosen.preceptor;

      // A partial block means we could not fully fill it — nothing more to place.
      if (!placed) {
        stalledReason = `Only ${chosen.window.length} of ${blockLen} days could be filled for block ${blockNum}`;
        break;
      }
    }

    const assignedDays = assignments.length;
    return {
      success: assignedDays >= totalDays,
      assignments,
      error:
        assignedDays >= totalDays
          ? undefined
          : (stalledReason ??
            `Only ${assignedDays} of ${totalDays} days could be assigned`),
      metadata: {
        strategyUsed: this.getName(),
        preceptorsConsidered: candidates.length,
        assignmentCount: assignedDays,
        blocksCreated: blockNum,
      },
    };
  }
}
