import { Buffer } from 'node:buffer'
import type { DevelopmentEvent } from '../../shared/development-event-types'
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
}

/** Unwired Main infrastructure; no EventBus, graph callbacks or renderer entrypoint. */
export class ProjectSourceAdmission {
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
      this.#states.delete(handle)
      for (const [pending, batch] of this.#pending) {
        if (batch.handle === handle) {
          this.#pending.delete(pending)
        }
      }
    })
  }

  prepare(ticket: OperationTicket, encodedBatch: unknown): PendingSourceBatch | null {
    if (this.#disposed) {
      return null
    }
    const registration = this.#leases.validate(ticket, 'ingest-event')
    if (
      !registration ||
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
    if (this.#states.get(batch.handle) !== batch.base) {
      return false
    }
    this.#states.set(batch.handle, batch.next)
    return true
  }

  cancel(pending: PendingSourceBatch): void {
    this.#pending.delete(pending)
  }

  readSnapshot(ticket: OperationTicket): readonly DevelopmentEvent[] | null {
    if (this.#disposed) {
      return null
    }
    const registration = this.#leases.validate(ticket, 'read-snapshot')
    if (
      !registration ||
      this.#registry.resolve(registration.handle, registration.scope) !== registration
    ) {
      return null
    }
    const events =
      this.#states.get(registration.handle)?.observations.map((observation) => observation.event) ??
      []
    const snapshot = structuredClone(events)
    return this.#leases.validate(ticket, 'read-snapshot') ? snapshot : null
  }

  dispose(): void {
    this.#disposed = true
    this.#unsubscribe()
    this.#pending.clear()
    this.#states.clear()
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
