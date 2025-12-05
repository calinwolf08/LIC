/**
 * Fallback Resolution Components
 */

// New gap-filling fallback system
export { FallbackGapFiller, type GapFillerResult, type FallbackAssignment, type UnmetRequirement } from './gap-filler';
export { FallbackPreceptorResolver, type FallbackPreceptor } from './preceptor-resolver';

// Legacy fallback resolver (deprecated - use FallbackGapFiller instead)
export { FallbackResolver, type FallbackResult } from './fallback-resolver';
