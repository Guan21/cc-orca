import { afterEach, describe, expect, it } from 'vitest'
import {
  createBrowserHomePageDraftState,
  resolveBrowserHomePageDraftState
} from './browser-home-page-draft-state'
import { getBrowserPaneCombinedSearchEntries } from './browser-pane-search'

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('BrowserPane corporate search', () => {
  it('keeps browser-use setup in default builds but omits it in corporate builds', () => {
    expect(getBrowserPaneCombinedSearchEntries().map((entry) => entry.title)).toContain(
      'Install Browser Use Skill'
    )

    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getBrowserPaneCombinedSearchEntries().map((entry) => entry.title)).not.toContain(
      'Install Browser Use Skill'
    )
    expect(getBrowserPaneCombinedSearchEntries().map((entry) => entry.title)).not.toContain(
      'Enable Orca CLI'
    )
  })
})

describe('BrowserPane home page draft state', () => {
  it('keeps an unsaved draft while the persisted home page is unchanged', () => {
    const state = {
      ...createBrowserHomePageDraftState('https://example.com'),
      value: 'https://typed.example.com'
    }

    expect(resolveBrowserHomePageDraftState(state, 'https://example.com')).toBe(state)
  })

  it('reconciles the draft when the persisted home page changes externally', () => {
    const state = {
      ...createBrowserHomePageDraftState('https://old.example.com'),
      value: 'https://typed.example.com'
    }

    expect(resolveBrowserHomePageDraftState(state, 'https://new.example.com')).toEqual({
      persisted: 'https://new.example.com',
      value: 'https://new.example.com'
    })
  })
})
