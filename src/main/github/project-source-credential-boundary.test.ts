import { describe, expect, it, vi } from 'vitest'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'

const syntheticEvidence = () => ({
  host: 'github.com',
  principalId: 'synthetic-user',
  credentialGeneration: 1,
  source: 'os-keyring',
  configDir: '/synthetic/gh',
  identityFingerprint: 'synthetic-generation-1',
  policyReviewReceipt: 'synthetic-policy',
  loginVerified: true
})

describe('Main credential adapter callback custody (offline only)', () => {
  it('cannot replace an unavailable reader with a fabricated successful reader', () => {
    const replacement = vi.fn(syntheticEvidence)
    const adapter = {
      readEvidence: (): unknown => null,
      subscribeChanges: () => () => {}
    }
    const provider = new MainCredentialEvidenceProvider({ adapter })
    adapter.readEvidence = replacement
    expect(provider.current()).toBeNull()
    expect(replacement).not.toHaveBeenCalled()
  })

  it('captures the reader getter once, preventing a later evidence-source pivot', () => {
    const replacement = vi.fn(syntheticEvidence)
    let reads = 0
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        get readEvidence() {
          reads++
          return reads === 1 ? () => null : replacement
        },
        subscribeChanges: () => () => {}
      }
    })
    expect(reads).toBe(1)
    expect(provider.current()).toBeNull()
    expect(provider.current()).toBeNull()
    expect(reads).toBe(1)
    expect(replacement).not.toHaveBeenCalled()
  })

  it('rejects throwing reader access before installing a change subscription', () => {
    const subscribeChanges = vi.fn(() => () => {})
    const onRevoke = vi.fn()
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        get readEvidence(): () => unknown {
          throw new Error('unavailable')
        },
        subscribeChanges
      },
      onRevoke
    })
    expect(provider.current()).toBeNull()
    expect(subscribeChanges).not.toHaveBeenCalled()
    expect(onRevoke).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, null, true, {}, 'reader'])(
    'rejects malformed reader %s before installing a subscription',
    (readEvidence) => {
      const subscribeChanges = vi.fn(() => () => {})
      const provider = new MainCredentialEvidenceProvider({
        adapter: { readEvidence: readEvidence as never, subscribeChanges }
      })
      expect(provider.current()).toBeNull()
      expect(subscribeChanges).not.toHaveBeenCalled()
    }
  )

  it('denies a throwing subscription accessor without reading credential evidence', () => {
    const readEvidence = vi.fn(syntheticEvidence)
    const provider = new MainCredentialEvidenceProvider({
      adapter: {
        readEvidence,
        get subscribeChanges(): () => () => void {
          throw new Error('subscription unavailable')
        }
      }
    })
    expect(provider.current()).toBeNull()
    expect(readEvidence).not.toHaveBeenCalled()
  })

  it('preserves the captured method receiver without extending permission claims', () => {
    const adapter = {
      cached: syntheticEvidence(),
      readEvidence() {
        return this.cached
      },
      subscribeChanges: () => () => {}
    }
    const provider = new MainCredentialEvidenceProvider({ adapter })
    expect(provider.current()).toEqual(syntheticEvidence())
    expect(provider.status()).toEqual({
      login: 'VERIFIED',
      repositoryPermission: 'NOT VERIFIED',
      checksPermission: 'NOT VERIFIED',
      liveSource: 'LIVE_SOURCE_BLOCKED'
    })
  })

  it.each(Object.keys(syntheticEvidence()))(
    'retires permanently on reentrant access to evidence field %s',
    (field) => {
      const raw = syntheticEvidence()
      let nested: unknown = 'not-called'
      const onRevoke = vi.fn()
      const provider = new MainCredentialEvidenceProvider({
        adapter: {
          readEvidence: () => raw,
          subscribeChanges: () => () => {}
        },
        onRevoke
      })
      Object.defineProperty(raw, field, {
        get() {
          nested = provider.current()
          return syntheticEvidence()[field as keyof typeof raw]
        }
      })
      expect(provider.current()).toBeNull()
      expect(nested).toBeNull()
      expect(provider.current()).toBeNull()
      expect(onRevoke).toHaveBeenCalledTimes(1)
    }
  )

  it.each([undefined, null, Number.NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'cannot authenticate an unknown or invalid generation %s',
    (credentialGeneration) => {
      const provider = new MainCredentialEvidenceProvider({
        adapter: {
          readEvidence: () => ({ ...syntheticEvidence(), credentialGeneration }),
          subscribeChanges: () => () => {}
        }
      })
      expect(provider.current()).toBeNull()
      expect(provider.status().login).toBe('NOT VERIFIED')
    }
  )
})
