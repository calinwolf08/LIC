import { describe, it, expect } from 'vitest';
import {
  isOverrideModeInherit,
  isOverrideModeFields,
  isOverrideModeSection,
  hasBlockSettings,
  allowsTeams,
  allowsFallbacks,
  AssignmentStrategyLabels,
  HealthSystemRuleLabels,
  OverrideModeLabels,
} from './utilities';
import type { ResolvedRequirementConfiguration } from './resolved-config';

describe('Type Utilities', () => {
  describe('Override Mode Type Guards', () => {
    it('isOverrideModeInherit should identify inherit mode', () => {
      expect(isOverrideModeInherit('inherit')).toBe(true);
      expect(isOverrideModeInherit('override_fields')).toBe(false);
      expect(isOverrideModeInherit('override_section')).toBe(false);
    });

    it('isOverrideModeFields should identify override_fields mode', () => {
      expect(isOverrideModeFields('override_fields')).toBe(true);
      expect(isOverrideModeInherit('override_fields')).toBe(false);
      expect(isOverrideModeSection('override_fields')).toBe(false);
    });

    it('isOverrideModeSection should identify override_section mode', () => {
      expect(isOverrideModeSection('override_section')).toBe(true);
      expect(isOverrideModeInherit('override_section')).toBe(false);
      expect(isOverrideModeFields('override_section')).toBe(false);
    });
  });

  describe('Configuration Type Guards', () => {
    it('hasBlockSettings should detect block-based strategy', () => {
      const blockConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'inpatient',
        requiredDays: 20,
        assignmentStrategy: 'block_based',
        healthSystemRule: 'prefer_same_system',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(hasBlockSettings(blockConfig)).toBe(true);
    });

    it('hasBlockSettings should return false for non-block strategies', () => {
      const continuousConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(hasBlockSettings(continuousConfig)).toBe(false);
    });

    it('allowsTeams should detect team permission', () => {
      const teamConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_team',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        allowTeams: true,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(allowsTeams(teamConfig)).toBe(true);
    });

    it('allowsTeams should return false when teams not allowed', () => {
      const singleConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(allowsTeams(singleConfig)).toBe(false);
    });

    it('allowsFallbacks should detect fallback permission', () => {
      const fallbackConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(allowsFallbacks(fallbackConfig)).toBe(true);
    });

    it('allowsFallbacks should return false when fallbacks not allowed', () => {
      const noFallbackConfig: ResolvedRequirementConfiguration = {
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: false,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        source: 'global_defaults',
      };

      expect(allowsFallbacks(noFallbackConfig)).toBe(false);
    });
  });

  describe('Display Labels', () => {
    it('AssignmentStrategyLabels should have labels for all strategies', () => {
      expect(AssignmentStrategyLabels.continuous_single).toBe('Continuous Single Preceptor');
      expect(AssignmentStrategyLabels.continuous_team).toBe('Continuous Team');
      expect(AssignmentStrategyLabels.block_based).toBe('Block-Based Scheduling');
      expect(AssignmentStrategyLabels.daily_rotation).toBe('Daily Rotation');
    });

    it('HealthSystemRuleLabels should have labels for all rules', () => {
      expect(HealthSystemRuleLabels.enforce_same_system).toBe('Enforce Same System');
      expect(HealthSystemRuleLabels.prefer_same_system).toBe('Prefer Same System');
      expect(HealthSystemRuleLabels.no_preference).toBe('No Preference');
    });

    it('OverrideModeLabels should have labels for all modes', () => {
      expect(OverrideModeLabels.inherit).toBe('Use Global Defaults');
      expect(OverrideModeLabels.override_fields).toBe('Override Specific Fields');
      expect(OverrideModeLabels.override_section).toBe('Fully Customize');
    });
  });
});
