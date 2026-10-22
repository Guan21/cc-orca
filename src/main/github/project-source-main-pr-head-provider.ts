import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'
import type {
  MainSelectedPrOperationContext,
  TrustedSelectedPrBinding
} from './project-source-grant-registry'
import {
  MainSelectedPrFactDeliveryFence,
  type MainSelectedPrFactPacket
} from './project-source-main-pr-evidence-delivery'
import {
  copyMainSelectedPrAuthority,
  copyMainSelectedPrHead,
  validMainSelectedPrAuthority,
  validMainSelectedPrHead,
  versionedMainSelectedPrHead,
  type MainSelectedPrHeadAuthority,
  type MainSelectedPrHeadEvidence
} from './project-source-main-pr-head-contract'

type ChangeSource = Readonly<{ subscribeChanges(listener: () => void): () => void }>
type Options = Readonly<{
  enabled?: boolean
  isOwnerAuthorized?: () => boolean
  authority?: ChangeSource & Readonly<{ readCurrent(): MainSelectedPrHeadAuthority | null }>
  /** Absent in production; only a separately reviewed Main attestation adapter may implement it. */
  adapter?: ChangeSource &
    Readonly<{
      readEvidence(authority: MainSelectedPrHeadAuthority, signal: AbortSignal): Promise<unknown>
    }>
  nowMs?: () => number
}>
export type MainSelectedPrHeadResult =
  | Readonly<{ status: 'verified'; evidence: MainSelectedPrHeadEvidence }>
  | Readonly<{ status: 'unavailable' | 'denied' | 'stale' | 'incomplete' }>

type Receipt = Readonly<{
  context: MainSelectedPrOperationContext
  binding: TrustedSelectedPrBinding
  authority: MainSelectedPrHeadAuthority
  signal: AbortSignal
  epoch: number
}>
const CANCELLED = Symbol('cancelled')
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Offline contract only. No production adapter, grant issuer, transport or IPC is installed. */
export class MainTrustedSelectedPrHeadProvider {
  private readonly options: Options
  private readonly unsubscribe: (() => void)[] = []
  private receipts = new WeakMap<MainSelectedPrHeadEvidence, Receipt>()
  private epoch = 0
  private available = false
  private disposed = false
  private busy = false
  private pending: AbortController | null = null

  constructor(options: Options = {}) {
    const authority = options.authority
    const adapter = options.adapter
    this.options = Object.freeze({
      ...options,
      authority:
        authority &&
        Object.freeze({
          readCurrent: authority.readCurrent.bind(authority),
          subscribeChanges: authority.subscribeChanges.bind(authority)
        }),
      adapter:
        adapter &&
        Object.freeze({
          readEvidence: adapter.readEvidence.bind(adapter),
          subscribeChanges: adapter.subscribeChanges.bind(adapter)
        })
    })
    if (options.enabled !== true || !this.options.authority || !this.options.adapter) {
      return
    }
    try {
      const epoch = this.epoch
      this.subscribe(this.options.authority)
      this.subscribe(this.options.adapter)
      if (this.epoch !== epoch) {
        throw new Error('HEAD_UNAVAILABLE')
      }
      this.available = true
    } catch {
      this.dispose()
    }
  }

  private subscribe(source: ChangeSource): void {
    let installing = true
    let interrupted = false
    const unsubscribe = source.subscribeChanges(() => {
      if (installing) {
        interrupted = true
      }
      this.invalidate()
    })
    installing = false
    if (typeof unsubscribe !== 'function') {
      throw new Error('HEAD_UNAVAILABLE')
    }
    this.unsubscribe.push(unsubscribe)
    if (interrupted) {
      throw new Error('HEAD_UNAVAILABLE')
    }
  }

  invalidate(): void {
    this.epoch += 1
    if (!Number.isSafeInteger(this.epoch)) {
      this.disposed = true
    }
    this.receipts = new WeakMap()
    this.pending?.abort()
  }

  dispose(): void {
    this.disposed = true
    this.available = false
    this.invalidate()
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      try {
        unsubscribe()
      } catch {
        // Failed cleanup cannot retain another authority subscription.
      }
    }
  }

  private local(epoch: number, signal: AbortSignal): boolean {
    return this.available && !this.disposed && this.epoch === epoch && !signal.aborted
  }

  private current(receipt: Receipt, evidence?: MainSelectedPrHeadEvidence): boolean {
    const { context, authority, signal, epoch } = receipt
    if (!this.local(epoch, signal) || this.options.isOwnerAuthorized?.() !== true) {
      return false
    }
    if (!this.local(epoch, signal) || !context.isCurrent() || !this.local(epoch, signal)) {
      return false
    }
    const latest = this.options.authority?.readCurrent()
    const now = (this.options.nowMs ?? Date.now)()
    return (
      Number.isFinite(now) &&
      Number.isFinite(context.expiresAtMs) &&
      now < context.expiresAtMs &&
      (!evidence || validMainSelectedPrHead(evidence, now)) &&
      same(
        copyMainSelectedPrAuthority({
          ...authority,
          document: context.document,
          binding: receipt.binding,
          bindingRevision: context.bindingRevision,
          grantRevision: context.grantRevision,
          sessionIncarnation: context.sessionIncarnation
        }),
        authority
      ) &&
      validMainSelectedPrAuthority(latest) &&
      same(copyMainSelectedPrAuthority(latest), authority) &&
      this.local(epoch, signal)
    )
  }

  async acquire(
    context: MainSelectedPrOperationContext,
    signal: AbortSignal,
    binding: TrustedSelectedPrBinding
  ): Promise<MainSelectedPrHeadResult> {
    if (this.busy || this.options.enabled !== true) {
      return { status: 'denied' }
    }
    const adapter = this.options.adapter
    if (!this.available || this.disposed || !adapter) {
      return { status: 'unavailable' }
    }
    this.busy = true
    this.invalidate()
    const epoch = this.epoch
    const pending = new AbortController()
    this.pending = pending
    const abort = (): void => this.invalidate()
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelRead: (() => void) | undefined
    try {
      signal.addEventListener('abort', abort, { once: true })
      if (
        signal.aborted ||
        this.options.isOwnerAuthorized?.() !== true ||
        !this.local(epoch, signal)
      ) {
        return { status: 'denied' }
      }
      const rawAuthority = this.options.authority?.readCurrent()
      if (!validMainSelectedPrAuthority(rawAuthority)) {
        return { status: 'denied' }
      }
      const receipt: Receipt = Object.freeze({
        context,
        binding: structuredClone(binding),
        authority: copyMainSelectedPrAuthority(rawAuthority),
        signal,
        epoch
      })
      if (!this.current(receipt)) {
        return { status: 'denied' }
      }
      const cancelled = new Promise<typeof CANCELLED>((resolve) => {
        cancelRead = () => resolve(CANCELLED)
        pending.signal.addEventListener('abort', cancelRead, { once: true })
      })
      timer = setTimeout(abort, 15_000)
      const raw = await Promise.race([
        adapter.readEvidence(receipt.authority, pending.signal),
        cancelled
      ])
      if (raw === CANCELLED || !this.current(receipt)) {
        return { status: 'stale' }
      }
      if (!versionedMainSelectedPrHead(raw)) {
        return { status: 'incomplete' }
      }
      const evidence = copyMainSelectedPrHead(raw)
      if (
        !same(copyMainSelectedPrAuthority(evidence), receipt.authority) ||
        !validMainSelectedPrHead(evidence, (this.options.nowMs ?? Date.now)()) ||
        !this.current(receipt, evidence)
      ) {
        return { status: 'stale' }
      }
      this.receipts.set(evidence, receipt)
      return Object.freeze({ status: 'verified', evidence })
    } catch {
      return { status: 'unavailable' }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (cancelRead) {
        pending.signal.removeEventListener('abort', cancelRead)
      }
      this.pending = null
      this.busy = false
    }
  }

  handoff(
    evidence: MainSelectedPrHeadEvidence,
    projection: Extract<SelectedGitHubPrProjection, { status: 'ready' }>,
    send: (packet: MainSelectedPrFactPacket) => void
  ): boolean {
    const receipt = this.receipts.get(evidence)
    if (this.busy || !receipt) {
      return false
    }
    this.receipts.delete(evidence)
    this.busy = true
    try {
      const current = (): boolean => this.current(receipt, evidence)
      const fence = new MainSelectedPrFactDeliveryFence({
        readCurrent: () => (current() ? evidence : null),
        isAuthorizedNow: current,
        isEnabled: () => this.local(receipt.epoch, receipt.signal),
        nowMs: this.options.nowMs ?? Date.now,
        send: (packet) => {
          if (!current() || !this.local(receipt.epoch, receipt.signal)) {
            throw new Error('HEAD_REVOKED')
          }
          send(packet)
        }
      })
      return fence.deliver(projection)
    } finally {
      this.busy = false
    }
  }
}
