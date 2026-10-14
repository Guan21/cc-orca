import { describe, expect, it, vi } from 'vitest'
import { createSourceFixture } from './project-source-test-fixtures'
import { ProjectSourceLeases } from './project-source-leases'

describe('Main source leases', () => {
  it('denies no grant, forged producer and forged principal', () => {
    const f = createSourceFixture()
    expect(f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')).toBeNull()
    f.grant(['ingest-event'])
    expect(f.leases.capture(Symbol(), f.principal, f.scope, 'ingest-event')).toBeNull()
    expect(f.leases.capture(f.producer, Symbol(), f.scope, 'ingest-event')).toBeNull()
  })

  it.each(['ingest-event', 'read-snapshot'] as const)(
    'requires a separate %s permission',
    (permission) => {
      const f = createSourceFixture()
      f.grant([permission])
      const ticket = f.leases.capture(f.producer, f.principal, f.scope, permission)
      expect(ticket).not.toBeNull()
      expect(f.leases.validate(ticket!, permission)).not.toBeNull()
      const opposite = permission === 'ingest-event' ? 'read-snapshot' : 'ingest-event'
      expect(f.leases.capture(f.producer, f.principal, f.scope, opposite)).toBeNull()
      expect(f.leases.validate(ticket!, opposite)).toBeNull()
      expect(f.leases.validate(Symbol())).toBeNull()
    }
  )

  it.each(['expiry', 'revoke', 'replacement', 'policy', 'session', 'restart'] as const)(
    'rejects in-flight completion after %s without delivery',
    async (change) => {
      const f = createSourceFixture()
      f.grant(['read-snapshot'])
      const ticket = f.leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
      const deliver = vi.fn()
      const completion = Promise.resolve().then(() => {
        if (f.leases.validate(ticket, 'read-snapshot')) {
          deliver('snapshot')
        }
      })
      if (change === 'expiry') {
        f.setTime(100)
      }
      if (change === 'revoke') {
        f.leases.revoke('lease')
      }
      if (change === 'replacement') {
        f.grant(['read-snapshot'])
      }
      if (change === 'policy') {
        f.registry.setPolicyEpoch(2)
      }
      if (change === 'session') {
        f.registry.invalidateSession()
      }
      if (change === 'restart') {
        f.registry.register(f.binding)
      }
      await completion
      expect(deliver).not.toHaveBeenCalled()
    }
  )

  it('revoke and reissue the same scope does not revive an old request', () => {
    const f = createSourceFixture()
    f.grant(['ingest-event'])
    const old = f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
    f.leases.revoke('lease')
    f.restart()
    f.grant(['ingest-event'])
    expect(f.leases.validate(old)).toBeNull()
    expect(f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')).not.toBeNull()
  })

  it('fails closed when the monotonic clock becomes invalid or reverses', () => {
    const f = createSourceFixture()
    f.grant(['ingest-event'])
    const ticket = f.leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
    f.setTime(-1)
    expect(f.leases.validate(ticket)).toBeNull()
    f.setTime(Number.NaN)
    expect(f.leases.validate(ticket)).toBeNull()
  })

  it('bounds captured operations and releases completed tickets', () => {
    const f = createSourceFixture()
    const lease = f.grant(['ingest-event'])
    const leases = new ProjectSourceLeases(f.registry, {
      clock: () => 0,
      leaseDurationMs: 100,
      maxOperations: 4,
      trustedLeaseRecords: () => [lease]
    })
    const tickets = Array.from({ length: 4 }, () =>
      leases.capture(f.producer, f.principal, f.scope, 'ingest-event')!
    )
    expect(tickets.every(Boolean)).toBe(true)
    expect(leases.capture(f.producer, f.principal, f.scope, 'ingest-event')).toBeNull()
    leases.release(tickets[0])
    expect(leases.validate(tickets[0])).toBeNull()
    expect(leases.capture(f.producer, f.principal, f.scope, 'ingest-event')).not.toBeNull()
  })

  it('lease withdrawal purges the registration and invalidates in-flight operations', () => {
    const f = createSourceFixture()
    const lease = f.grant(['read-snapshot'])
    let withdrawn = false
    const leases = new ProjectSourceLeases(f.registry, {
      clock: () => 0,
      leaseDurationMs: 100,
      maxOperations: 4,
      trustedLeaseRecords: () => (withdrawn ? [] : [lease])
    })
    const ticket = leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    const purge = vi.fn()
    f.registry.onInvalidation(purge)
    withdrawn = true
    expect(leases.validate(ticket)).toBeNull()
    expect(f.registry.resolve(f.producer)).toBeNull()
    expect(purge).toHaveBeenCalledWith(f.producer)
  })

  it('a throwing clock denies and purges instead of completing an operation', () => {
    const f = createSourceFixture()
    const lease = f.grant(['read-snapshot'])
    let failed = false
    const leases = new ProjectSourceLeases(f.registry, {
      clock: () => {
        if (failed) {
          throw new Error('clock')
        }
        return 0
      },
      leaseDurationMs: 100,
      maxOperations: 4,
      trustedLeaseRecords: () => [lease]
    })
    const ticket = leases.capture(f.producer, f.principal, f.scope, 'read-snapshot')!
    const purge = vi.fn()
    f.registry.onInvalidation(purge)
    failed = true
    expect(leases.validate(ticket)).toBeNull()
    expect(purge).toHaveBeenCalledWith(f.producer)
  })
})
