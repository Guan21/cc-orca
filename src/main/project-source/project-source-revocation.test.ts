import { describe, expect, it, vi } from 'vitest'
import { taskLifecycleDevelopmentEventFixture } from '../../shared/development-event-fixtures'
import { ProjectSourceAdmission } from './project-source-admission'
import { ProjectSourceLeases, type TrustedProjectSourceLease } from './project-source-leases'
import { ProjectSourceRegistry } from './project-source-registry'
import { createSourceFixture, fixtureScope } from './project-source-test-fixtures'

function revocationFixture(maxOperations = 8) {
  const f = createSourceFixture()
  let records: readonly TrustedProjectSourceLease[] = [f.grant(['ingest-event', 'read-snapshot'])]
  const leases = new ProjectSourceLeases(f.registry, {
    clock: () => 0,
    leaseDurationMs: 100,
    maxOperations,
    trustedLeaseRecords: () => records
  })
  return {
    ...f,
    leases,
    removeRecords() {
      records = []
    },
    replaceLease(id: string) {
      records = [Object.freeze({ ...records[0], id, generation: Symbol('replacement') })]
    }
  }
}

describe('Main explicit lease revocation', () => {
  it.each([false, true])(
    'purges retained evidence, pending batches and cloned reads with removed lease: %s',
    async (removed) => {
      const f = revocationFixture()
      const admission = new ProjectSourceAdmission(f.registry, f.leases, {
        maxEvents: 4,
        maxBatchBytes: 4096,
        maxEventBytes: 1024,
        maxDepth: 8,
        maxEntries: 150,
        maxQueuedEvents: 4,
        maxPendingBatches: 2,
        maxRetainedEvents: 4,
        maxRetainedBytes: 4096
      })
      const ingest = f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
      const read = f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
      expect(admission.attachSource(ingest)).toBe(true)
      const encode = (sequence: number) =>
        JSON.stringify([
          {
            sequence,
            incarnation: f.scope.producerIncarnation,
            event: taskLifecycleDevelopmentEventFixture({
              eventId: `event-${sequence}`,
              projectId: f.scope.projectId,
              source: f.binding.eventSourceName,
              payload: { metadata: { evidenceReference: 'fixture-evidence' } }
            })
          }
        ])
      expect(admission.commit(admission.prepare(ingest, encode(1))!)).toBe(true)
      expect(admission.readSnapshot(read).status).toBe('ready')
      const pending = [admission.prepare(ingest, encode(2))!, admission.prepare(ingest, encode(2))!]
      expect(pending.every(Boolean)).toBe(true)
      const response = admission.readSnapshotAsync(read)
      let complete!: () => void
      const deferred = new Promise<void>((resolve) => {
        complete = resolve
      })
      const commits = pending.map(async (batch) => {
        await deferred
        return admission.commit(batch)
      })
      if (removed) {
        f.removeRecords()
      }
      f.leases.revoke('lease')
      expect(f.registry.resolve(f.producer)).toBeNull()
      complete()
      expect(await Promise.all(commits)).toEqual([false, false])
      expect(await response).toEqual({ status: 'unavailable' })
      expect(admission.readSnapshot(read)).toEqual({ status: 'unavailable' })
      expect(f.leases.validate(ingest)).toBeNull()
      admission.dispose()
    }
  )

  it.each([false, true])('purges immediately with lease removed: %s', (removed) => {
    const f = revocationFixture()
    const ticket = f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    const purge = vi.fn()
    f.registry.onInvalidation(purge)
    if (removed) {
      f.removeRecords()
    }
    f.leases.revoke('lease')
    expect(f.registry.resolve(f.producer)).toBeNull()
    expect(purge).toHaveBeenCalledExactlyOnceWith(f.producer)
    expect(f.leases.validate(ticket)).toBeNull()
  })

  it('retains the revocation association after all operation tickets are released', () => {
    const f = revocationFixture()
    const ticket = f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
    f.leases.release(ticket)
    f.removeRecords()
    f.leases.revoke('lease')
    expect(f.registry.resolve(f.producer)).toBeNull()
  })

  it('purges accepted state even if the current authority lookup fails during notification', () => {
    const f = createSourceFixture()
    const lease = f.grant(['read-snapshot'])
    let unavailable = false
    const leases = new ProjectSourceLeases(f.registry, {
      clock: () => 0,
      leaseDurationMs: 100,
      maxOperations: 4,
      trustedLeaseRecords: () => {
        if (unavailable) {
          throw new Error('authority unavailable')
        }
        return [lease]
      }
    })
    const ticket = leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    unavailable = true
    expect(() => leases.revoke('lease')).toThrow('authority unavailable')
    expect(f.registry.resolve(f.producer)).toBeNull()
    expect(leases.validate(ticket)).toBeNull()
  })

  it('invalidates every deferred completion before delivering a snapshot or admission', async () => {
    const f = revocationFixture()
    let complete!: () => void
    const deferred = new Promise<void>((resolve) => {
      complete = resolve
    })
    const deliver = vi.fn()
    const tickets = ['read-snapshot', 'ingest-event', 'read-snapshot'].map((permission) =>
      f.leases.capture(
        f.producer,
        f.principal,
        f.scope,
        permission as 'read-snapshot' | 'ingest-event'
      )!
    )
    const operations = tickets.map(async (ticket) => {
      await deferred
      if (f.leases.validate(ticket)) {
        deliver(ticket)
      }
    })
    f.removeRecords()
    f.leases.revoke('lease')
    expect(f.registry.resolve(f.producer)).toBeNull()
    complete()
    await Promise.all(operations)
    expect(deliver).not.toHaveBeenCalled()
    expect(tickets.map((ticket) => f.leases.validate(ticket))).toEqual([null, null, null])
  })

  it('ignores repeated and unknown notifications without invalidating a replacement', () => {
    const f = revocationFixture()
    const old = f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    f.removeRecords()
    f.leases.revoke('lease')
    const replacement = f.registry.register(f.binding)!
    f.leases.revoke('lease')
    f.leases.revoke('unknown')
    expect(f.registry.resolve(replacement)).not.toBeNull()
    expect(f.leases.validate(old)).toBeNull()
  })

  it.each([false, true])(
    'isolates sources during revocation with association budget exhausted: %s',
    (exhausted) => {
      const bindings = ['one', 'two'].map((id) => ({
        producerId: id,
        sourceId: id,
        eventSourceName: 'fixture',
        sourceKind: 'personal' as const,
        scope: fixtureScope({ projectId: id })
      }))
      const registry = new ProjectSourceRegistry({
        installationId: 'installation',
        sessionId: 'session',
        policyEpoch: 1,
        maxRegistrations: 2,
        catalog: bindings,
        principals: ['person']
      })
      const principal = registry.principal('person')!
      const producers = bindings.map((binding) => registry.register(binding)!)
      let records: TrustedProjectSourceLease[] = producers.map((producer, index) =>
        Object.freeze({
          id: bindings[index].sourceId,
          generation: Symbol('lease'),
          producer,
          principal,
          scope: registry.resolve(producer)!.scope,
          permissions: Object.freeze(['read-snapshot'] as const),
          issuedAt: 0
        })
      )
      const leases = new ProjectSourceLeases(registry, {
        clock: () => 0,
        leaseDurationMs: 100,
        maxOperations: 4,
        trustedLeaseRecords: () => records
      })
      const tickets = producers.map((producer) =>
        leases.capture(producer, principal, registry.resolve(producer)!.scope, 'read-snapshot')!
      )
      if (exhausted) {
        leases.release(tickets[0])
        for (const id of ['one-rotation-1', 'one-rotation-2']) {
          records = [
            Object.freeze({ ...records[0], id, generation: Symbol('rotation') }),
            records[1]
          ]
          const rotation = leases.capture(
            producers[0],
            principal,
            records[0].scope,
            'read-snapshot'
          )!
          expect(rotation).not.toBeNull()
          leases.release(rotation)
        }
        records.push(
          Object.freeze({
            ...records[1],
            id: 'two-ingest',
            generation: Symbol('new permission'),
            permissions: Object.freeze(['ingest-event'] as const)
          })
        )
        expect(leases.capture(producers[1], principal, records[1].scope, 'ingest-event')).toBeNull()
        expect(leases.validate(tickets[1])?.handle).toBe(producers[1])
      }
      records = records.filter((lease) => lease.producer !== producers[0])
      leases.revoke('one')
      expect(registry.resolve(producers[0])).toBeNull()
      expect(leases.validate(tickets[0])).toBeNull()
      expect(leases.validate(tickets[1])?.handle).toBe(producers[1])
    }
  )

  it.each(['policy', 'session'] as const)('invalidates all pending tickets on %s loss', (loss) => {
    const f = revocationFixture()
    const tickets = Array.from({ length: 3 }, () =>
      f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
    )
    if (loss === 'policy') {
      f.registry.setPolicyEpoch(2)
    } else {
      f.registry.invalidateSession()
    }
    f.removeRecords()
    f.leases.revoke('lease')
    expect(tickets.map((ticket) => f.leases.validate(ticket))).toEqual([null, null, null])
    expect(f.registry.resolve(f.producer)).toBeNull()
  })

  it('forgets the old incarnation association on producer replacement', () => {
    const f = revocationFixture()
    const old = f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    f.removeRecords()
    const replacement = f.registry.register(f.binding)!
    f.leases.revoke('lease')
    expect(f.registry.resolve(replacement)).not.toBeNull()
    expect(f.leases.validate(old)).toBeNull()
  })

  it('bounds remembered authorization IDs even after tickets are released', () => {
    const f = revocationFixture(2)
    for (const id of ['first', 'second']) {
      f.replaceLease(id)
      const ticket = f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
      expect(ticket).not.toBeNull()
      f.leases.release(ticket)
    }
    f.replaceLease('third')
    expect(f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')).toBeNull()
    expect(f.registry.resolve(f.producer)).not.toBeNull()
    f.removeRecords()
    f.leases.revoke('first')
    expect(f.registry.resolve(f.producer)).toBeNull()
  })
})
