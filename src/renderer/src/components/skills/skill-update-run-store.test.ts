// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillUpdateRun } from '../../../../shared/skill-freshness'
import {
  _resetSkillUpdateRunStore,
  getSkillUpdateRun,
  subscribeSkillUpdateRun
} from './skill-update-run-store'

vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  notifyInstalledAgentSkillsChanged: vi.fn()
}))

const skillsApi = {
  startUpdateRun: vi.fn(async () => {}),
  cancelUpdateRun: vi.fn(async () => {}),
  acknowledgeUpdateRun: vi.fn(async () => {}),
  getUpdateRun: vi.fn(async (): Promise<SkillUpdateRun> => ({ state: 'idle' })),
  onUpdateRun: vi.fn(() => () => undefined)
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('skill update run store', () => {
  beforeEach(() => {
    _resetSkillUpdateRunStore()
    vi.clearAllMocks()
    ;(window as unknown as { api: { skills: typeof skillsApi } }).api = { skills: skillsApi }
  })

  afterEach(() => {
    _resetSkillUpdateRunStore()
  })

  it('loads the current update run for default Skills startup', async () => {
    const listener = vi.fn()
    skillsApi.getUpdateRun.mockResolvedValueOnce({
      state: 'running',
      names: ['orca-cli'],
      startedAt: 1,
      output: ''
    })

    subscribeSkillUpdateRun(listener)
    await flushPromises()

    expect(skillsApi.onUpdateRun).toHaveBeenCalledOnce()
    expect(skillsApi.getUpdateRun).toHaveBeenCalledOnce()
    expect(getSkillUpdateRun()).toEqual({
      state: 'running',
      names: ['orca-cli'],
      startedAt: 1,
      output: ''
    })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('handles disabled corporate Skills startup without leaving idle state', async () => {
    const listener = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    skillsApi.getUpdateRun.mockRejectedValueOnce(
      new Error('Capability disabled in corporate build: skills')
    )

    try {
      subscribeSkillUpdateRun(listener)
      await flushPromises()

      expect(skillsApi.onUpdateRun).toHaveBeenCalledOnce()
      expect(skillsApi.getUpdateRun).toHaveBeenCalledOnce()
      expect(getSkillUpdateRun()).toEqual({ state: 'idle' })
      expect(listener).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
      consoleError.mockRestore()
    }
  })
})
