import { describe, expect, it, vi } from 'vitest'
import { MainNativeGitHubPrincipal } from './project-source-native-principal'

const evidence = () => ({
  host: 'github.com' as const,
  principalId: 'user:123',
  credentialGeneration: 4,
  source: 'os-keyring' as const,
  configDir: '/trusted/gh',
  identityFingerprint: 'keyring-generation-4',
  policyReviewReceipt: 'owner-reviewed-policy',
  loginVerified: true as const
})

describe('Main native principal retirement', () => {
  it('requires an explicit Main verifier and never reads credentials by default', () => {
    const retire = vi.fn()
    const principal = new MainNativeGitHubPrincipal(undefined, retire)
    expect(principal.current()).toBeNull()
    expect(retire).not.toHaveBeenCalled()
  })

  it('copies allowlisted evidence and never treats login as repository/Checks permission', () => {
    const raw = { ...evidence(), token: 'secret', stderr: 'sensitive' }
    const principal = new MainNativeGitHubPrincipal(() => raw, vi.fn())
    const current = principal.current()
    expect(current).toEqual(evidence())
    expect(Object.isFrozen(current)).toBe(true)
    expect(JSON.stringify(current)).not.toMatch(
      /secret|sensitive|repositoryReadVerified|checksVerified/
    )
  })

  it.each([
    'principalId',
    'credentialGeneration',
    'identityFingerprint',
    'configDir',
    'policyReviewReceipt'
  ] as const)('retires on %s change and refuses automatic reenrollment', (field) => {
    let raw = evidence()
    const retire = vi.fn()
    const principal = new MainNativeGitHubPrincipal(() => raw, retire)
    expect(principal.current()).not.toBeNull()
    raw = { ...raw, [field]: field === 'credentialGeneration' ? 5 : 'changed' }
    expect(principal.current()).toBeNull()
    raw = evidence()
    expect(principal.current()).toBeNull()
    expect(retire).toHaveBeenCalledTimes(1)
  })

  it.each([
    { host: 'example.com' },
    { source: 'environment' },
    { loginVerified: false },
    { credentialGeneration: -1 },
    { principalId: '' },
    { identityFingerprint: '' },
    { policyReviewReceipt: '' }
  ])('fails closed on invalid evidence %j', (override) => {
    const principal = new MainNativeGitHubPrincipal(() => ({ ...evidence(), ...override }), vi.fn())
    expect(principal.current()).toBeNull()
  })

  it('logout, explicit revoke and verifier exceptions cannot revive old authority', () => {
    let raw: ReturnType<typeof evidence> | null = evidence()
    const retire = vi.fn()
    const principal = new MainNativeGitHubPrincipal(() => raw, retire)
    expect(principal.current()).not.toBeNull()
    raw = null
    expect(principal.current()).toBeNull()
    raw = evidence()
    expect(principal.current()).toBeNull()
    const replacement = new MainNativeGitHubPrincipal(() => raw, retire)
    expect(replacement.current()).not.toBeNull()
    replacement.revoke()
    expect(replacement.current()).toBeNull()
    const throwing = new MainNativeGitHubPrincipal(() => {
      throw new Error('secret')
    }, retire)
    expect(throwing.current()).toBeNull()
  })
})
