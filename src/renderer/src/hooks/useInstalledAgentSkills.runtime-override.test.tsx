// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_RUNTIME_TARGET } from './installed-agent-skill-discovery'
import type * as SkillDiscovery from './installed-agent-skill-discovery'
import { useInstalledAgentSkill } from './useInstalledAgentSkills'

const mocks = vi.hoisted(() => ({
  discover: vi.fn(async () => ({ skills: [], sources: [], scannedAt: 0 }))
}))

vi.mock('./use-active-skill-discovery-runtime-target', () => ({
  useActiveSkillDiscoveryRuntimeTarget: () => ({
    kind: 'environment',
    environmentId: 'selected-ssh-host'
  })
}))
vi.mock('./installed-agent-skill-discovery', async (importOriginal) => ({
  ...(await importOriginal<typeof SkillDiscovery>()),
  discoverInstalledAgentSkills: mocks.discover
}))
afterEach(() => {
  cleanup()
  mocks.discover.mockClear()
})

describe('explicit Skill discovery runtime', () => {
  it('scans this device after bundled setup while a remote runtime is selected', async () => {
    renderHook(() =>
      useInstalledAgentSkill('orca-cli', {
        runtimeTarget: LOCAL_RUNTIME_TARGET,
        discoveryTarget: { runtime: 'host' }
      })
    )
    await waitFor(() => expect(mocks.discover).toHaveBeenCalled())
    expect(mocks.discover.mock.calls[0]).toEqual([false, { runtime: 'host' }, LOCAL_RUNTIME_TARGET])
  })
  it('preserves active runtime discovery for callers without an override', async () => {
    renderHook(() =>
      useInstalledAgentSkill('orca-cli', {
        discoveryTarget: { runtime: 'wsl', wslDistro: 'Ubuntu' }
      })
    )
    await waitFor(() => expect(mocks.discover).toHaveBeenCalled())
    expect(mocks.discover.mock.calls[0]).toEqual([
      false,
      { runtime: 'wsl', wslDistro: 'Ubuntu' },
      { kind: 'environment', environmentId: 'selected-ssh-host' }
    ])
  })
})
