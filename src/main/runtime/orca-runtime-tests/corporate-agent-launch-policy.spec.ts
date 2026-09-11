import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_NOT_ALLOWED_BY_ORG_POLICY } from '../../../shared/corporate-build-profile'
import { OrcaRuntimeService } from '../orca-runtime-test-mocks.spec'
import { TEST_WORKTREE_ID, TEST_WORKTREE_PATH, store } from '../orca-runtime-test-fixtures.spec'

const ORIGINAL_ORCA_BUILD_PROFILE = process.env.ORCA_BUILD_PROFILE
const PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY = 'PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY'

function enableCorporateBuildProfile(): void {
  delete (globalThis as { __ORCA_BUILD_PROFILE__?: string }).__ORCA_BUILD_PROFILE__
  process.env.ORCA_BUILD_PROFILE = 'corporate'
}

function createRuntime(
  spawn = vi.fn().mockResolvedValue({ id: 'pty-bg' }),
  settings: Record<string, unknown> = {}
): {
  runtime: OrcaRuntimeService
  spawn: typeof spawn
} {
  const runtime = new OrcaRuntimeService({
    ...store,
    getSettings: () => ({
      ...store.getSettings(),
      disabledTuiAgents: [],
      agentCmdOverrides: {},
      agentDefaultArgs: { claude: '', codex: '' },
      agentDefaultEnv: {},
      ...settings
    })
  })
  const runtimeInternals = runtime as unknown as {
    resolveTerminalWorkspaceLaunchScope: () => Promise<{
      id: string
      path: string
      connectionId: null
      repo: ReturnType<typeof store.getRepo>
      folderWorkspace: null
    }>
  }
  runtimeInternals.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
    id: TEST_WORKTREE_ID,
    path: TEST_WORKTREE_PATH,
    connectionId: null,
    repo: store.getRepo('repo-1'),
    folderWorkspace: null
  }))
  runtime.setPtyController({
    spawn,
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  return { runtime, spawn }
}

afterEach(() => {
  delete (globalThis as { __ORCA_BUILD_PROFILE__?: string }).__ORCA_BUILD_PROFILE__
  if (ORIGINAL_ORCA_BUILD_PROFILE === undefined) {
    delete process.env.ORCA_BUILD_PROFILE
  } else {
    process.env.ORCA_BUILD_PROFILE = ORIGINAL_ORCA_BUILD_PROFILE
  }
})

describe('corporate agent launch policy', () => {
  it('rejects unsupported startupAgent launches before spawn', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime()

    await expect(
      runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent: 'cursor' })
    ).rejects.toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects unsupported raw agent commands before spawn', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime()

    await expect(
      runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, {
        command: 'opencode --session old'
      })
    ).rejects.toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects unsupported shell-wrapped agent commands before spawn', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime()

    await expect(
      runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, {
        command: 'bash -lc "opencode --session old"'
      })
    ).rejects.toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('allows corporate startupAgent launches for Claude and Codex', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime()

    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent: 'claude' })
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent: 'codex' })

    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenNthCalledWith(1, expect.objectContaining({ launchAgent: 'claude' }))
    expect(spawn).toHaveBeenNthCalledWith(2, expect.objectContaining({ launchAgent: 'codex' }))
  })

  it('does not inject permission bypass defaults into corporate Claude and Codex launches', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime(vi.fn().mockResolvedValue({ id: 'pty-bg' }), {
      agentDefaultArgs: {}
    })

    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent: 'claude' })
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent: 'codex' })

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        command: expect.stringContaining('--permission-mode'),
        launchAgent: 'claude'
      })
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: expect.stringContaining('--ask-for-approval'),
        launchAgent: 'codex'
      })
    )
  })

  it.each([
    ['Claude default args', 'claude', { claude: '--dangerously-skip-permissions' }],
    ['Codex default args', 'codex', { codex: '--dangerously-bypass-approvals-and-sandbox' }],
    ['Claude permission mode args', 'claude', { claude: '--permission-mode bypassPermissions' }],
    ['Codex sandbox args', 'codex', { codex: '--sandbox danger-full-access' }],
    ['Codex approval args', 'codex', { codex: '--ask-for-approval never' }],
    ['Claude command override', 'claude', {}, { claude: 'claude --dangerously-skip-permissions' }],
    [
      'Codex command override',
      'codex',
      {},
      { codex: 'codex --dangerously-bypass-approvals-and-sandbox' }
    ],
    [
      'Claude permission mode command override',
      'claude',
      {},
      { claude: 'claude --permission-mode bypassPermissions' }
    ],
    [
      'Codex full access command override',
      'codex',
      {},
      { codex: 'codex --sandbox danger-full-access --ask-for-approval never' }
    ]
  ] as const)(
    'rejects corporate %s permission bypass before spawn',
    async (
      _label,
      startupAgent,
      agentDefaultArgs: Record<string, string>,
      agentCmdOverrides: Record<string, string> = {}
    ) => {
      enableCorporateBuildProfile()
      const { runtime, spawn } = createRuntime(vi.fn().mockResolvedValue({ id: 'pty-bg' }), {
        agentDefaultArgs,
        agentCmdOverrides
      })

      await expect(
        runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { startupAgent })
      ).rejects.toThrow(PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY)
      expect(spawn).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['Claude', 'claude', ['--dangerously-skip-permissions']],
    ['Claude permission mode', 'claude', ['--permission-mode', 'bypassPermissions']],
    ['Codex', 'codex', ['--dangerously-bypass-approvals-and-sandbox']],
    ['Codex sandbox full access', 'codex', ['--sandbox', 'danger-full-access']],
    ['Codex approval never', 'codex', ['--ask-for-approval', 'never']]
  ] as const)(
    'rejects corporate %s restored session permission bypass args before spawn',
    async (_label, agent, launchArgs) => {
      enableCorporateBuildProfile()
      const { runtime, spawn } = createRuntime()

      await expect(
        runtime.ensureAgentSession(
          {
            kind: 'explicit',
            worktree: `id:${TEST_WORKTREE_ID}`,
            agent,
            providerSession: { key: 'session_id', id: 'old-session' }
          },
          {},
          {
            spawnToken: 'spawn-token',
            providerRoot: `/tmp/${agent}-root`,
            sessionId: `${agent}-session`,
            launchArgs: [...launchArgs]
          }
        )
      ).rejects.toThrow(PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY)
      expect(spawn).not.toHaveBeenCalled()
    }
  )

  it('rejects structured create and resume for unsupported corporate agents before spawn', async () => {
    enableCorporateBuildProfile()
    const { runtime, spawn } = createRuntime()

    await expect(
      runtime.createAgentSession({
        clientOperationId: `${Date.now()}-${'ab'.repeat(16)}`,
        worktree: `id:${TEST_WORKTREE_ID}`,
        agent: 'cursor',
        prompt: 'review',
        promptDelivery: 'draft'
      })
    ).rejects.toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    await expect(
      runtime.ensureAgentSession({
        kind: 'explicit',
        worktree: `id:${TEST_WORKTREE_ID}`,
        agent: 'opencode',
        providerSession: { key: 'session_id', id: 'old-session' }
      })
    ).rejects.toThrow(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    expect(spawn).not.toHaveBeenCalled()
  })
})
