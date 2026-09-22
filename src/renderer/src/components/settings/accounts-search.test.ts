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

import { getAccountsMiniMaxSearchEntries, getAccountsPaneSearchEntries } from './accounts-search'

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('getAccountsMiniMaxSearchEntries', () => {
  it('returns a single entry that targets the MiniMax session cookie flow', () => {
    const entries = getAccountsMiniMaxSearchEntries()
    expect(entries).toHaveLength(1)
    const [entry] = entries
    expect(entry.title).toBe('MiniMax Usage')
    expect(entry.description.toLowerCase()).toContain('cookie')
    expect(entry.description.toLowerCase()).toContain('api key')
  })

  it('exposes the keywords that drive the Settings search index', () => {
    const [entry] = getAccountsMiniMaxSearchEntries()
    // Why: the Settings search needs at least one of these tokens to
    // surface the MiniMax section when the user types a related term.
    expect(entry.keywords).toEqual(
      expect.arrayContaining(['minimax', 'cookie', 'session', 'rate limit', 'status bar'])
    )
  })

  it('is included in the rolled-up pane search entries', () => {
    const allEntries = getAccountsPaneSearchEntries()
    const titles = allEntries.map((entry) => entry.title)
    expect(titles).toContain('MiniMax Usage')
  })
})

describe('getAccountsPaneSearchEntries corporate filtering', () => {
  it('keeps Claude and Codex account search entries while hiding unsupported providers', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const titles = getAccountsPaneSearchEntries().map((entry) => entry.title)

    expect(titles).toContain('Claude Code Accounts')
    expect(titles).toContain('Codex Accounts')
    expect(titles).not.toContain('Use Gemini CLI credentials')
    expect(titles).not.toContain('OpenCode Go Session Cookie')
    expect(titles).not.toContain('OpenCode Go Workspace ID')
    expect(titles).not.toContain('MiniMax Usage')
  })

  it('keeps the default account provider catalog unchanged', () => {
    const titles = getAccountsPaneSearchEntries().map((entry) => entry.title)

    expect(titles).toContain('Use Gemini CLI credentials')
    expect(titles).toContain('OpenCode Go Session Cookie')
    expect(titles).toContain('OpenCode Go Workspace ID')
    expect(titles).toContain('MiniMax Usage')
  })
})
