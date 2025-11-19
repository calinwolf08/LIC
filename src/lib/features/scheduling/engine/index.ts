/**
 * Scheduling Engine
 *
 * Main scheduling engine that orchestrates all components.
 */

export { ConfigurableSchedulingEngine, type EngineOptions } from './configurable-scheduling-engine';
export {
  ResultBuilder,
  type SchedulingResult,
  type UnmetRequirement,
  type SchedulingStatistics,
  type ConstraintViolation,
  type PendingApproval,
} from './result-builder';
