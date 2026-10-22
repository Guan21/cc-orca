import { vi, type Mock } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { MainSelectedPrGrantRegistry } from '../project-source-grant-registry'
import { MainTrustedSelectedPrHeadProvider } from '../project-source-main-pr-head-provider'
import {
  MainSelectedPrSourceComposition,
  SOURCE_LIFECYCLE_DOMAINS
} from '../project-source-main-composition'
import { AUTHORITY, NOW, head, ready } from './selected-pr-head-provider'
import type { MainSelectedPrHeadAuthority } from '../project-source-main-pr-head-contract'
import type { MainSelectedPrFactPacket } from '../project-source-main-pr-evidence-delivery'
type CompositionOptions = NonNullable<
  ConstructorParameters<typeof MainSelectedPrSourceComposition>[0]
>
type CompositionFixture = {
  composition: MainSelectedPrSourceComposition
  options: CompositionOptions
  registry: MainSelectedPrGrantRegistry
  authority: {
    attest: Mock<(event?: IpcMainInvokeEvent) => MainSelectedPrHeadAuthority['document']>
    retireAll: Mock<() => void>
    run: NonNullable<CompositionOptions['authority']>['run']
  }
  provider: MainTrustedSelectedPrHeadProvider
  send: Mock<(packet: MainSelectedPrFactPacket) => void>
  event: IpcMainInvokeEvent
  readCurrent: Mock<() => MainSelectedPrHeadAuthority>
  readEvidence: Mock<() => Promise<ReturnType<typeof head>>>
  readProjection: Mock<NonNullable<CompositionOptions['readProjection']>>
  readiness: Record<keyof NonNullable<CompositionOptions['readiness']>, Mock<() => boolean>>
  lifecycle: NonNullable<CompositionOptions['lifecycle']>
  listeners: Map<string, () => void>
  cleanup: Mock<() => void>
  change(domain: string): void
  setCurrent(value: MainSelectedPrHeadAuthority): void
  getCurrent(): MainSelectedPrHeadAuthority
  setNow(value: number): void
  beforeDeliver(callback: () => void): void
  run(signal?: AbortSignal): ReturnType<MainSelectedPrSourceComposition['run']>
}
export async function setup(
  overrides: Partial<CompositionOptions> = {}
): Promise<CompositionFixture> {
  let current = structuredClone(AUTHORITY)
  let now = NOW
  const registry = new MainSelectedPrGrantRegistry(
    async () => true,
    () => now
  )
  registry.select(current.document, current.binding)
  await registry.requestGrant(() => current.document)
  const attest = vi.fn((_event?: IpcMainInvokeEvent) => current.document)
  let beforeDelivery: (() => void) | undefined
  const authority = {
    attest,
    retireAll: vi.fn(() => registry.retireAll()),
    run: ((event, load, deliver) =>
      registry.run(
        () => attest(event),
        (binding, signal, context) => {
          current = {
            ...current,
            binding,
            bindingRevision: context.bindingRevision,
            grantRevision: context.grantRevision,
            sessionIncarnation: context.sessionIncarnation
          }
          return load(binding, signal, context)
        },
        (value) => {
          beforeDelivery?.()
          deliver(value)
        }
      )) as NonNullable<CompositionOptions['authority']>['run']
  }
  const listeners = new Map<string, () => void>()
  const cleanup = vi.fn<() => void>()
  const lifecycle = Object.fromEntries(
    SOURCE_LIFECYCLE_DOMAINS.map((domain) => [
      domain,
      vi.fn((listener: () => void) => {
        listeners.set(domain, listener)
        return cleanup
      })
    ])
  ) as NonNullable<CompositionOptions['lifecycle']>
  const readCurrent = vi.fn(() => current)
  const readEvidence = vi.fn(async () => head(current))
  const provider = new MainTrustedSelectedPrHeadProvider({
    enabled: true,
    isOwnerAuthorized: () => true,
    authority: { readCurrent, subscribeChanges: () => () => {} },
    adapter: { readEvidence, subscribeChanges: () => () => {} },
    nowMs: () => now
  })
  const readiness = {
    owner: vi.fn(() => true),
    exactSha: vi.fn(() => true),
    nativeQa: vi.fn(() => true),
    effectiveAcl: vi.fn(() => true),
    nativeCustody: vi.fn(() => true)
  }
  const readProjection = vi.fn(
    async (
      ..._args: Parameters<NonNullable<CompositionOptions['readProjection']>>
    ): Promise<unknown> => ({
      ...ready(),
      snapshot: { ...ready().snapshot, bindingRevision: current.bindingRevision }
    })
  )
  const options = {
    enabled: true,
    authority,
    provider,
    readCurrent,
    lifecycle,
    readiness,
    readProjection,
    ...overrides
  }
  const composition = new MainSelectedPrSourceComposition(options)
  const send = vi.fn<(packet: MainSelectedPrFactPacket) => void>()
  const event = {} as IpcMainInvokeEvent
  return {
    composition,
    options,
    registry,
    authority,
    provider,
    send,
    event,
    readCurrent,
    readEvidence,
    readProjection,
    readiness,
    lifecycle,
    listeners,
    cleanup,
    change(domain: string) {
      listeners.get(domain)?.()
    },
    setCurrent(value: typeof current) {
      current = value
    },
    getCurrent: () => current,
    setNow(value: number) {
      now = value
    },
    beforeDeliver(callback: () => void) {
      beforeDelivery = callback
    },
    run: (signal?: AbortSignal) => composition.run(event, send, signal)
  }
}
