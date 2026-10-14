import { Buffer } from 'node:buffer'
import {
  ProjectSourceAvailability,
  type ProjectSourceSnapshot,
  type SourceCondition,
  type SourceLifecycle
} from './project-source-availability'
import {
  assertSourceLimits,
  assertPositiveSourceBudgets,
  parseBoundedSourceBatch,
  type SourceBatchLimits,
  type SourceObservation
} from './project-source-batch'
import type { OperationTicket, ProjectSourceLeases } from './project-source-leases'
import type {
  ProducerHandle,
  ProjectSourceRegistry,
  RegisteredProjectSource
} from './project-source-registry'

export type SourceAdmissionLimits = {
  readonly maxQueuedEvents: number
  readonly maxPendingBatches: number
  readonly maxRetainedEvents: number
  readonly maxRetainedBytes: number
} & SourceBatchLimits

declare const pendingBrand: unique symbol
export type PendingSourceBatch = symbol & { readonly [pendingBrand]: true }

type RetainedSourceState = {
  readonly observations: readonly SourceObservation[]
  readonly signatures: ReadonlyMap<string, string>
  readonly sequence: number
  readonly bytes: number
}

type PendingBatch = {
  readonly ticket: OperationTicket
  readonly handle: ProducerHandle
  readonly base: RetainedSourceState | undefined
  readonly next: RetainedSourceState
  readonly count: number
  readonly lifecycle: SourceLifecycle
}

/** Unwired Main infrastructure; no EventBus, graph callbacks or renderer entrypoint. */
export class ProjectSourceAdmission {
  readonly #availability = new ProjectSourceAvailability()
  readonly #states = new Map<ProducerHandle, RetainedSourceState>()
  readonly #pending = new Map<PendingSourceBatch, PendingBatch>()
  readonly #leases: ProjectSourceLeases
  readonly #registry: ProjectSourceRegistry
  readonly #limits: SourceAdmissionLimits
  readonly #unsubscribe: () => void
  #disposed = false

  constructor(
    registry: ProjectSourceRegistry,
    leases: ProjectSourceLeases,
    limits: SourceAdmissionLimits
  ) {
    assertSourceLimits(limits)
    assertPositiveSourceBudgets(
      limits.maxQueuedEvents,
      limits.maxPendingBatches,
      limits.maxRetainedEvents,
      limits.maxRetainedBytes
    )
    this.#registry = registry
    this.#leases = leases
    this.#limits = Object.freeze({ ...limits })
    this.#unsubscribe = registry.onInvalidation((handle) => {
      this.#purge(handle)
      this.#availability.delete(handle)
    })
  }

  // Only a future reviewed Main composition root may assert actual attachment.
  attachSource(ticket: OperationTicket): boolean {
    return this.setSourceCondition(ticket, 'loading')
  }

  setSourceCondition(ticket: OperationTicket, condition: SourceCondition): boolean {
    const registration = this.#leases.validate(ticket, 'ingest-event')
    if (
      this.#disposed ||
      !registration ||
      this.#registry.resolve(registration.handle, registration.scope) !== registration ||
      !['loading', 'error', 'stale', 'disconnected'].includes(condition)
    ) {
      return false
    }
    this.#purge(registration.handle)
    this.#availability.set(registration.handle, condition)
    return true
  }

  #purge(handle: ProducerHandle): void {
    this.#states.delete(handle)
    for (const [pending, batch] of this.#pending) {
      if (batch.handle === handle) {
        this.#pending.delete(pending)
      }
    }
  }

  prepare(ticket: OperationTicket, encodedBatch: unknown): PendingSourceBatch | null {
    if (this.#disposed) {
      return null
    }
    const registration = this.#leases.validate(ticket, 'ingest-event')
    const lifecycle = registration && this.#availability.get(registration.handle)
    if (
      !registration ||
      !lifecycle ||
      !['loading', 'observed'].includes(lifecycle.status) ||
      this.#registry.resolve(registration.handle, registration.scope) !== registration ||
      this.#pending.size >= this.#limits.maxPendingBatches
    ) {
      return null
    }
    const observations = parseBoundedSourceBatch(encodedBatch, this.#limits)
    if (!observations) {
      return null
    }
    let queued = 0
    for (const batch of this.#pending.values()) {
      if (batch.handle === registration.handle) {
        queued += batch.count
      }
    }
    if (queued + observations.length > this.#limits.maxQueuedEvents) {
      return null
    }
    const base = this.#states.get(registration.handle)
    const next = this.#stage(registration, base, observations)
    if (!next || !this.#leases.validate(ticket, 'ingest-event')) {
      return null
    }
    const pending = Symbol('pending-source-batch') as PendingSourceBatch
    this.#pending.set(pending, {
      ticket,
      handle: registration.handle,
      base,
      next,
      lifecycle,
      count: observations.length
    })
    return pending
  }

  commit(pending: PendingSourceBatch): boolean {
    const batch = this.#pending.get(pending)
    if (!batch) {
      return false
    }
    this.#pending.delete(pending)
    if (!this.#leases.validate(batch.ticket, 'ingest-event')) {
      return false
    }
    if (
      this.#states.get(batch.handle) !== batch.base ||
      this.#availability.get(batch.handle) !== batch.lifecycle
    ) {
      return false
    }
    this.#states.set(batch.handle, batch.next)
    this.#availability.set(batch.handle, 'observed')
    return true
  }

  cancel(pending: PendingSourceBatch): void {
    this.#pending.delete(pending)
  }

  readSnapshot(ticket: OperationTicket): ProjectSourceSnapshot {
    if (this.#disposed) {
      return { status: 'unavailable' }
    }
    const registration = this.#leases.validate(ticket, 'read-snapshot')
    if (
      !registration ||
      this.#registry.resolve(registration.handle, registration.scope) !== registration
    ) {
      return { status: 'unavailable' }
    }
    const lifecycle = this.#availability.get(registration.handle)
    if (!lifecycle) {
      return { status: 'unavailable' }
    }
    const state = this.#states.get(registration.handle)
    let snapshot: ProjectSourceSnapshot
    if (lifecycle.status !== 'observed') {
      snapshot = { status: lifecycle.status, scope: registration.scope }
    } else if (!state) {
      return { status: 'unavailable' }
    } else {
      const events = structuredClone(state.observations.map((observation) => observation.event))
      snapshot =
        events.length === 0
          ? { status: 'empty', scope: registration.scope, events: [] }
          : { status: 'ready', scope: registration.scope, events }
    }
    return this.#leases.validate(ticket, 'read-snapshot') === registration &&
      this.#availability.get(registration.handle) === lifecycle &&
      this.#states.get(registration.handle) === state
      ? snapshot
      : { status: 'unavailable' }
  }

  async readSnapshotAsync(ticket: OperationTicket): Promise<ProjectSourceSnapshot> {
    const registration = this.#leases.validate(ticket, 'read-snapshot')
    const lifecycle = registration && this.#availability.get(registration.handle)
    const snapshot = this.readSnapshot(ticket)
    await Promise.resolve()
    return !this.#disposed &&
      registration &&
      this.#leases.validate(ticket, 'read-snapshot') === registration &&
      this.#availability.get(registration.handle) === lifecycle
      ? snapshot
      : { status: 'unavailable' }
  }

  dispose(): void {
    this.#disposed = true
    this.#unsubscribe()
    this.#pending.clear()
    this.#states.clear()
    this.#availability.clear()
  }

  #stage(
    registration: RegisteredProjectSource,
    base: RetainedSourceState | undefined,
    batch: readonly SourceObservation[]
  ): RetainedSourceState | null {
    const observations = [...(base?.observations ?? [])]
    const signatures = new Map(base?.signatures)
    let sequence = base?.sequence ?? 0
    let bytes = base?.bytes ?? 0
    for (const observation of batch) {
      const event = observation.event
      if (
        observation.incarnation !== registration.scope.producerIncarnation ||
        event.projectId !== registration.scope.projectId ||
        event.source !== registration.eventSourceName
      ) {
        return null
      }
      const signature = JSON.stringify(observation)
      const prior = signatures.get(event.eventId)
      if (prior !== undefined) {
        if (prior !== signature) {
          return null
        }
        continue
      }
      if (observation.sequence !== sequence + 1) {
        return null
      }
      sequence = observation.sequence
      bytes += Buffer.byteLength(signature, 'utf8')
      if (
        observations.length >= this.#limits.maxRetainedEvents ||
        bytes > this.#limits.maxRetainedBytes
      ) {
        return null
      }
      signatures.set(event.eventId, signature)
      observations.push(observation)
    }
    return { observations, signatures, sequence, bytes }
  }
}
