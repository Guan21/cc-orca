import { describe, expect, it, vi } from 'vitest'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'
import { MainNativeGitHubPrincipal } from './project-source-native-principal'

const evidence = () => ({
  host: 'github.com' as const,
  principalId: 'user:123',
  credentialGeneration: 4,
  source: 'os-keyring' as const,
  configDir: '/trusted/gh',
  identityFingerprint: 'keyring-generation-4',
  policyReviewReceipt: 'offline-policy-receipt',
  loginVerified: true as const
})

describe('Main principal synchronous revocation', () => {
  it('retires dependent authorities before calling adapter cleanup', () => {
    const order: string[] = []
    let cleanupEvidence: unknown
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence: evidence,
        subscribeChanges: () => () => {
          order.push('cleanup')
          cleanupEvidence = provider.current()
        }
      }
    })
    provider.subscribeRevocation(() => order.push('retire'))
    expect(provider.current()).not.toBeNull()
    provider.revoke()
    expect(order).toEqual(['retire', 'cleanup'])
    expect(cleanupEvidence).toBeNull()
  })

  it('rejects nested reads before an outer verifier finishes', () => {
    let nested = false
    let nestedEvidence: unknown
    const retire = vi.fn()
    const principal = new MainNativeGitHubPrincipal(() => {
      if (!nested) {
        nested = true
        nestedEvidence = principal.current()
      }
      return evidence()
    }, retire)
    const result = principal.current()
    expect(nestedEvidence).toBeNull()
    expect(result).toBeNull()
    expect(principal.current()).toBeNull()
    expect(retire).toHaveBeenCalledTimes(1)
  })
})
