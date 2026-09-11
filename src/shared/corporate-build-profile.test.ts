import { describe, expect, it } from 'vitest'
import {
  AGENT_NOT_ALLOWED_BY_ORG_POLICY,
  CORPORATE_ALLOWED_TUI_AGENTS,
  assertAgentAllowedForBuildProfile,
  assertAgentLaunchAllowedForBuildProfile,
  isCapabilityEnabledForBuildProfile,
  isCliCommandEnabledForBuildProfile,
  isTuiAgentAllowedForBuildProfile,
  normalizeOrcaBuildProfile,
  resolveAgentLaunchForBuildProfile
} from './corporate-build-profile'

const PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY = 'PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY'

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

  it('throws a stable org-policy error for unsupported corporate agents', () => {
    expect(() => assertAgentAllowedForBuildProfile('cursor', 'corporate')).toThrow(
      AGENT_NOT_ALLOWED_BY_ORG_POLICY
    )
    expect(() => assertAgentAllowedForBuildProfile('claude', 'corporate')).not.toThrow()
    expect(() => assertAgentAllowedForBuildProfile('opencode', 'default')).not.toThrow()
  })

  it('applies corporate agent policy to launch metadata and recognized commands', () => {
    expect(() =>
      assertAgentLaunchAllowedForBuildProfile({ launchAgent: 'cursor' }, 'corporate')
    ).toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(() =>
      assertAgentLaunchAllowedForBuildProfile({ command: 'opencode --session old' }, 'corporate')
    ).toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(() =>
      assertAgentLaunchAllowedForBuildProfile(
        { command: 'claude --resume old --permission-mode default' },
        'corporate'
      )
    ).not.toThrow()
    expect(() =>
      assertAgentLaunchAllowedForBuildProfile({ command: 'opencode --session old' }, 'default')
    ).not.toThrow()
  })

  it.each([
    'bash -lc "opencode --session old"',
    'sh -c "cursor-agent --resume old"',
    'pwsh -Command "opencode --session old"',
    'cmd /c "cursor-agent --resume old"',
    'env FOO=bar opencode --session old'
  ])('rejects shell-wrapped unsupported corporate agent launch: %s', (command) => {
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).toThrow(
      AGENT_NOT_ALLOWED_BY_ORG_POLICY
    )
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'default')).not.toThrow()
  })

  it.each([
    'bash -lc "claude --resume old --permission-mode default"',
    'pwsh -Command "codex --sandbox workspace-write --ask-for-approval on-request"'
  ])('allows shell-wrapped approved corporate agent launch: %s', (command) => {
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).not.toThrow()
  })

  it.each([
    ['Claude', 'claude --dangerously-skip-permissions'],
    ['Claude permission mode', 'claude --permission-mode bypassPermissions'],
    ['Claude inline permission mode', 'claude --permission-mode=bypassPermissions'],
    ['Claude mode cycle bypass', 'claude --allow-dangerously-skip-permissions'],
    ['Codex', 'codex --dangerously-bypass-approvals-and-sandbox'],
    ['Codex sandbox full access', 'codex --sandbox danger-full-access'],
    ['Codex inline sandbox full access', 'codex --sandbox=danger-full-access'],
    ['Codex short sandbox full access', 'codex -s danger-full-access'],
    ['Codex approval never', 'codex --ask-for-approval never'],
    ['Codex inline approval never', 'codex --ask-for-approval=never'],
    ['Codex short approval never', 'codex -a never'],
    ['Codex config sandbox full access', 'codex -c sandbox_mode="danger-full-access"'],
    ['Codex config approval never', 'codex -c approval_policy=never'],
    ['shell-wrapped Claude', 'bash -lc "claude --dangerously-skip-permissions"'],
    [
      'shell-wrapped Claude permission mode',
      'bash -lc "claude --permission-mode bypassPermissions"'
    ],
    ['shell-wrapped Codex', 'pwsh -Command "codex --dangerously-bypass-approvals-and-sandbox"']
  ])('rejects corporate %s permission bypass launch args', (_label, command) => {
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).toThrow(
      PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY
    )
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'default')).not.toThrow()
  })

  it.each([
    'claude --model sonnet --permission-mode default',
    'codex --sandbox workspace-write --ask-for-approval on-request'
  ])(
    'allows corporate native permission-preserving launch args: %s',
    (command) => {
      expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).not.toThrow()
    }
  )

  it.each([
    'claude --permission-mode default',
    'claude --permission-mode plan',
    'codex --sandbox workspace-write --ask-for-approval on-request',
    'codex -c sandbox_mode=workspace-write -c approval_policy=on-request'
  ])('allows corporate safe permission policy args: %s', (command) => {
    expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).not.toThrow()
  })

  it.each([
    ['Claude bare command', 'claude', 'claude --permission-mode default'],
    [
      'Claude command with args',
      'claude --model sonnet',
      'claude --model sonnet --permission-mode default'
    ],
    [
      'Codex bare command',
      'codex',
      'codex --sandbox workspace-write --ask-for-approval on-request'
    ],
    [
      'Codex command with args',
      'codex --model gpt-5',
      'codex --model gpt-5 --sandbox workspace-write --ask-for-approval on-request'
    ]
  ])('adds corporate safe policy to raw %s', (_label, command, expected) => {
    expect(resolveAgentLaunchForBuildProfile({ command }, 'corporate').command).toBe(expected)
    expect(resolveAgentLaunchForBuildProfile({ command }, 'default').command).toBe(command)
  })

  it.each([
    'claude',
    'claude --model sonnet',
    'codex',
    'codex --model gpt-5',
    'bash -lc "claude"',
    'pwsh -Command "codex"'
  ])(
    'rejects final corporate agent commands without explicit safe policy: %s',
    (command) => {
      expect(() => assertAgentLaunchAllowedForBuildProfile({ command }, 'corporate')).toThrow(
        PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY
      )
    }
  )

  it('disables non-P0 corporate capabilities without affecting the default build', () => {
    expect(isCapabilityEnabledForBuildProfile('mobile', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('computer-use', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('ssh-remote', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('plugins', 'corporate')).toBe(false)
    expect(isCapabilityEnabledForBuildProfile('mobile', 'default')).toBe(true)
  })

  it('maps obvious CLI command groups to disabled corporate capabilities', () => {
    expect(isCliCommandEnabledForBuildProfile(['skills', 'list'], 'corporate')).toBe(false)
    expect(isCliCommandEnabledForBuildProfile(['emulator', 'tap'], 'corporate')).toBe(false)
    expect(isCliCommandEnabledForBuildProfile(['computer', 'list-apps'], 'corporate')).toBe(false)
    expect(isCliCommandEnabledForBuildProfile(['serve'], 'corporate')).toBe(false)
    expect(isCliCommandEnabledForBuildProfile(['worktree', 'list'], 'corporate')).toBe(true)
    expect(isCliCommandEnabledForBuildProfile(['skills', 'list'], 'default')).toBe(true)
  })
})
