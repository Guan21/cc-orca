import { describe, expect, it } from 'vitest'
import {
  CORPORATE_ALLOWED_TUI_AGENTS,
  isCapabilityEnabledForBuildProfile,
  isTuiAgentAllowedForBuildProfile,
  normalizeOrcaBuildProfile
} from './corporate-build-profile'

describe('corporate build profile', () => {
  it('normalizes only the explicit corporate profile opt-in', () => {
    expect(normalizeOrcaBuildProfile('corporate')).toBe('corporate')
    expect(normalizeOrcaBuildProfile('default')).toBe('default')
    expect(normalizeOrcaBuildProfile('')).toBe('default')
    expect(normalizeOrcaBuildProfile('enterprise')).toBe('default')
  })

  it('keeps the P0 agent allowlist to Claude and Codex', () => {
    expect(CORPORATE_ALLOWED_TUI_AGENTS).toEqual(['claude', 'codex'])
    expect(isTuiAgentAllowedForBuildProfile('claude', 'corporate')).toBe(true)
    expect(isTuiAgentAllowedForBuildProfile('codex', 'corporate')).toBe(true)
    expect(isTuiAgentAllowedForBuildProfile('cursor', 'corporate')).toBe(false)
    expect(isTuiAgentAllowedForBuildProfile('opencode', 'corporate')).toBe(false)
  })

  it('disables non-P0 corporate capabilities without affecting the default build', () => {
    expect(isCapabilityEnabledForBuildProfile('mobile', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('computer-use', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('ssh-remote', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('plugins', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('mobile', 'default')).toBe(true)
  })
})
