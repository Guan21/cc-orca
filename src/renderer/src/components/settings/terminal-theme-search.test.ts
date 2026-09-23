import { describe, expect, it, vi } from 'vitest'

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

import { getTerminalLightThemeSearchEntries } from './terminal-theme-search'

describe('terminal theme search entries', () => {
  it('uses neutral light-theme search copy without product branding', () => {
    const lightThemeEntry = getTerminalLightThemeSearchEntries().find(
      (entry) => entry.title === 'Light Theme'
    )

    expect(lightThemeEntry?.description).toBe('Choose the theme used in light mode.')
    expect(lightThemeEntry?.description).not.toContain('Orca')
  })
})
