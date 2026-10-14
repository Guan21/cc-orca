import { randomUUID } from 'node:crypto'
import {
  decideProjectSourceAccess,
  type ProjectSourceScope
} from '../../shared/project-source/project-source-access'

export type ProducerHandle = symbol
export type PrincipalHandle = symbol

export type TrustedSourceBinding = {
  readonly producerId: string
  readonly sourceId: string
  readonly eventSourceName: string
  readonly sourceKind: 'personal' | 'corporate'
  readonly scope: ProjectSourceScope
}

export type RegisteredProjectSource = TrustedSourceBinding & { readonly handle: ProducerHandle }

type RegistryOptions = {
  readonly installationId: string
  readonly sessionId: string
  readonly policyEpoch: number
  readonly maxRegistrations: number
  readonly catalog: readonly TrustedSourceBinding[]
  readonly principals: readonly string[]
}

function matches(binding: TrustedSourceBinding, scope: ProjectSourceScope): boolean {
  return decideProjectSourceAccess(
    { ...binding, principalId: 'main', scope, permission: 'ingest-event' },
    [{ ...binding, principalId: 'main', permissions: ['ingest-event'] }]
  ).allowed
}

/** Infrastructure only: the injected catalog must come from independently verified Main records. */
export class ProjectSourceRegistry {
  private readonly catalog: readonly TrustedSourceBinding[]
  private readonly records = new Map<ProducerHandle, RegisteredProjectSource>()
  private readonly principals = new Map<PrincipalHandle, string>()
  private readonly listeners = new Set<(handle: ProducerHandle) => void>()
  private policyEpoch: number
  private active = true
  private registrationRevision = 0

  constructor(private readonly options: RegistryOptions) {
    if (!Number.isSafeInteger(options.maxRegistrations) || options.maxRegistrations <= 0) {
      throw new Error('Invalid source registration budget')
    }
    if (
      !options.installationId?.trim() ||
      options.installationId !== options.installationId.trim() ||
      !options.sessionId?.trim() ||
      options.sessionId !== options.sessionId.trim() ||
      ['*', 'all'].includes(options.installationId) ||
      ['*', 'all'].includes(options.sessionId) ||
      !Number.isSafeInteger(options.policyEpoch) ||
      options.policyEpoch <= 0
    ) {
      throw new Error('Invalid Main authorization namespace')
    }
    if (
      new Set(options.catalog.map((binding) => binding.sourceId)).size !== options.catalog.length
    ) {
      throw new Error('Ambiguous source catalog')
    }
    this.options = Object.freeze({ ...options })
    this.policyEpoch = options.policyEpoch
    this.catalog = Object.freeze(
      options.catalog.map((binding) =>
        Object.freeze({
          ...binding,
          scope: Object.freeze({ ...binding.scope })
        })
      )
    )
    for (const id of options.principals) {
      if (typeof id === 'string' && id.trim() === id && id && id !== '*' && id !== 'all') {
        this.principals.set(Symbol('Main principal'), id)
      }
    }
  }

  register(binding: TrustedSourceBinding): ProducerHandle | null {
    if (!this.active || !binding || binding.sourceKind !== 'personal') {
      return null
    }
    const trusted = this.catalog.find(
      (entry) =>
        entry.sourceKind === 'personal' &&
        entry.producerId === binding.producerId &&
        entry.sourceId === binding.sourceId &&
        entry.eventSourceName === binding.eventSourceName &&
        matches(entry, binding.scope)
    )
    if (
      !trusted ||
      trusted.scope.executionRealm !== 'native' ||
      trusted.scope.executionHostId !== 'local' ||
      trusted.scope.installationId !== this.options.installationId ||
      trusted.scope.sessionId !== this.options.sessionId ||
      trusted.scope.policyEpoch !== this.policyEpoch
    ) {
      return null
    }
    const previous = [...this.records.values()].find(
      (record) => record.sourceId === trusted.sourceId
    )
    if (!previous && this.records.size >= this.options.maxRegistrations) {
      return null
    }
    if (previous) {
      this.invalidate(previous.handle)
    }
    const handle = Symbol('Main producer')
    this.registrationRevision += 1
    this.records.set(
      handle,
      Object.freeze({
        ...trusted,
        handle,
        scope: Object.freeze({
          ...trusted.scope,
          producerIncarnation: randomUUID(),
          registrationRevision: this.registrationRevision
        })
      })
    )
    return handle
  }

  resolve(handle: ProducerHandle, scope?: ProjectSourceScope): RegisteredProjectSource | null {
    const record = this.records.get(handle)
    if (!this.active || !record || record.scope.policyEpoch !== this.policyEpoch) {
      return null
    }
    return scope === undefined || matches(record, scope) ? record : null
  }

  principal(id: string): PrincipalHandle | null {
    if (!this.active) {
      return null
    }
    return [...this.principals].find(([, principalId]) => principalId === id)?.[0] ?? null
  }

  resolvePrincipal(handle: PrincipalHandle): string | null {
    return this.active ? (this.principals.get(handle) ?? null) : null
  }

  onInvalidation(listener: (handle: ProducerHandle) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  invalidate(handle: ProducerHandle): void {
    if (!this.records.delete(handle)) {
      return
    }
    // Notify every cache owner even when another subscriber fails.
    for (const listener of this.listeners) {
      try {
        listener(handle)
      } catch {
        /* Invalidated records remain inaccessible. */
      }
    }
  }

  setPolicyEpoch(epoch: number): void {
    if (!Number.isSafeInteger(epoch) || epoch <= this.policyEpoch) {
      throw new Error('Policy epoch must advance')
    }
    this.policyEpoch = epoch
    for (const handle of this.records.keys()) {
      this.invalidate(handle)
    }
  }

  invalidateSession(): void {
    this.active = false
    for (const handle of this.records.keys()) {
      this.invalidate(handle)
    }
    this.principals.clear()
  }
}
