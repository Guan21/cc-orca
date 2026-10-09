import { describe, expect, it, vi } from 'vitest'
import { filterPreloadApiForBuildProfile } from './corporate-preload-api-filter'

describe('corporate preload API filter', () => {
  it('exposes declared local history methods while refusing undeclared remote methods', async () => {
    const listSessions = vi.fn().mockResolvedValue({ sessions: [], issues: [] })
    const syncToCloud = vi.fn()
    const api = {
      aiVault: { listSessions, onWindowFocused: () => () => undefined, syncToCloud }
    }
    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    await expect(filtered.aiVault.listSessions()).resolves.toEqual({ sessions: [], issues: [] })
    expect(listSessions).toHaveBeenCalledOnce()
    expect(filtered.aiVault.onWindowFocused()).toBeTypeOf('function')
    await expect(filtered.aiVault.syncToCloud()).rejects.toThrow(
      'Capability disabled in corporate build: ai-vault'
    )
    expect(syncToCloud).not.toHaveBeenCalled()
  })

  it('keeps the default preload API unchanged', () => {
    const api = {
      app: { getVersion: () => Promise.resolve('1.0.0') },
      skills: { discover: () => Promise.resolve([]) }
    }

    expect(filterPreloadApiForBuildProfile(api, 'default')).toEqual(api)
  })

  it('replaces disabled corporate namespaces with fail-closed bridges', async () => {
    const api = {
      app: { getVersion: () => Promise.resolve('1.0.0') },
      skills: { discover: () => Promise.resolve([]), getUpdateRun: () => Promise.resolve(null) },
      mobile: { onRelayStatusChanged: () => () => undefined },
      telemetryTrack: () => Promise.resolve()
    }

    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    expect(filtered.app).toBe(api.app)
    await expect(filtered.skills.discover()).rejects.toThrow(
      'Capability disabled in corporate build: skills'
    )
    await expect(filtered.skills.getUpdateRun()).rejects.toThrow(
      'Capability disabled in corporate build: skills'
    )
    expect(filtered.mobile.onRelayStatusChanged()).toBeTypeOf('function')
    await expect(filtered.telemetryTrack()).rejects.toThrow(
      'Capability disabled in corporate build: telemetry'
    )
  })

  it('preserves disabled namespace bridge shape as plain own properties', async () => {
    const api = {
      app: { getVersion: () => Promise.resolve('1.0.0') },
      crashReports: { readAll: () => Promise.resolve([]) },
      remoteWorkspace: { consumeStartupIntent: () => Promise.resolve(null) },
      ui: { isMaximized: () => Promise.resolve(false) },
      skills: {
        discover: () => Promise.resolve([]),
        onChanged: () => () => undefined,
        packages: {
          install: () => Promise.resolve()
        }
      }
    }

    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    expect(Object.keys(filtered.skills)).toEqual(['discover', 'onChanged', 'packages'])
    expect(Object.keys(filtered.skills.packages)).toEqual(['install'])
    expect(filtered.ui).toBe(api.ui)
    expect(filtered.remoteWorkspace).toBe(api.remoteWorkspace)
    expect(filtered.crashReports).toBe(api.crashReports)
    await expect(filtered.skills.discover()).rejects.toThrow(
      'Capability disabled in corporate build: skills'
    )
    expect(filtered.skills.onChanged()).toBeTypeOf('function')
    await expect(filtered.skills.packages.install()).rejects.toThrow(
      'Capability disabled in corporate build: skills'
    )
  })
})
