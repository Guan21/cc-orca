import { describe, expect, it, vi } from 'vitest'
import { taskLifecycleDevelopmentEventFixture } from '../../shared/development-event-fixtures'
import {
  ProjectSourceAdmission,
  type SourceAdmissionLimits,
  type PendingSourceBatch
} from './project-source-admission'
import { createSourceFixture } from './project-source-test-fixtures'
import type { OperationTicket } from './project-source-leases'

const limits: SourceAdmissionLimits = {
  maxEvents: 4,
  maxBatchBytes: 4096,
  maxEventBytes: 1024,
  maxDepth: 8,
  maxEntries: 150,
  maxQueuedEvents: 4,
  maxPendingBatches: 2,
  maxRetainedEvents: 4,
  maxRetainedBytes: 4096
}

function admissionFixture(overrides: Partial<SourceAdmissionLimits> = {}) {
  const trusted = createSourceFixture()
  trusted.grant(['ingest-event', 'read-snapshot'])
  const admission = new ProjectSourceAdmission(trusted.registry, trusted.leases, {
    ...limits,
    ...overrides
  })
  const capture = (permission: 'ingest-event' | 'read-snapshot') =>
    trusted.leases.capture(trusted.producer, trusted.principal, trusted.scope, permission)!
  admission.attachSource(capture('ingest-event'))
  const event = taskLifecycleDevelopmentEventFixture({
    projectId: trusted.scope.projectId,
    source: trusted.binding.eventSourceName
  })
  const observation = (sequence = 1) => ({
    sequence,
    incarnation: trusted.scope.producerIncarnation,
    event: { ...event, eventId: `event-${sequence}` }
  })
  const encode = (items = [observation()]) => JSON.stringify(items)
  return { ...trusted, trusted, admission, capture, observation, encode }
}

describe('Main bounded admission and retained state', () => {
  it('rejects missing budgets and registry/lease ownership confusion', () => {
    const f = admissionFixture()
    const other = createSourceFixture()
    for (const key of Object.keys(limits)) {
      const incomplete = { ...limits } as Record<string, unknown>
      delete incomplete[key]
      expect(() => new ProjectSourceAdmission(f.registry, f.leases, incomplete as never)).toThrow()
    }
    const mismatched = new ProjectSourceAdmission(other.registry, f.leases, limits)
    expect(mismatched.prepare(f.capture('ingest-event'), f.encode())).toBeNull()
    expect(mismatched.readSnapshot(f.capture('read-snapshot'))).toEqual({ status: 'unavailable' })
  })

  it('isolates equal event/project IDs in independent installation registry caches', () => {
    const first = admissionFixture()
    const second = admissionFixture()
    expect(
      first.admission.commit(
        first.admission.prepare(first.capture('ingest-event'), first.encode())!
      )
    ).toBe(true)
    expect(second.admission.readSnapshot(second.capture('read-snapshot'))).toEqual({
      status: 'loading',
      scope: second.scope
    })
    expect(second.admission.readSnapshot(first.capture('read-snapshot'))).toEqual({
      status: 'unavailable'
    })
    expect(second.admission.prepare(first.capture('ingest-event'), first.encode())).toBeNull()
  })

  it('rejects the old producer incarnation after restart with a new authorized ticket', () => {
    const f = admissionFixture()
    const old = f.encode()
    f.trusted.restart()
    f.trusted.grant(['ingest-event', 'read-snapshot'])
    const fresh = f.leases.capture(
      f.trusted.producer,
      f.principal,
      f.trusted.scope,
      'ingest-event'
    )!
    expect(f.trusted.scope.producerIncarnation).not.toBe(f.scope.producerIncarnation)
    expect(f.trusted.scope.registrationRevision).toBeGreaterThan(f.scope.registrationRevision)
    expect(f.admission.prepare(fresh, old)).toBeNull()
    const read = f.leases.capture(
      f.trusted.producer,
      f.principal,
      f.trusted.scope,
      'read-snapshot'
    )!
    expect(f.admission.readSnapshot(read)).toEqual({ status: 'unavailable' })
  })
  it('admits exact authorized observations without connecting a projection or EventBus', () => {
    const f = admissionFixture()
    const pending = f.admission.prepare(f.capture('ingest-event'), f.encode())!
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toEqual({
      status: 'loading',
      scope: f.scope
    })
    expect(f.admission.commit(pending)).toBe(true)
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toEqual({
      status: 'ready',
      scope: f.scope,
      events: [f.observation().event]
    })
    expect(f.admission.commit(pending)).toBe(false)
  })

  it('denies forged tickets and prevents ingest/read permission interchange', () => {
    const f = admissionFixture()
    expect(f.admission.prepare(Symbol('forged') as OperationTicket, f.encode())).toBeNull()
    expect(f.admission.readSnapshot(Symbol('forged') as OperationTicket)).toEqual({
      status: 'unavailable'
    })
    expect(f.admission.prepare(f.capture('read-snapshot'), f.encode())).toBeNull()
    expect(f.admission.readSnapshot(f.capture('ingest-event'))).toEqual({ status: 'unavailable' })
    expect(f.admission.commit(Symbol('forged') as PendingSourceBatch)).toBe(false)
  })

  it('handles identical duplicates as no-ops and conflicts atomically', () => {
    const f = admissionFixture()
    const ingest = f.capture('ingest-event')
    const read = f.capture('read-snapshot')
    expect(f.admission.commit(f.admission.prepare(ingest, f.encode())!)).toBe(true)
    expect(f.admission.commit(f.admission.prepare(ingest, f.encode())!)).toBe(true)
    const before = f.admission.readSnapshot(read)
    const conflicting = {
      ...f.observation(),
      event: { ...f.observation().event, payload: { title: 'conflicting' } }
    }
    expect(f.admission.prepare(ingest, JSON.stringify([f.observation(2), conflicting]))).toBeNull()
    expect(f.admission.readSnapshot(read)).toEqual(before)
    expect(f.admission.commit(f.admission.prepare(ingest, f.encode([f.observation(2)]))!)).toBe(
      true
    )
    expect(f.admission.readSnapshot(read)).toMatchObject({
      status: 'ready',
      events: [f.observation().event, f.observation(2).event]
    })
  })

  it.each(['project', 'source', 'incarnation', 'sequence', 'invalid'] as const)(
    'rejects mixed/invalid replay %s with no partial mutation',
    (mismatch) => {
      const f = admissionFixture()
      const next = f.observation(2)
      const bad =
        mismatch === 'project'
          ? { ...next, event: { ...next.event, projectId: 'other' } }
          : mismatch === 'source'
            ? { ...next, event: { ...next.event, source: 'forged' } }
            : mismatch === 'incarnation'
              ? { ...next, incarnation: 'old' }
              : mismatch === 'sequence'
                ? { ...next, sequence: 3 }
                : { ...next, event: {} }
      expect(
        f.admission.prepare(f.capture('ingest-event'), JSON.stringify([f.observation(), bad]))
      ).toBeNull()
      expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toEqual({
        status: 'loading',
        scope: f.scope
      })
      expect(f.admission.commit(f.admission.prepare(f.capture('ingest-event'), f.encode())!)).toBe(
        true
      )
    }
  )

  it('rejects duplicate sequence with different IDs, regressions and same ID at new sequence', () => {
    const f = admissionFixture()
    const ingest = f.capture('ingest-event')
    expect(f.admission.commit(f.admission.prepare(ingest, f.encode())!)).toBe(true)
    const bad = [
      { ...f.observation(), event: { ...f.observation().event, eventId: 'another' } },
      { ...f.observation(2), event: f.observation().event }
    ]
    for (const item of bad) {
      expect(f.admission.prepare(ingest, JSON.stringify([item]))).toBeNull()
    }
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toMatchObject({
      status: 'ready',
      events: [f.observation().event]
    })
  })

  it('bounds pending batches and queued observations without consuming sequence after overflow', () => {
    const f = admissionFixture({ maxQueuedEvents: 1, maxPendingBatches: 1 })
    const ingest = f.capture('ingest-event')
    expect(f.admission.prepare(ingest, f.encode([f.observation(), f.observation(2)]))).toBeNull()
    const first = f.admission.prepare(ingest, f.encode())!
    expect(f.admission.prepare(ingest, '[]')).toBeNull()
    f.admission.cancel(first)
    expect(f.admission.commit(f.admission.prepare(ingest, f.encode())!)).toBe(true)
  })

  it('bounds retained count/bytes and invalidates concurrent stale batches', () => {
    const f = admissionFixture({ maxRetainedEvents: 1 })
    const ingest = f.capture('ingest-event')
    const first = f.admission.prepare(ingest, f.encode())!
    const raced = f.admission.prepare(ingest, f.encode())!
    expect(f.admission.commit(first)).toBe(true)
    expect(f.admission.commit(raced)).toBe(false)
    expect(f.admission.prepare(ingest, f.encode([f.observation(2)]))).toBeNull()
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toMatchObject({
      status: 'ready',
      events: [f.observation().event]
    })
    const tiny = admissionFixture({ maxRetainedBytes: 1 })
    expect(tiny.admission.prepare(tiny.capture('ingest-event'), tiny.encode())).toBeNull()
    expect(tiny.admission.readSnapshot(tiny.capture('read-snapshot'))).toEqual({
      status: 'loading',
      scope: tiny.scope
    })
  })

  it.each(['revoke', 'reissue', 'restart', 'session', 'policy', 'expiry'] as const)(
    'rejects stale asynchronous %s completion before projection/delivery',
    async (change) => {
      const f = admissionFixture()
      const ingest = f.capture('ingest-event')
      const read = f.capture('read-snapshot')
      const pending = f.admission.prepare(ingest, f.encode())!
      const projection = vi.fn()
      const delivery = vi.fn()
      let finish!: () => void
      const wait = new Promise<void>((resolve) => {
        finish = resolve
      })
      const operation = (async () => {
        await wait
        if (f.admission.commit(pending)) {
          projection()
        }
        const snapshot = f.admission.readSnapshot(read)
        if (snapshot.status === 'ready' || snapshot.status === 'empty') {
          delivery(snapshot)
        }
      })()
      if (change === 'revoke' || change === 'reissue') {
        f.leases.revoke('lease')
      }
      if (change === 'reissue') {
        f.trusted.restart()
        f.trusted.grant(['ingest-event', 'read-snapshot'])
      }
      if (change === 'restart') {
        f.trusted.restart()
      }
      if (change === 'session') {
        f.registry.invalidateSession()
      }
      if (change === 'policy') {
        f.registry.setPolicyEpoch(2)
      }
      if (change === 'expiry') {
        f.setTime(100)
      }
      finish()
      await operation
      expect(projection).not.toHaveBeenCalled()
      expect(delivery).not.toHaveBeenCalled()
      expect(f.admission.prepare(ingest, f.encode())).toBeNull()
    }
  )

  it('purges retained data on revocation and never restores it through same-scope reissue', () => {
    const f = admissionFixture()
    expect(f.admission.commit(f.admission.prepare(f.capture('ingest-event'), f.encode())!)).toBe(
      true
    )
    f.leases.revoke('lease')
    f.trusted.restart()
    f.trusted.grant(['ingest-event', 'read-snapshot'])
    const newRead = f.leases.capture(
      f.trusted.producer,
      f.principal,
      f.trusted.scope,
      'read-snapshot'
    )!
    expect(f.admission.readSnapshot(newRead)).toEqual({ status: 'unavailable' })
  })

  it('keeps returned event mutations out of retained state', () => {
    const f = admissionFixture()
    f.admission.commit(f.admission.prepare(f.capture('ingest-event'), f.encode())!)
    const snapshot = f.admission.readSnapshot(f.capture('read-snapshot'))
    if (snapshot.status !== 'ready') {
      throw new Error('Expected verified observations')
    }
    snapshot.events[0].projectId = 'changed'
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toMatchObject({
      status: 'ready',
      events: [f.observation().event]
    })
    f.admission.dispose()
    expect(f.admission.readSnapshot(f.capture('read-snapshot'))).toEqual({ status: 'unavailable' })
  })
})
