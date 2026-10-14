import { describe, expect, it } from 'vitest'
import { taskLifecycleDevelopmentEventFixture } from '../../shared/development-event-fixtures'
import { ProjectSourceAdmission } from './project-source-admission'
import { createSourceFixture } from './project-source-test-fixtures'

function fixture() {
  const f = createSourceFixture()
  f.grant(['ingest-event', 'read-snapshot'])
  const admission = new ProjectSourceAdmission(f.registry, f.leases, {
    maxEvents: 4,
    maxBatchBytes: 4096,
    maxEventBytes: 1024,
    maxDepth: 8,
    maxEntries: 150,
    maxQueuedEvents: 4,
    maxPendingBatches: 4,
    maxRetainedEvents: 4,
    maxRetainedBytes: 4096
  })
  const ingest = () => f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
  const read = () => f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
  const event = taskLifecycleDevelopmentEventFixture({
    projectId: f.scope.projectId,
    source: f.binding.eventSourceName
  })
  const batch = JSON.stringify([{ incarnation: f.scope.producerIncarnation, sequence: 1, event }])
  const observe = (encoded = '[]') => admission.commit(admission.prepare(ingest(), encoded)!)
  return { f, admission, ingest, read, event, batch, observe }
}

describe('Main-owned source availability', () => {
  it('returns unavailable without a registered source', () => {
    const { f, admission, read } = fixture()
    const ticket = read()
    f.registry.invalidate(f.producer)
    expect(admission.readSnapshot(ticket)).toEqual({ status: 'unavailable' })
  })

  it('does not infer attachment or readiness from a read grant or fabricated event', () => {
    const { admission, read, ingest, batch } = fixture()
    expect(admission.readSnapshot(read())).toEqual({ status: 'unavailable' })
    expect(admission.prepare(ingest(), batch)).toBeNull()
    expect(admission.readSnapshot(read())).toEqual({ status: 'unavailable' })
  })

  it('requires ingest authorization to establish the independent attached lifecycle', () => {
    const { admission, read } = fixture()
    expect(admission.attachSource(read())).toBe(false)
    expect(admission.readSnapshot(read())).toEqual({ status: 'unavailable' })
  })

  it('distinguishes attached loading from successfully observed authorized empty', () => {
    const { f, admission, read, ingest, observe } = fixture()
    expect(admission.attachSource(ingest())).toBe(true)
    expect(admission.readSnapshot(read())).toEqual({ status: 'loading', scope: f.scope })
    expect(observe()).toBe(true)
    expect(admission.readSnapshot(read())).toEqual({ status: 'empty', scope: f.scope, events: [] })
  })

  it('returns verified events and exact scope only after attached successful observation', () => {
    const { f, admission, read, ingest, observe, batch, event } = fixture()
    admission.attachSource(ingest())
    expect(observe(batch)).toBe(true)
    expect(admission.readSnapshot(read())).toEqual({
      status: 'ready',
      scope: f.scope,
      events: [event]
    })
  })

  it.each(['expiry', 'revoke', 'replacement', 'session', 'policy'] as const)(
    'removes empty availability on %s',
    (change) => {
      const { f, admission, ingest, read, observe } = fixture()
      admission.attachSource(ingest())
      observe()
      const ticket = read()
      if (change === 'expiry') {
        f.setTime(100)
      }
      if (change === 'revoke') {
        f.leases.revoke('lease')
      }
      if (change === 'replacement') {
        f.restart()
      }
      if (change === 'session') {
        f.registry.invalidateSession()
      }
      if (change === 'policy') {
        f.registry.setPolicyEpoch(2)
      }
      expect(admission.readSnapshot(ticket)).toEqual({ status: 'unavailable' })
    }
  )

  it.each([
    'projectId',
    'repositoryId',
    'workspaceId',
    'worktreeId',
    'executionHostId',
    'executionRealm',
    'setupId',
    'policyEpoch'
  ] as const)('never returns previous data after a %s switch', (key) => {
    const { f, admission, ingest, observe, batch } = fixture()
    admission.attachSource(ingest())
    observe(batch)
    const switched = { ...f.scope, [key]: key === 'policyEpoch' ? 2 : 'other' }
    const ticket = f.leases.capture(f.producer, f.principal, switched as never, 'read-snapshot')
    expect(ticket).toBeNull()
    expect(admission.readSnapshot(Symbol('switched'))).toEqual({ status: 'unavailable' })
  })

  it.each(['error', 'stale', 'disconnected'] as const)(
    'purges evidence and pending batches when the source becomes %s',
    (status) => {
      const { f, admission, ingest, read, observe, batch } = fixture()
      admission.attachSource(ingest())
      observe(batch)
      const pending = admission.prepare(ingest(), '[]')!
      expect(admission.setSourceCondition(ingest(), status)).toBe(true)
      expect(admission.commit(pending)).toBe(false)
      expect(admission.readSnapshot(read())).toEqual({ status, scope: f.scope })
      expect(admission.prepare(ingest(), batch)).toBeNull()
      admission.attachSource(ingest())
      observe()
      expect(admission.readSnapshot(read())).toEqual({
        status: 'empty',
        scope: f.scope,
        events: []
      })
    }
  )

  it.each([
    'revoke',
    'replacement',
    'loading',
    'stale',
    'disconnected',
    'error',
    'commit',
    'expiry',
    'session',
    'policy',
    'dispose'
  ] as const)('rejects a snapshot captured before asynchronous %s completion', async (change) => {
    const { f, admission, ingest, read, observe, batch } = fixture()
    admission.attachSource(ingest())
    observe(batch)
    const response = admission.readSnapshotAsync(read())
    if (change === 'revoke') {
      f.leases.revoke('lease')
    }
    if (change === 'replacement') {
      f.restart()
    }
    if (change === 'loading') {
      admission.attachSource(ingest())
    }
    if (change === 'stale') {
      admission.setSourceCondition(ingest(), 'stale')
    }
    if (change === 'commit') {
      observe()
    }
    if (change === 'disconnected') {
      admission.setSourceCondition(ingest(), 'disconnected')
    }
    if (change === 'error') {
      admission.setSourceCondition(ingest(), 'error')
    }
    if (change === 'expiry') {
      f.setTime(100)
    }
    if (change === 'session') {
      f.registry.invalidateSession()
    }
    if (change === 'policy') {
      f.registry.setPolicyEpoch(2)
    }
    if (change === 'dispose') {
      admission.dispose()
    }
    expect(await response).toEqual({ status: 'unavailable' })
  })

  it('returns an unchanged authorized asynchronous snapshot', async () => {
    const { f, admission, ingest, read, observe } = fixture()
    admission.attachSource(ingest())
    observe()
    expect(await admission.readSnapshotAsync(read())).toEqual({
      status: 'empty',
      scope: f.scope,
      events: []
    })
  })
})
