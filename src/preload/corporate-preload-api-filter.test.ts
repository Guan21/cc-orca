import { describe, expect, it } from 'vitest'
import { filterPreloadApiForBuildProfile } from './corporate-preload-api-filter'

describe('corporate preload API filter', () => {
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
      skills: { discover: () => Promise.resolve([]) },
      mobile: { onRelayStatusChanged: () => () => undefined },
      telemetryTrack: () => Promise.resolve()
    }

    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    expect(filtered.app).toBe(api.app)
    await expect(filtered.skills.discover()).rejects.toThrow(
      'Capability disabled in corporate build: skills'
    )
    expect(filtered.mobile.onRelayStatusChanged()).toBeTypeOf('function')
    await expect(filtered.telemetryTrack()).rejects.toThrow(
      'Capability disabled in corporate build: telemetry'
    )
  })
})
