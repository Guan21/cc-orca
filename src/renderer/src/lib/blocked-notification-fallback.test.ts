import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { toastWarning } = vi.hoisted(() => ({
  toastWarning: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    warning: toastWarning
  }
}))

describe('showBlockedNotificationFallbackToast', () => {
  const previousBuildProfile = globalThis.__ORCA_BUILD_PROFILE__

  beforeEach(() => {
    vi.resetModules()
    toastWarning.mockClear()
    delete globalThis.__ORCA_BUILD_PROFILE__
    vi.stubGlobal('window', {
      api: {
        notifications: {
          openSystemSettings: vi.fn()
        }
      }
    })
  })

  afterEach(() => {
    if (previousBuildProfile === undefined) {
      delete globalThis.__ORCA_BUILD_PROFILE__
    } else {
      globalThis.__ORCA_BUILD_PROFILE__ = previousBuildProfile
    }
    vi.unstubAllGlobals()
  })

  it('keeps default blocked-notification copy on Orca', async () => {
    const { showBlockedNotificationFallbackToast } = await import('./blocked-notification-fallback')

    showBlockedNotificationFallbackToast()

    expect(toastWarning).toHaveBeenCalledWith(
      'macOS is blocking Orca notifications',
      expect.objectContaining({
        description: 'Turn on Allow notifications for Orca in System Settings.'
      })
    )
  })

  it('uses the corporate product name in blocked-notification copy', async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    const { showBlockedNotificationFallbackToast } = await import('./blocked-notification-fallback')

    showBlockedNotificationFallbackToast()

    expect(toastWarning).toHaveBeenCalledWith(
      'macOS is blocking Secure Orca Lite notifications',
      expect.objectContaining({
        description: 'Turn on Allow notifications for Secure Orca Lite in System Settings.'
      })
    )
  })
})
