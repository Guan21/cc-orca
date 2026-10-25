import { describe, expect, it, vi } from 'vitest'
import { readSelectedPrViewFacts } from '../../../shared/github/project-source-renderer-view-contract'
import { createVolatileSelectedPrView } from './project-source-volatile-facts'

const NOW = Date.parse('2026-10-25T13:00:00.000Z')
const SHA = 'a'.repeat(40)
const scope = { projectId: 'p', repositoryId: 23, prNumber: 42, bindingRevision: 7 }
function packet(revision = 0) {
  const event = {
    revision,
    packet: {
      version: 1, projectId: 'p', prNumber: 42, headSha: SHA,
      snapshot: {
        version: 1, projectId: 'p', bindingRevision: 7,
        repository: { host: 'github.com', id: 23, owner: 'Acme', name: 'Demo' },
        fetchedAt: new Date(NOW - 1000).toISOString(),
        facts: [
          { kind: 'pull_request', number: 42, headSha: SHA, state: 'open', updatedAt: new Date(NOW - 2000).toISOString() },
          { kind: 'commit', sha: SHA }
        ],
        attestation: 'not_verified_by_projection',
        agentExecution: 'unknown', taskCompletion: 'unknown'
      }
    }
  }
  const parsed = readSelectedPrViewFacts(event, NOW)
  if (!parsed) {
    throw new Error('offline test packet malformed')
  }
  return parsed
}

describe('G2-C3 volatile Renderer view — no persisted protected facts', () => {
  it('refuses display without an explicit current UI scope', () => {
    const model = createVolatileSelectedPrView(() => NOW)
    expect(model.receive(packet())).toBe(false)
    expect(model.snapshot()).toBeNull()
    model.dispose()
  })

  it('shows only current scope and clears immediately upon A->B->A transition', () => {
    const model = createVolatileSelectedPrView(() => NOW)
    const observe = vi.fn()
    model.subscribe(observe)
    model.select(scope)
    expect(model.receive(packet())).toBe(true)
    expect(model.snapshot()?.projectId).toBe('p')
    model.select({ ...scope, projectId: 'q' })
    expect(model.snapshot()).toBeNull()
    model.select(scope)
    // A reselected UI scope cannot restore the previous revision's protected facts.
    expect(model.receive(packet())).toBe(false)
    expect(model.snapshot()).toBeNull()
    expect(observe).toHaveBeenCalled()
    model.dispose()
  })

  it('rejects a cross-repository or changed revision even if the project label matches', () => {
    const model = createVolatileSelectedPrView(() => NOW)
    model.select({ ...scope, repositoryId: 99 })
    expect(model.receive(packet(1))).toBe(false)
    model.select({ ...scope, bindingRevision: 8 })
    expect(model.receive(packet(2))).toBe(false)
    expect(model.snapshot()).toBeNull()
    model.dispose()
  })

  it('copies snapshots and forgets facts on clear, dispose and failed replays', () => {
    const model = createVolatileSelectedPrView(() => NOW)
    model.select(scope)
    expect(model.receive(packet(1))).toBe(true)
    const observed = model.snapshot()
    if (!observed) {
      throw new Error('missing test snapshot')
    }
    ;(observed as { projectId: string }).projectId = 'tampered'
    expect(model.snapshot()?.projectId).toBe('p')
    model.retire()
    expect(model.snapshot()).toBeNull()
    expect(model.receive(packet(1))).toBe(false)
    model.dispose()
    expect(model.receive(packet(2))).toBe(false)
  })
})
