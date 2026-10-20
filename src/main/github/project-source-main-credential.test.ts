import { describe, expect, it, vi } from 'vitest'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'

const evidence = () => ({
  host: 'github.com',
  principalId: 'user:123',
  credentialGeneration: 4,
  source: 'os-keyring',
  configDir: '/trusted/gh',
  identityFingerprint: 'keyring-generation-4',
  policyReviewReceipt: 'owner-reviewed-policy',
  loginVerified: true
})

function fixture() {
  let raw: unknown = evidence()
  let changed = () => {}
  const unsubscribe = vi.fn()
  const readEvidence = vi.fn(() => raw)
  const onRevoke = vi.fn()
  const provider = new MainCredentialEvidenceProvider({
    adapter: {
      readEvidence,
      subscribeChanges(listener) {
        changed = listener
        return unsubscribe
      }
    },
    onRevoke
  })
  return {
    provider,
    readEvidence,
    onRevoke,
    unsubscribe,
    set: (value: unknown) => (raw = value),
    changed: () => changed()
  }
}

describe('Main credential evidence integration', () => {
  it.each([undefined, null, 1])('retires a malformed change subscription %s', (unsubscribe) => {
    const readEvidence = vi.fn(evidence)
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence,
        subscribeChanges: () => unsubscribe as never
      }
    })
    expect(provider.current()).toBeNull()
    expect(readEvidence).not.toHaveBeenCalled()
  })

  it('defaults to NOT VERIFIED with no OS reader or network path', () => {
    const provider = new MainCredentialEvidenceProvider()
    expect(provider.current()).toBeNull()
    expect(provider.status()).toEqual({
      login: 'NOT VERIFIED',
      repositoryPermission: 'NOT VERIFIED',
      checksPermission: 'NOT VERIFIED',
      liveSource: 'LIVE_SOURCE_BLOCKED'
    })
  })

  it('reuses native principal allowlisting without inferring permissions', () => {
    const { provider, set } = fixture()
    set({
      ...evidence(),
      token: 'secret',
      repositoryPermission: 'VERIFIED',
      checksPermission: 'VERIFIED'
    })
    expect(provider.current()).toEqual(evidence())
    expect(provider.status()).toEqual({
      login: 'VERIFIED',
      repositoryPermission: 'NOT VERIFIED',
      checksPermission: 'NOT VERIFIED',
      liveSource: 'LIVE_SOURCE_BLOCKED'
    })
    expect(JSON.stringify(provider.current())).not.toContain('secret')
  })

  it.each([
    { host: 'enterprise.example' },
    { source: 'environment' },
    { loginVerified: false },
    { credentialGeneration: -1 },
    { principalId: '' },
    { policyReviewReceipt: '' }
  ])('rejects invalid evidence %j', (override) => {
    const { provider, set, onRevoke } = fixture()
    set({ ...evidence(), ...override })
    expect(provider.current()).toBeNull()
    expect(onRevoke).toHaveBeenCalledTimes(1)
  })

  it.each(['principalId', 'credentialGeneration', 'configDir', 'identityFingerprint'])(
    'permanently revokes when %s changes without a notification',
    (field) => {
      const { provider, set, onRevoke } = fixture()
      expect(provider.current()).not.toBeNull()
      set({ ...evidence(), [field]: field === 'credentialGeneration' ? 5 : 'changed' })
      expect(provider.current()).toBeNull()
      set(evidence())
      expect(provider.current()).toBeNull()
      expect(onRevoke).toHaveBeenCalledTimes(1)
    }
  )

  it('immediately retires on change notification even when old evidence returns', async () => {
    const { provider, changed, onRevoke, readEvidence } = fixture()
    expect(provider.current()).not.toBeNull()
    await Promise.resolve().then(changed)
    expect(onRevoke).toHaveBeenCalledTimes(1)
    readEvidence.mockClear()
    expect(provider.current()).toBeNull()
    expect(readEvidence).not.toHaveBeenCalled()
  })

  it('revokes on logout and never restores consent on login', () => {
    const { provider, set } = fixture()
    expect(provider.current()).not.toBeNull()
    set(null)
    expect(provider.current()).toBeNull()
    set(evidence())
    expect(provider.current()).toBeNull()
  })

  it('disposes subscription once and revokes authorities', () => {
    const { provider, unsubscribe, onRevoke } = fixture()
    provider.dispose()
    provider.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(onRevoke).toHaveBeenCalledTimes(1)
    expect(provider.principal.current()).toBeNull()
  })

  it('notifies active authority listeners even if another listener fails', () => {
    const { provider, changed } = fixture()
    const abort = vi.fn()
    const removed = vi.fn()
    provider.subscribeRevocation(() => {
      throw new Error('secret')
    })
    provider.subscribeRevocation(abort)
    provider.subscribeRevocation(removed)()
    changed()
    changed()
    expect(abort).toHaveBeenCalledTimes(1)
    expect(removed).not.toHaveBeenCalled()
    const lateSubscriber = vi.fn()
    provider.subscribeRevocation(lateSubscriber)
    expect(lateSubscriber).toHaveBeenCalledTimes(1)
  })

  it('observes direct native principal revocation and never revives after restart', () => {
    const { provider, onRevoke } = fixture()
    expect(provider.current()).not.toBeNull()
    provider.principal.revoke()
    expect(onRevoke).toHaveBeenCalledTimes(1)
    expect(provider.current()).toBeNull()
    expect(new MainCredentialEvidenceProvider().current()).toBeNull()
  })

  it('sanitizes reader and subscription failures', () => {
    const onRevoke = vi.fn()
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence: () => {
          throw new Error('secret')
        },
        subscribeChanges: () => () => {}
      },
      onRevoke
    })
    expect(() => provider.status()).not.toThrow()
    expect(provider.current()).toBeNull()
    expect(onRevoke).toHaveBeenCalledTimes(1)
    const unavailable = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence: () => evidence(),
        subscribeChanges: () => {
          throw new Error('secret')
        }
      }
    })
    expect(unavailable.current()).toBeNull()
  })

  it('handles immediate change notification during subscription installation', () => {
    const unsubscribe = vi.fn()
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence: () => evidence(),
        subscribeChanges(listener) {
          listener()
          return unsubscribe
        }
      }
    })
    expect(provider.current()).toBeNull()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('discards evidence if the cached reader reports a change while being read', () => {
    let changed = () => {}
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence() {
          changed()
          return evidence()
        },
        subscribeChanges(listener) {
          changed = listener
          return () => {}
        }
      }
    })
    expect(provider.current()).toBeNull()
  })
})
