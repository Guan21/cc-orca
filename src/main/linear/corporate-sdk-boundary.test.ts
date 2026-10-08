import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLinearSdk } from './linear-sdk'

const { requireSdk, sdk } = vi.hoisted(() => {
  const sdk = { LinearClient: class {}, AuthenticationLinearError: class extends Error {} }
  return { sdk, requireSdk: vi.fn(() => sdk) }
})

vi.mock('node:module', () => ({ createRequire: () => requireSdk }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Corporate Linear SDK boundary', () => {
  it('does not load the SDK in Corporate and checks policy before returning a cached default SDK', () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
    expect(() => loadLinearSdk()).toThrow('administrator authorization')
    expect(requireSdk).not.toHaveBeenCalled()

    vi.stubEnv('ORCA_BUILD_PROFILE', 'default')
    expect(loadLinearSdk()).toBe(sdk)
    expect(requireSdk).toHaveBeenCalledExactlyOnceWith('@linear/sdk')

    vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
    expect(() => loadLinearSdk()).toThrow('administrator authorization')
    expect(requireSdk).toHaveBeenCalledTimes(1)
  })
})
