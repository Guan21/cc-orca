import type { IpcMainInvokeEvent } from 'electron'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'

import type {
  MainSelectedPrOperationContext,
  TrustedSelectedPrBinding
} from './project-source-grant-registry'
import {
  copyMainSelectedPrAuthority,
  validMainSelectedPrAuthority,
  type MainSelectedPrHeadAuthority
} from './project-source-main-pr-head-contract'

import type { MainSelectedPrFactPacket } from './project-source-main-pr-evidence-delivery'

import {
  SOURCE_LIFECYCLE_DOMAINS,
  SOURCE_READINESS_GATES as READINESS_GATES,
  type MainSelectedPrCompositionOptions as Options,
  type MainSelectedPrCompositionResult
} from './project-source-composition-contract'
export { SOURCE_LIFECYCLE_DOMAINS } from './project-source-composition-contract'
export type { MainSelectedPrCompositionResult } from './project-source-composition-contract'
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Inert Task C composition: reuses an existing grant and Task B's one-use HEAD receipt. */
export class MainSelectedPrSourceComposition {
  private readonly options: Options
  private readonly unsubscribe: (() => void)[] = []
  private epoch = 0
  private available = false
  private disposed = false
  private busy = true
  private invalidating = false
  private pending: AbortController | null = null

  constructor(options: Options = {}) {
    this.options = Object.freeze({
      ...options,
      authority:
        options.authority &&
        Object.freeze({
          run: options.authority.run.bind(options.authority),
          attest: options.authority.attest.bind(options.authority),
          retireAll: options.authority.retireAll.bind(options.authority)
        }),
      readiness: Object.freeze({ ...options.readiness }),
      lifecycle: Object.freeze({ ...options.lifecycle })
    })
    try {
      if (options.enabled !== true) {
        return
      }
      if (
        !options.authority ||
        !options.provider ||
        !options.readCurrent ||
        !options.readProjection ||
        READINESS_GATES.some((key) => typeof this.options.readiness?.[key] !== 'function') ||
        SOURCE_LIFECYCLE_DOMAINS.some((key) => typeof this.options.lifecycle?.[key] !== 'function')
      ) {
        return
      }
      const epoch = this.epoch
      for (const domain of SOURCE_LIFECYCLE_DOMAINS) {
        const unsubscribe = this.options.lifecycle![domain]!(() => this.invalidate())
        if (typeof unsubscribe !== 'function') {
          throw new Error('SOURCE_UNAVAILABLE')
        }
        this.unsubscribe.push(unsubscribe)
        if (this.epoch !== epoch) {
          throw new Error('SOURCE_UNAVAILABLE')
        }
      }
      this.available = true
    } catch {
      this.dispose()
    } finally {
      this.busy = false
    }
  }

  /** Call synchronously before the lifecycle source publishes its replacement state. */
  invalidate(): void {
    if (this.options.enabled !== true) {
      return
    }
    this.epoch += 1
    if (!Number.isSafeInteger(this.epoch)) {
      this.available = false
      this.disposed = true
    }
    if (this.invalidating) {
      return
    }
    this.invalidating = true
    try {
      this.pending?.abort()
      try {
        this.options.provider?.invalidate()
      } finally {
        this.options.authority?.retireAll()
      }
    } catch {
      this.available = false
      this.disposed = true
    } finally {
      this.invalidating = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.available = false
    // Disabled construction/disposal must not invoke injected callbacks.
    if (this.options.enabled === true) {
      this.invalidate()
    }
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      try {
        unsubscribe()
      } catch {
        /* Continue retiring every independent subscription. */
      }
    }
  }

  private local(epoch: number, signal: AbortSignal): boolean {
    return this.available && !this.invalidating && this.epoch === epoch && !signal.aborted
  }

  private ready(epoch: number, signal: AbortSignal): boolean {
    return (
      READINESS_GATES.every(
        (gate) => this.local(epoch, signal) && this.options.readiness?.[gate]?.() === true
      ) && this.local(epoch, signal)
    )
  }

  /** Offline dependency preflight only; never attestation or existing-grant authorization. */
  readiness(): Readonly<{
    status: 'disabled' | 'unavailable' | 'busy' | 'denied' | 'offline_ready' | 'disposed'
  }> {
    if (this.disposed) {
      return { status: 'disposed' }
    }
    if (this.options.enabled !== true) {
      return { status: 'disabled' }
    }
    if (this.busy || this.invalidating) {
      return { status: 'busy' }
    }
    if (!this.available) {
      return { status: 'unavailable' }
    }
    this.busy = true
    try {
      return {
        status: this.ready(this.epoch, new AbortController().signal) ? 'offline_ready' : 'denied'
      }
    } catch {
      return { status: 'unavailable' }
    } finally {
      this.busy = false
    }
  }

  private current(
    event: IpcMainInvokeEvent,
    captured: MainSelectedPrHeadAuthority,
    binding: TrustedSelectedPrBinding,
    context: MainSelectedPrOperationContext,
    epoch: number,
    signal: AbortSignal
  ): boolean {
    if (!this.ready(epoch, signal) || !context.isCurrent() || !this.local(epoch, signal)) {
      return false
    }
    const document = this.options.authority!.attest(event)
    if (!same(document, captured.document) || !this.local(epoch, signal)) {
      return false
    }
    const latest = this.options.readCurrent!()
    if (!validMainSelectedPrAuthority(latest)) {
      return false
    }
    const copy = copyMainSelectedPrAuthority(latest)
    return (
      same(copy, captured) &&
      same(copyMainSelectedPrAuthority({ ...captured, binding }).binding, captured.binding) &&
      same(context.document, captured.document) &&
      context.bindingRevision === captured.bindingRevision &&
      context.grantRevision === captured.grantRevision &&
      context.sessionIncarnation === captured.sessionIncarnation &&
      context.isCurrent() &&
      this.local(epoch, signal)
    )
  }

  async run(
    event: IpcMainInvokeEvent,
    send: (packet: MainSelectedPrFactPacket) => void,
    signal?: AbortSignal
  ): Promise<MainSelectedPrCompositionResult> {
    if (this.busy || this.invalidating || this.options.enabled !== true) {
      return { status: 'denied' }
    }
    if (!this.available || this.disposed) {
      return { status: 'unavailable' }
    }
    this.busy = true
    const epoch = this.epoch
    const pending = new AbortController()
    this.pending = pending
    const abort = (): void => this.invalidate()
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop: () => void = () => undefined
    let activeGrantSignal: AbortSignal | undefined
    let delivered = false
    let failure: MainSelectedPrCompositionResult = { status: 'stale' }
    try {
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return { status: 'denied' }
      }
      if (!this.ready(epoch, pending.signal)) {
        return { status: 'denied' }
      }
      const cancelled = new Promise<MainSelectedPrCompositionResult>((resolve) => {
        stop = () => resolve({ status: 'stale' })
        pending.signal.addEventListener('abort', stop, { once: true })
      })
      timer = setTimeout(abort, 15_000)
      const operation = this.options.authority!.run(
        event,
        async (binding, grantSignal, context) => {
          activeGrantSignal = grantSignal
          grantSignal.addEventListener('abort', abort, { once: true })
          if (grantSignal.aborted || !this.ready(epoch, pending.signal)) {
            return null
          }
          const raw = this.options.readCurrent!()
          if (!validMainSelectedPrAuthority(raw)) {
            failure = { status: 'denied' }
            return null
          }
          const captured = copyMainSelectedPrAuthority(raw)
          const current = (): boolean =>
            this.current(event, captured, binding, context, epoch, pending.signal)
          if (!current()) {
            failure = { status: 'denied' }
            return null
          }
          const receipt = await this.options.provider!.acquire(context, pending.signal, binding)
          if (!current()) {
            return null
          }
          if (receipt.status !== 'verified') {
            failure = receipt
            return null
          }
          const rawProjection = await this.options.readProjection!(
            binding,
            receipt.evidence,
            pending.signal,
            context
          )
          if (!current()) {
            return null
          }
          const projection = structuredClone(rawProjection) as SelectedGitHubPrProjection
          if (!current()) {
            return null
          }
          if (projection?.status !== 'ready') {
            failure = { status: 'incomplete' }
            return null
          }
          return { receipt: receipt.evidence, projection, current }
        },
        (value) => {
          if (!value || !value.current()) {
            return
          }
          this.options.provider!.handoff(value.receipt, value.projection, (packet) => {
            if (!value.current() || !this.local(epoch, pending.signal)) {
              throw new Error('SOURCE_REVOKED')
            }
            send(packet)
            delivered = true
          })
        }
      )
      const result = await Promise.race([operation, cancelled])
      return {
        status: delivered
          ? 'delivered'
          : result.status === 'delivered'
            ? failure.status
            : result.status
      }
    } catch {
      return { status: 'unavailable' }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      activeGrantSignal?.removeEventListener('abort', abort)
      pending.signal.removeEventListener('abort', stop)
      this.pending = null
      this.busy = false
    }
  }
}
