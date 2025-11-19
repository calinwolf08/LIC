/**
 * Strategy Selector
 *
 * Selects appropriate scheduling strategy based on configuration.
 */

import type { SchedulingStrategy } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
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
    this.strategies = [
      new ContinuousSingleStrategy(),
      new BlockBasedStrategy(),
      new DailyRotationStrategy(),
      // Add more strategies as implemented:
      // new ContinuousTeamStrategy(),
      // new HybridStrategy(),
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

    // Default to continuous single if no strategy matches
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
