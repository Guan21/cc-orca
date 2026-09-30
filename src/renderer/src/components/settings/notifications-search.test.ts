import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getNotificationsPaneSearchEntries', () => {
  const previousBuildProfile = globalThis.__ORCA_BUILD_PROFILE__

  beforeEach(() => {
    vi.resetModules()
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  afterEach(() => {
    if (previousBuildProfile === undefined) {
      delete globalThis.__ORCA_BUILD_PROFILE__
    } else {
      globalThis.__ORCA_BUILD_PROFILE__ = previousBuildProfile
    }
  })

  it('keeps default notification search product copy on DevCrew', async () => {
    const { getNotificationsPaneSearchEntries } = await import('./notifications-search')

    const descriptions = getNotificationsPaneSearchEntries().map((entry) => entry.description)

    expect(descriptions).toContain('Master switch for DevCrew desktop notifications.')
    expect(descriptions).toContain(
      'Avoid notifying when DevCrew is focused on the active worktree.'
    )
    expect(descriptions).toContain(
      'Choose the built-in, system, or local audio file DevCrew plays for desktop notifications.'
    )
  })

  it('uses the corporate product name in notification search product copy', async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    const { getNotificationsPaneSearchEntries } = await import('./notifications-search')

    const descriptions = getNotificationsPaneSearchEntries().map((entry) => entry.description)

    expect(descriptions).toContain('Master switch for DevCrew desktop notifications.')
    expect(descriptions).toContain(
      'Avoid notifying when DevCrew is focused on the active worktree.'
    )
    expect(descriptions).toContain(
      'Choose the built-in, system, or local audio file DevCrew plays for desktop notifications.'
    )
  })
})
