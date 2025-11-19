/**
 * Service Layer Exports
 *
 * Central export point for all configuration services.
 */

// Core infrastructure
export { Result, isSuccess, isFailure, type ServiceResult } from './service-result';
export { ServiceErrors, ServiceErrorCode, type ServiceError } from './service-errors';

// Services
export { HealthSystemService } from './health-systems.service';
export { CapacityRuleService } from './capacity.service';
export { TeamService, type TeamWithMembers } from './teams.service';
export { FallbackService } from './fallbacks.service';
export { RequirementService } from './requirements.service';
export { ElectiveService } from './electives.service';
export { ConfigurationService } from './configuration.service';
