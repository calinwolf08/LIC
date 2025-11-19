/**
 * Scheduling Strategies
 *
 * Strategy pattern implementation for different assignment approaches.
 */

// Base strategy
export { BaseStrategy, type SchedulingStrategy, type StrategyContext, type StrategyResult, type ProposedAssignment } from './base-strategy';

// Context builder
export { StrategyContextBuilder } from './strategy-context';

// Strategy implementations
export { ContinuousSingleStrategy } from './continuous-single.strategy';
export { BlockBasedStrategy } from './block-based.strategy';
export { DailyRotationStrategy } from './daily-rotation.strategy';

// Strategy selector
export { StrategySelector } from './strategy-selector';
