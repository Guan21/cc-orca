import { describe, expect, it } from 'vitest'
import {
  readSelectedPrViewClear,
  readSelectedPrViewFacts
} from './project-source-renderer-view-contract'

const SHA = 'a'.repeat(40)
const NOW = Date.parse('2026-10-25T13:00:00.000Z')

export function validViewEvent(revision = 0) {
  return {
    revision,
    packet: {
      version: 1,
      projectId: 'p',
      prNumber: 42,
      headSha: SHA,
      snapshot: {
        version: 1,
        projectId: 'p',
        bindingRevision: 7,
        repository: { host: 'github.com', id: 23, owner: 'Acme', name: 'Demo' },
        fetchedAt: new Date(NOW - 1000).toISOString(),
        facts: [
          { kind: 'pull_request', number: 42, headSha: SHA, state: 'open', updatedAt: new Date(NOW - 2000).toISOString() },
          { kind: 'commit', sha: SHA },
          { kind: 'check_run', id: 12, headSha: SHA, status: 'completed', conclusion: 'success' }
        ],
        attestation: 'not_verified_by_projection',
        agentExecution: 'unknown',
        taskCompletion: 'unknown'
      }
    }
  }
}

describe('G2-C3 v1 Renderer event projection — data, not authorization', () => {
  it('accepts and normalizes one bounded selected PR packet', () => {
    const parsed = readSelectedPrViewFacts(validViewEvent(), NOW)
    expect(parsed).toMatchObject({ revision: 0, packet: { projectId: 'p', prNumber: 42, headSha: SHA } })
    expect(parsed?.packet.snapshot.taskCompletion).toBe('unknown')
  })

  it.each([
    ['unknown top-level key', { ...validViewEvent(), token: 'never' }],
    ['extra packet field', { ...validViewEvent(), packet: { ...validViewEvent().packet, credential: 'never' } }],
    ['wrong PR', { ...validViewEvent(), packet: { ...validViewEvent().packet, prNumber: 99 } }],
    ['wrong HEAD', { ...validViewEvent(), packet: { ...validViewEvent().packet, headSha: 'b'.repeat(40) } }],
    ['injected task claim', { ...validViewEvent(), packet: { ...validViewEvent().packet, snapshot: { ...validViewEvent().packet.snapshot, taskCompletion: 'completed' } } }],
    ['invalid check', { ...validViewEvent(), packet: { ...validViewEvent().packet, snapshot: { ...validViewEvent().packet.snapshot, facts: [{ kind: 'check_run', id: 12, headSha: SHA, status: 'completed', conclusion: 'success', secret: 'never' }] } } }],
    ['stale age', validViewEvent(-1)]
  ])('rejects %s without forwarding', (_title, candidate) => {
    expect(readSelectedPrViewFacts(candidate, NOW)).toBeNull()
  })

  it('rejects expired, malformed, and accessor-backed envelopes', () => {
    expect(readSelectedPrViewFacts(validViewEvent(), NOW + 6 * 60_000)).toBeNull()
    expect(readSelectedPrViewFacts({ get revision() { throw new Error('side effect') }, packet: validViewEvent().packet }, NOW)).toBeNull()
    expect(readSelectedPrViewFacts({ revision: 1, packet: null }, NOW)).toBeNull()
  })

  it('accepts only minimal revision-only clear messages', () => {
    expect(readSelectedPrViewClear({ revision: 1 })).toEqual({ revision: 1 })
    expect(readSelectedPrViewClear({ revision: 1, data: 'unexpected' })).toBeNull()
    expect(readSelectedPrViewClear({ revision: Number.NaN })).toBeNull()
  })
})
