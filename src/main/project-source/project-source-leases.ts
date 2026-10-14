import {
  decideProjectSourceAccess,
  type ProjectSourcePermission,
  type ProjectSourceScope
} from '../../shared/project-source/project-source-access'
import type {
  ProjectSourceRegistry,
  PrincipalHandle,
  ProducerHandle,
  RegisteredProjectSource
} from './project-source-registry'

export type OperationTicket = symbol

/** A verified Main lease record; no issuer or runtime composition is provided in B2. */
export type TrustedProjectSourceLease = {
  readonly id: string
  readonly generation: symbol
  readonly producer: ProducerHandle
  readonly principal: PrincipalHandle
  readonly scope: ProjectSourceScope
  readonly permissions: readonly ProjectSourcePermission[]
  readonly issuedAt: number
}

type LeaseOptions = {
  readonly clock: () => number
  readonly leaseDurationMs: number
  readonly maxOperations: number
  readonly trustedLeaseRecords: () => readonly TrustedProjectSourceLease[]
}

type CapturedOperation = {
  readonly lease: TrustedProjectSourceLease
  readonly registration: RegisteredProjectSource
  readonly permission: ProjectSourcePermission
}

export class ProjectSourceLeases {
  private readonly tickets = new Map<OperationTicket, CapturedOperation>()
  private lastTime = 0
  private clockFailed = false

  constructor(
    private readonly registry: ProjectSourceRegistry,
    private readonly options: LeaseOptions
  ) {
    if (!Number.isFinite(options.leaseDurationMs) || options.leaseDurationMs <= 0) {
      throw new Error('An explicit positive lease duration is required')
    }
    if (!Number.isSafeInteger(options.maxOperations) || options.maxOperations <= 0) {
      throw new Error('An explicit positive operation budget is required')
    }
    this.options = Object.freeze({ ...options })
    registry.onInvalidation((handle) => {
      for (const [ticket, operation] of this.tickets) {
        if (operation.registration.handle === handle) {
          this.tickets.delete(ticket)
        }
      }
    })
  }

  private now(): number | null {
    let time: number
    try {
      time = this.options.clock()
    } catch {
      time = Number.NaN
    }
    if (this.clockFailed || !Number.isFinite(time) || time < this.lastTime) {
      this.clockFailed = true
      for (const operation of this.tickets.values()) {
        this.registry.invalidate(operation.registration.handle)
      }
      return null
    }
    this.lastTime = time
    return time
  }

  private authorized(
    lease: TrustedProjectSourceLease,
    registration: RegisteredProjectSource,
    principal: PrincipalHandle,
    scope: ProjectSourceScope,
    permission: ProjectSourcePermission
  ): boolean {
    const now = this.now()
    if (now === null) {
      this.registry.invalidate(registration.handle)
    }
    const principalId = this.registry.resolvePrincipal(principal)
    if (
      now === null ||
      !principalId ||
      typeof lease.generation !== 'symbol' ||
      lease.producer !== registration.handle ||
      lease.principal !== principal ||
      !Object.isFrozen(lease) ||
      !Object.isFrozen(lease.scope) ||
      !Object.isFrozen(lease.permissions) ||
      !Number.isFinite(lease.issuedAt) ||
      lease.issuedAt < 0 ||
      lease.issuedAt > now
    ) {
      return false
    }
    if (now - lease.issuedAt >= this.options.leaseDurationMs) {
      this.registry.invalidate(registration.handle)
      return false
    }
    return decideProjectSourceAccess({ ...registration, principalId, scope, permission }, [
      { ...registration, principalId, scope: lease.scope, permissions: lease.permissions }
    ]).allowed
  }

  capture(
    producer: ProducerHandle,
    principal: PrincipalHandle,
    scope: ProjectSourceScope,
    permission: ProjectSourcePermission
  ): OperationTicket | null {
    const registration = this.registry.resolve(producer, scope)
    if (
      !registration ||
      !this.registry.resolvePrincipal(principal) ||
      this.tickets.size >= this.options.maxOperations
    ) {
      return null
    }
    const lease = this.options
      .trustedLeaseRecords()
      .find((candidate) => this.authorized(candidate, registration, principal, scope, permission))
    if (!lease || !this.registry.resolve(producer, scope)) {
      return null
    }
    const ticket = Symbol('Main operation')
    this.tickets.set(ticket, Object.freeze({ lease, registration, permission }))
    return ticket
  }

  validate(
    ticket: OperationTicket,
    requiredPermission?: ProjectSourcePermission
  ): RegisteredProjectSource | null {
    const operation = this.tickets.get(ticket)
    if (
      !operation ||
      (requiredPermission !== undefined && operation.permission !== requiredPermission)
    ) {
      return null
    }
    const { lease, registration, permission } = operation
    if (!this.options.trustedLeaseRecords().includes(lease)) {
      this.registry.invalidate(registration.handle)
      return null
    }
    if (
      this.registry.resolve(registration.handle, registration.scope) !== registration ||
      !this.authorized(lease, registration, lease.principal, registration.scope, permission)
    ) {
      return null
    }
    return this.registry.resolve(registration.handle, registration.scope) === registration
      ? registration
      : null
  }

  revoke(leaseId: string): void {
    for (const lease of this.options.trustedLeaseRecords()) {
      if (lease.id !== leaseId) {
        continue
      }
      this.registry.invalidate(lease.producer)
    }
  }

  release(ticket: OperationTicket): void {
    this.tickets.delete(ticket)
  }
}
