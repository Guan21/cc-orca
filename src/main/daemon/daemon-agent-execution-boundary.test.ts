import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import {
  RUNTIME_SANDBOX_SETUP_FAILED,
  RUNTIME_SANDBOX_UNAVAILABLE,
  setRestrictedAgentExecutionBoundaryForTests
} from '../agent-execution-boundary/agent-execution-boundary'
import {
  createMockSubprocess,
  startDaemonAdapterHarness,
  waitFor,
  type DaemonAdapterHarness,
  type SpawnSubprocess
} from './daemon-pty-adapter-test-harness'

const ORIGINAL_ORCA_BUILD_PROFILE = process.env.ORCA_BUILD_PROFILE

function enableCorporateBuildProfile(): void {
  ;(globalThis as { __ORCA_BUILD_PROFILE__?: string }).__ORCA_BUILD_PROFILE__ = 'corporate'
}

describe('daemon agent execution boundary', () => {
  let harness: DaemonAdapterHarness
  let spawnSubprocess: ReturnType<typeof vi.fn<SpawnSubprocess>>
  let lastSubprocess: ReturnType<typeof createMockSubprocess> | undefined

  beforeEach(async () => {
    lastSubprocess = undefined
    spawnSubprocess = vi.fn(() => {
      lastSubprocess = createMockSubprocess()
      return lastSubprocess
    })
    harness = await startDaemonAdapterHarness(spawnSubprocess)
  })

  afterEach(async () => {
    harness?.adapter.dispose()
    await harness?.server.shutdown()
    if (harness?.dir) {
      rmSync(harness.dir, { recursive: true, force: true })
    }
    delete (globalThis as { __ORCA_BUILD_PROFILE__?: string }).__ORCA_BUILD_PROFILE__
    setRestrictedAgentExecutionBoundaryForTests(null)
    if (ORIGINAL_ORCA_BUILD_PROFILE === undefined) {
      delete process.env.ORCA_BUILD_PROFILE
    } else {
      process.env.ORCA_BUILD_PROFILE = ORIGINAL_ORCA_BUILD_PROFILE
    }
  })

  it('keeps default builds on the existing daemon host path', async () => {
    await harness.adapter.spawn({ cols: 80, rows: 24, command: 'claude' })

    expect(spawnSubprocess).toHaveBeenCalledOnce()
  })

  it('fails closed before daemon subprocess spawn when corporate agent launches lack a restricted boundary', async () => {
    enableCorporateBuildProfile()

    await expect(
      harness.adapter.spawn({
        cols: 80,
        rows: 24,
        command: 'claude --permission-mode default'
      })
    ).rejects.toMatchObject({ code: RUNTIME_SANDBOX_UNAVAILABLE })

    expect(spawnSubprocess).not.toHaveBeenCalled()
  })

  it('fails closed before daemon subprocess spawn when restricted boundary setup fails', async () => {
    enableCorporateBuildProfile()
    setRestrictedAgentExecutionBoundaryForTests({
      kind: 'restricted',
      prepare: () => {
        throw new Error('sandbox setup exploded')
      }
    })

    await expect(
      harness.adapter.spawn({
        cols: 80,
        rows: 24,
        command: 'codex --sandbox workspace-write --ask-for-approval on-request'
      })
    ).rejects.toMatchObject({ code: RUNTIME_SANDBOX_SETUP_FAILED })

    expect(spawnSubprocess).not.toHaveBeenCalled()
  })

  it('disposes the prepared restricted runtime when a daemon corporate agent session exits', async () => {
    enableCorporateBuildProfile()
    const dispose = vi.fn()
    setRestrictedAgentExecutionBoundaryForTests({
      kind: 'restricted',
      prepare: ({ spawn }) => ({
        kind: 'restricted',
        spawn,
        dispose
      })
    })

    await harness.adapter.spawn({
      cols: 80,
      rows: 24,
      command: 'claude --permission-mode default'
    })
    expect(lastSubprocess).toBeDefined()

    lastSubprocess?._simulateExit(0)

    await waitFor(() => dispose.mock.calls.length === 1)
  })
})
