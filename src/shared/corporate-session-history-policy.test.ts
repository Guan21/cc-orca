import { describe, expect, it } from 'vitest'
import {
  assertCorporateSessionHistoryPaths,
  sessionHistoryListScopeForBuildProfile
} from './corporate-session-history-policy'
import { isCapabilityEnabledForBuildProfile } from './corporate-build-profile'

describe('Corporate local session history policy', () => {
  it('leaves malformed paths to existing operation validators', () => {
    expect(() =>
      assertCorporateSessionHistoryPaths([123, {}, null], 'corporate', 'win32')
    ).not.toThrow()
  })
  it('keeps cloud, remote and telemetry capabilities disabled', () => {
    for (const capability of [
      'ai-vault',
      'cloud-relay',
      'ssh-remote',
      'mobile',
      'telemetry'
    ] as const) {
      expect(isCapabilityEnabledForBuildProfile(capability, 'corporate')).toBe(false)
      expect(isCapabilityEnabledForBuildProfile(capability, 'default')).toBe(true)
    }
  })

  it('keeps default-build routing and restricts Corporate all to local', () => {
    expect(sessionHistoryListScopeForBuildProfile('all', 'corporate')).toBe('local')
    expect(sessionHistoryListScopeForBuildProfile(undefined, 'corporate')).toBe('local')
    expect(sessionHistoryListScopeForBuildProfile('all', 'default')).toBe('all')
    expect(sessionHistoryListScopeForBuildProfile('ssh:host', 'default')).toBe('ssh:host')
  })

  it.each([
    '\\\\external-host\\share\\session.jsonl',
    '//external-host/share/session.jsonl',
    '\\\\?\\UNC\\external-host\\share\\session.jsonl',
    '\\\\.\\UNC\\external-host\\share\\session.jsonl'
  ])('refuses Windows network path %s in Corporate mode only', (path) => {
    expect(() => assertCorporateSessionHistoryPaths([path], 'corporate', 'win32')).toThrow(
      'Network session paths are disabled'
    )
    expect(() => assertCorporateSessionHistoryPaths([path], 'default', 'win32')).not.toThrow()
  })

  it('preserves local Windows, WSL and POSIX paths', () => {
    expect(() =>
      assertCorporateSessionHistoryPaths(
        [
          'C:\\Users\\ada\\.claude\\projects',
          '\\\\?\\C:\\Users\\ada\\.codex',
          '\\\\wsl.localhost\\Ubuntu\\home\\ada\\.claude',
          '\\\\wsl$\\Ubuntu\\home\\ada\\.codex'
        ],
        'corporate',
        'win32'
      )
    ).not.toThrow()
    for (const platform of ['darwin', 'linux'] as const) {
      expect(() =>
        assertCorporateSessionHistoryPaths(['/home/ada', '//home/ada'], 'corporate', platform)
      ).not.toThrow()
    }
  })
})
