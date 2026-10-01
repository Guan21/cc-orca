import { afterEach, describe, expect, it } from 'vitest'
import { getProductDisplayName } from './product-display-name'

const previousProfile = globalThis.__ORCA_BUILD_PROFILE__

describe('product-display-name', () => {
  afterEach(() => {
    globalThis.__ORCA_BUILD_PROFILE__ = previousProfile
  })

  it('uses DevCrew for the default build', () => {
    expect(getProductDisplayName('default')).toBe('DevCrew')
  })

  it('uses DevCrew for the corporate build', () => {
    expect(getProductDisplayName('corporate')).toBe('DevCrew')
  })

  it('uses DevCrew for an unset build profile', () => {
    delete globalThis.__ORCA_BUILD_PROFILE__

    expect(getProductDisplayName()).toBe('DevCrew')
  })
})
