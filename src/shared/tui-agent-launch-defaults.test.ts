import { describe, expect, it } from 'vitest'
import { resolveTuiAgentLaunchArgs } from './tui-agent-launch-defaults'

describe('tui agent launch defaults', () => {
  it.each([
    ['claude', '--dangerously-skip-permissions'],
    ['codex', '--dangerously-bypass-approvals-and-sandbox']
  ] as const)(
    'removes corporate permission bypass defaults for %s while preserving default profile behavior',
    (agent, bypassArg) => {
      expect(resolveTuiAgentLaunchArgs(agent, null, 'default')).toBe(bypassArg)
      expect(resolveTuiAgentLaunchArgs(agent, null, 'corporate')).toBe(
        agent === 'codex'
          ? '--sandbox workspace-write --ask-for-approval on-request'
          : '--permission-mode default'
      )
    }
  )

  it('keeps explicit corporate agent args for spawn-time policy validation', () => {
    expect(
      resolveTuiAgentLaunchArgs(
        'claude',
        { claude: '--dangerously-skip-permissions --model sonnet' },
        'corporate'
      )
    ).toBe('--dangerously-skip-permissions --model sonnet')
  })

  it('adds corporate safe permission overrides to explicit safe args', () => {
    expect(resolveTuiAgentLaunchArgs('claude', { claude: '--model sonnet' }, 'corporate')).toBe(
      '--model sonnet --permission-mode default'
    )
    expect(resolveTuiAgentLaunchArgs('codex', { codex: '--model gpt-5' }, 'corporate')).toBe(
      '--model gpt-5 --sandbox workspace-write --ask-for-approval on-request'
    )
  })
})
