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
      expect(resolveTuiAgentLaunchArgs(agent, null, 'corporate')).toBe('')
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
})
