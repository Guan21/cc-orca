import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesSettingsSearch } from '../settings/settings-search'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/i18n/localized-catalog', () => ({
  createLocalizedCatalog:
    <T>(loader: () => T) =>
    () =>
      loader()
}))

import { getStatsPaneSearchEntries } from './stats-search'

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('getStatsPaneSearchEntries', () => {
  it('hides unsupported provider keywords from corporate Stats search', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const entries = getStatsPaneSearchEntries()
    const searchableText = entries
      .flatMap((entry) => [entry.title, entry.description, ...(entry.keywords ?? [])])
      .join(' ')
      .toLowerCase()

    expect(searchableText).toContain('claude')
    expect(searchableText).toContain('codex')
    expect(searchableText).not.toContain('opencode')
    expect(searchableText).not.toContain('grok')
    expect(matchesSettingsSearch('OpenCode', entries)).toBe(false)
  })

  it('keeps default Stats provider search behavior unchanged', () => {
    const entries = getStatsPaneSearchEntries()

    expect(matchesSettingsSearch('OpenCode', entries)).toBe(true)
    expect(matchesSettingsSearch('Grok', entries)).toBe(true)
  })
})
