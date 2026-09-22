import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replace(`{{${key}}}`, value),
      fallback
    )
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

import { getShortcutsPaneSearchEntries } from './shortcuts-search'

describe('getShortcutsPaneSearchEntries', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('hides unsupported per-agent launch actions in corporate search', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const titles = getShortcutsPaneSearchEntries().map((entry) => entry.title)

    expect(titles).toEqual(expect.arrayContaining(['New Claude tab', 'New Codex tab']))
    expect(titles).not.toEqual(
      expect.arrayContaining([
        'New Gemini tab',
        'New OpenCode tab',
        'New Grok tab',
        'New Kimi tab',
        'New Antigravity tab'
      ])
    )
  })

  it('keeps default per-agent launch actions searchable', () => {
    const titles = getShortcutsPaneSearchEntries().map((entry) => entry.title)

    expect(titles).toEqual(
      expect.arrayContaining(['New Gemini tab', 'New OpenCode tab', 'New Antigravity tab'])
    )
  })
})
