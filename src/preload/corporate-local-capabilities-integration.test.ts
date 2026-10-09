import { describe, expect, it, vi } from 'vitest'
import { isCapabilityEnabledForBuildProfile } from '../shared/corporate-build-profile'
import { CORPORATE_LOCAL_SESSION_HISTORY_METHODS } from '../shared/corporate-session-history-policy'
import { filterPreloadApiForBuildProfile } from './corporate-preload-api-filter'

describe('combined Corporate local capability exceptions', () => {
  it('preserves local history and Skills together while remote bridges stay disabled', async () => {
    const remote = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    const localHistory = {
      listSessions: vi.fn().mockResolvedValue({ sessions: [], issues: [] }),
      resolveSessionTitles: vi.fn().mockResolvedValue(undefined),
      cancelListSessions: vi.fn().mockResolvedValue(undefined),
      prepareSessionResume: vi.fn().mockResolvedValue(undefined),
      listSubagentSessions: vi.fn().mockResolvedValue(undefined),
      getFirstUserPrompt: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      onWindowFocused: vi.fn(() => unsubscribe)
    }
    const localSkills = {
      discover: vi.fn().mockResolvedValue([]),
      freshnessInventory: vi.fn().mockResolvedValue({}),
      deleteSupported: vi.fn().mockResolvedValue(true),
      previewDelete: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    }
    const api = {
      aiVault: {
        ...localHistory,
        syncToCloud: remote,
        futureRemoteOperation: remote,
        cloud: { upload: remote }
      },
      skills: {
        ...localSkills,
        getPackage: remote,
        installShare: remote,
        listOwnedShares: remote,
        getUpdateRun: remote,
        futureRemoteOperation: remote,
        packages: { install: remote }
      },
      jira: { connect: remote, status: remote },
      linear: { connect: remote, status: remote },
      plugins: { install: remote, refreshMarketplaces: remote }
    }
    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    for (const capability of ['ai-vault', 'skills', 'jira', 'linear', 'plugins'] as const) {
      expect(isCapabilityEnabledForBuildProfile(capability, 'corporate')).toBe(false)
    }
    expect([...CORPORATE_LOCAL_SESSION_HISTORY_METHODS].sort()).toEqual(
      Object.keys(localHistory).sort()
    )
    for (const method of Object.keys(localHistory) as (keyof typeof localHistory)[]) {
      expect(filtered.aiVault[method]).toBe(localHistory[method])
      if (method === 'onWindowFocused') {
        expect(filtered.aiVault.onWindowFocused()).toBe(unsubscribe)
      } else {
        await filtered.aiVault[method]()
      }
      expect(localHistory[method]).toHaveBeenCalledOnce()
    }
    for (const operation of Object.keys(localSkills) as (keyof typeof localSkills)[]) {
      expect(filtered.skills[operation]).toBe(localSkills[operation])
      await filtered.skills[operation]()
      expect(localSkills[operation]).toHaveBeenCalledOnce()
    }
    const disabledActions = [
      ['ai-vault', filtered.aiVault.syncToCloud],
      ['ai-vault', filtered.aiVault.futureRemoteOperation],
      ['ai-vault', filtered.aiVault.cloud.upload],
      ['skills', filtered.skills.getPackage],
      ['skills', filtered.skills.installShare],
      ['skills', filtered.skills.listOwnedShares],
      ['skills', filtered.skills.getUpdateRun],
      ['skills', filtered.skills.futureRemoteOperation],
      ['skills', filtered.skills.packages.install],
      ['jira', filtered.jira.connect],
      ['jira', filtered.jira.status],
      ['linear', filtered.linear.connect],
      ['linear', filtered.linear.status],
      ['plugins', filtered.plugins.install],
      ['plugins', filtered.plugins.refreshMarketplaces]
    ] as const
    for (const [capability, action] of disabledActions) {
      await expect(action()).rejects.toThrow(
        `Capability disabled in corporate build: ${capability}`
      )
    }
    expect(remote).not.toHaveBeenCalled()
  })

  it('preserves both namespaces and remote bridges unchanged in default builds', () => {
    const api = {
      aiVault: { listSessions: vi.fn(), syncToCloud: vi.fn() },
      skills: { discover: vi.fn(), installShare: vi.fn() },
      jira: { connect: vi.fn() },
      linear: { connect: vi.fn() }
    }
    expect(filterPreloadApiForBuildProfile(api, 'default')).toBe(api)
  })
})
