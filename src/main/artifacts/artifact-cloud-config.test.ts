import { describe, expect, it } from 'vitest'
import {
  allowsArtifactCloudAuthOverride,
  resolveArtifactCloudApiUrl
} from './artifact-cloud-config'

describe('resolveArtifactCloudApiUrl', () => {
  it('is disabled by default instead of using a public cloud fallback', () => {
    expect(resolveArtifactCloudApiUrl(undefined, {}, true)).toBeNull()
  })

  it('allows loopback HTTP only in development', () => {
    expect(
      resolveArtifactCloudApiUrl(
        undefined,
        { ORCA_ARTIFACTS_API_URL: 'http://127.0.0.1:45961' },
        false
      )
    ).toBe('http://127.0.0.1:45961')
    expect(() => resolveArtifactCloudApiUrl('http://127.0.0.1:45961', {}, true)).toThrow(/HTTPS/)
  })

  it('allows administrator-configured HTTPS origins', () => {
    expect(resolveArtifactCloudApiUrl('https://artifacts.example.com', {}, true)).toBe(
      'https://artifacts.example.com'
    )
    expect(() => resolveArtifactCloudApiUrl('https://artifacts.example.com/path', {}, false)).toThrow(
      /origin/
    )
  })

  it('allows auth token overrides only in non-production development builds', () => {
    expect(allowsArtifactCloudAuthOverride({}, false)).toBe(true)
    expect(allowsArtifactCloudAuthOverride({ NODE_ENV: 'production' }, false)).toBe(false)
    expect(allowsArtifactCloudAuthOverride({}, true)).toBe(false)
  })
})
