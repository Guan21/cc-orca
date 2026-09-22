import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/i18n/localized-catalog', () => ({
  createLocalizedCatalog:
    <T>(loader: () => T) =>
    () =>
      loader()
}))

vi.mock('./settings-search-keywords', () => ({
  translateSearchKeyword: (_key: string, fallback: string) => [fallback]
}))

import { getStatusBarToggles } from './appearance-status-bar-search'

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('getStatusBarToggles', () => {
  it('includes Antigravity usage so Appearance can toggle the default-on status item', () => {
    const antigravityToggle = getStatusBarToggles().find((entry) => entry.id === 'antigravity')

    expect(antigravityToggle).toMatchObject({
      title: 'Antigravity Usage',
      description: 'Show Antigravity subscription usage in the status bar.',
      toggleDescription: 'Show Antigravity subscription usage for the active workspace.'
    })
    expect(antigravityToggle?.keywords).toEqual(
      expect.arrayContaining(['status bar', 'antigravity', 'usage', 'subscription', 'google'])
    )
  })

  it('includes MiniMax usage so Appearance can toggle the default-on status item', () => {
    const miniMaxToggle = getStatusBarToggles().find((entry) => entry.id === 'minimax')

    expect(miniMaxToggle).toMatchObject({
      title: 'MiniMax Usage',
      description: 'Show MiniMax subscription usage in the status bar.',
      toggleDescription: 'Show MiniMax subscription usage for the active workspace.'
    })
    expect(miniMaxToggle?.keywords).toEqual(
      expect.arrayContaining(['status bar', 'minimax', 'usage', 'subscription', 'cookie'])
    )
  })

  it('hides unsupported provider usage toggles in corporate builds', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const toggles = getStatusBarToggles()
    const ids = toggles.map((entry) => entry.id)

    expect(ids).toEqual(
      expect.arrayContaining(['claude', 'codex', 'ssh', 'resource-usage', 'ports'])
    )
    expect(ids).not.toEqual(
      expect.arrayContaining(['gemini', 'opencode-go', 'minimax', 'kimi', 'grok', 'antigravity'])
    )
  })
})
