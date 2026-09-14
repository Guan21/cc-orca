import { afterEach, describe, expect, it } from 'vitest'
import { getProductDisplayName } from './product-display-name'

const previousProfile = globalThis.__ORCA_BUILD_PROFILE__

describe('product-display-name', () => {
  afterEach(() => {
    globalThis.__ORCA_BUILD_PROFILE__ = previousProfile
  })

  it('uses Orca for the default build', () => {
    expect(getProductDisplayName('default')).toBe('Orca')
  })

  it('uses Secure Orca Lite for the corporate build', () => {
    expect(getProductDisplayName('corporate')).toBe('Secure Orca Lite')
  })

  it('does not leak corporate branding into an unset build profile', () => {
    delete globalThis.__ORCA_BUILD_PROFILE__

    expect(getProductDisplayName()).toBe('Orca')
  })
})
