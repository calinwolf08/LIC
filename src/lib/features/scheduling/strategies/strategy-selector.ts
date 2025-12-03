/**
 * Strategy Selector
 *
 * Selects appropriate scheduling strategy based on configuration.
 */

import type { SchedulingStrategy } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
import { TeamContinuityStrategy } from './team-continuity.strategy';
import { ContinuousSingleStrategy } from './continuous-single.strategy';
import { BlockBasedStrategy } from './block-based.strategy';
import { DailyRotationStrategy } from './daily-rotation.strategy';

/**
 * Strategy Selector
 *
 * Chooses the appropriate scheduling strategy based on clerkship configuration.
 */
export class StrategySelector {
  private strategies: SchedulingStrategy[];

  constructor() {
    // Order matters - specific strategies first, then default (continuous_single) last
    this.strategies = [
      new TeamContinuityStrategy(),
      new BlockBasedStrategy(),
      new DailyRotationStrategy(),
      new ContinuousSingleStrategy(), // Default strategy (handles undefined)
    ];
  }

  /**
   * Select strategy based on configuration
   */
  selectStrategy(config: ResolvedRequirementConfiguration): SchedulingStrategy | null {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(config)) {
        return strategy;
      }
    }

    // Default to continuous_single if no strategy matches
    return new ContinuousSingleStrategy();
  }

  /**
   * Get all available strategies
   */
  getAvailableStrategies(): SchedulingStrategy[] {
    return this.strategies;
  }

  /**
   * Get strategy by name
   */
  getStrategyByName(name: string): SchedulingStrategy | null {
    return this.strategies.find(s => s.getName() === name) || null;
  }
}
