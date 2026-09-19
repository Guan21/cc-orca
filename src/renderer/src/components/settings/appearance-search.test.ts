import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n/i18n'
import { getLanguageEntries } from './appearance-search'
import { matchesSettingsSearch } from './settings-search'

// Native word for "language" in each supported UI language. These must be
// findable no matter which locale the interface is currently rendered in, so a
// speaker can locate (and switch to) their language from any starting point.
const NATIVE_LANGUAGE_WORDS = ['语言', '語言', '언어', '言語', 'Idioma', 'Langue']

describe('getLanguageEntries', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each(['en', 'zh', 'ko', 'ja', 'es', 'fr'])(
    'indexes every native word for "language" under the %s UI locale',
    async (locale) => {
      await i18n.changeLanguage(locale)
      const entry = getLanguageEntries()[0]
      for (const word of NATIVE_LANGUAGE_WORDS) {
        expect(matchesSettingsSearch(word, entry)).toBe(true)
      }
    }
  )

  it('matches the Spanish native language name in English UI', async () => {
    await i18n.changeLanguage('en')
    expect(matchesSettingsSearch('Español', getLanguageEntries()[0])).toBe(true)
  })

  it('matches the French native language name in English UI', async () => {
    await i18n.changeLanguage('en')
    expect(matchesSettingsSearch('Français', getLanguageEntries()[0])).toBe(true)
  })
})

describe('appearance product copy', () => {
  afterEach(() => {
    delete (globalThis as { __ORCA_BUILD_PROFILE__?: unknown }).__ORCA_BUILD_PROFILE__
  })

  it.each([
    ['default', 'Orca'],
    ['corporate', 'Secure Orca Lite']
  ] as const)('uses the %s product name in visible search descriptions', async (profile, name) => {
    ;(globalThis as { __ORCA_BUILD_PROFILE__?: typeof profile }).__ORCA_BUILD_PROFILE__ = profile
    vi.resetModules()
    const { getLanguageEntries, getThemeEntries, getTitlebarEntries, getTypographyEntries } =
      await import('./appearance-search')
    const { getMenuBarIconEntries, getSystemTrayEntries } =
      await import('./appearance-system-presence-search')

    expect(getThemeEntries()[0]?.description).toBe(`Choose how ${name} looks in the app window.`)
    expect(getLanguageEntries()[0]?.description).toBe(
      `Choose the language used by the ${name} interface.`
    )
    expect(getTypographyEntries()[0]?.description).toBe(
      `Choose the font used by the ${name} interface.`
    )
    expect(getTitlebarEntries()[0]?.description).toBe(`Show ${name} in the titlebar.`)
    expect(getSystemTrayEntries({ showSystemTray: true })[0]?.description).toBe(
      `When enabled, closing the window keeps ${name} running in the system tray instead of quitting.`
    )
    expect(getMenuBarIconEntries({ showMenuBarIcon: true })[0]?.description).toBe(
      `Keep ${profile === 'default' ? 'an' : 'a'} ${name} shortcut and activity indicator in the macOS menu bar.`
    )
  })

  it.each([
    [
      'default',
      "Choisissez la langue utilisée par l'interface d'Orca.",
      "Choisissez la police utilisée par l'interface d'Orca.",
      "Choisissez l'apparence d'Orca dans la fenêtre de l'app."
    ],
    [
      'corporate',
      "Choisissez la langue utilisée par l'interface de Secure Orca Lite.",
      "Choisissez la police utilisée par l'interface de Secure Orca Lite.",
      "Choisissez l'apparence de Secure Orca Lite dans la fenêtre de l'app."
    ]
  ] as const)(
    'keeps French %s product grammar intact',
    async (profile, language, typography, theme) => {
      ;(globalThis as { __ORCA_BUILD_PROFILE__?: typeof profile }).__ORCA_BUILD_PROFILE__ = profile
      vi.resetModules()
      const { i18n: isolatedI18n } = await import('@/i18n/i18n')
      await isolatedI18n.changeLanguage('fr')
      const { getLanguageEntries, getThemeEntries, getTypographyEntries } =
        await import('./appearance-search')

      expect(getLanguageEntries()[0]?.description).toBe(language)
      expect(getTypographyEntries()[0]?.description).toBe(typography)
      expect(getThemeEntries()[0]?.description).toBe(theme)
    }
  )
})
