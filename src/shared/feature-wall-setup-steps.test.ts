import { afterEach, describe, expect, it } from 'vitest'
import {
  getFeatureWallSetupSteps,
  getFeatureWallSetupStepsForSection,
  isFeatureWallSetupStepEnabledForBuildProfile
} from './feature-wall-setup-steps'

describe('feature wall setup steps by build profile', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('keeps browser and agent capability setup available in default Orca', () => {
    const setupStepIds = getFeatureWallSetupSteps().map((step) => step.id)

    expect(setupStepIds).toContain('browser')
    expect(setupStepIds).toContain('agent-capabilities')
    expect(isFeatureWallSetupStepEnabledForBuildProfile('browser', 'default')).toBe(true)
    expect(isFeatureWallSetupStepEnabledForBuildProfile('agent-capabilities', 'default')).toBe(true)
  })

  it('filters unsupported setup flows in corporate builds', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    const setupStepIds = getFeatureWallSetupSteps().map((step) => step.id)
    const parallelStepIds = getFeatureWallSetupStepsForSection('parallel-work').map(
      (step) => step.id
    )

    expect(setupStepIds).not.toContain('browser')
    expect(setupStepIds).not.toContain('agent-capabilities')
    expect(parallelStepIds).not.toContain('browser')
    expect(isFeatureWallSetupStepEnabledForBuildProfile('browser', 'corporate')).toBe(false)
    expect(isFeatureWallSetupStepEnabledForBuildProfile('agent-capabilities', 'corporate')).toBe(
      false
    )
  })
})
