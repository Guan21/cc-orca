import { afterEach, describe, expect, it } from 'vitest'
import { createUIStore } from '../ui-slice-test-harness'

const ORIGINAL_PROFILE = process.env.ORCA_BUILD_PROFILE

function useCorporateProfile(): void {
  process.env.ORCA_BUILD_PROFILE = 'corporate'
}

afterEach(() => {
  if (ORIGINAL_PROFILE === undefined) {
    delete process.env.ORCA_BUILD_PROFILE
  } else {
    process.env.ORCA_BUILD_PROFILE = ORIGINAL_PROFILE
  }
})

describe('UI slice corporate build profile gates', () => {
  it('does not open disabled top-level skills surfaces', () => {
    useCorporateProfile()
    const store = createUIStore()

    store.getState().openSkillsPage()
    expect(store.getState().activeView).toBe('terminal')

    store.getState().openSkillShare('share-1')
    expect(store.getState().activeView).toBe('terminal')
    expect(store.getState().pendingSkillShareId).toBeNull()

    store.getState().openSkillsSharedLinks()
    expect(store.getState().activeView).toBe('terminal')
    expect(store.getState().pendingSkillsSharedView).toBe(false)
  })

  it('does not open the disabled mobile surface', () => {
    useCorporateProfile()
    const store = createUIStore()
    store.setState({ activeView: 'settings' })

    store.getState().openMobilePage()

    expect(store.getState().activeView).toBe('settings')
  })
})
