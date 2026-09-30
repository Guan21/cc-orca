import { describe, expect, it } from 'vitest'
import { migrateAgentYoloDefaults } from './terminal-settings-migrations'

describe('migrateAgentYoloDefaults', () => {
  it('keeps newly added agent defaults manual for already migrated profiles', () => {
    const migrated = migrateAgentYoloDefaults({
      agentYoloDefaultsMigrated: true,
      agentDefaultArgs: { claude: '--dangerously-skip-permissions' },
      agentDefaultEnv: {}
    } as never)

    expect(migrated.agentDefaultArgs?.droid).toBe('')
    expect(migrated.agentDefaultEnv?.goose).toEqual({})
  })

  it('sanitizes exact legacy Claude and Codex yolo defaults for corporate profiles', () => {
    const migrated = migrateAgentYoloDefaults(
      {
        agentYoloDefaultsMigrated: true,
        agentDefaultArgs: {
          claude: '--dangerously-skip-permissions',
          codex: '--dangerously-bypass-approvals-and-sandbox'
        },
        agentDefaultEnv: {}
      } as never,
      'corporate'
    )

    expect(migrated.agentDefaultArgs?.claude).toBe('')
    expect(migrated.agentDefaultArgs?.codex).toBe('')
  })

  it('does not generate legacy Claude and Codex yolo defaults for corporate profiles', () => {
    const migrated = migrateAgentYoloDefaults({ agentCmdOverrides: {} } as never, 'corporate')

    expect(migrated.agentDefaultArgs?.claude).toBe('')
    expect(migrated.agentDefaultArgs?.codex).toBe('')
    expect(migrated.agentDefaultArgs?.cursor).toBe('--yolo')
  })

  it('keeps home profile legacy Claude and Codex yolo defaults unchanged', () => {
    const migrated = migrateAgentYoloDefaults(
      {
        agentYoloDefaultsMigrated: true,
        agentDefaultArgs: {
          claude: '--dangerously-skip-permissions',
          codex: '--dangerously-bypass-approvals-and-sandbox'
        },
        agentDefaultEnv: {}
      } as never,
      'default'
    )

    expect(migrated.agentDefaultArgs?.claude).toBe('--dangerously-skip-permissions')
    expect(migrated.agentDefaultArgs?.codex).toBe('--dangerously-bypass-approvals-and-sandbox')
  })
})
