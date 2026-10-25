import { randomUUID } from 'node:crypto'
import type { IpcMainInvokeEvent } from 'electron'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'
import type { MainPersonalProjectSourceAuthority } from './project-source-personal-authority'
import type { MainNativeGitHubTransport } from './project-source-native-transport'
import type { MainProjectSourceAdmission } from './project-source-main-admission'
import { MainSelectedPrSourceComposition } from './project-source-main-composition'
import { MainTrustedSelectedPrHeadProvider } from './project-source-main-pr-head-provider'
import {
  copyMainSelectedPrAuthority,
  copyMainSelectedPrHead,
  type MainSelectedPrHeadAuthority
} from './project-source-main-pr-head-contract'
import type { MainSelectedPrFactPacket } from './project-source-main-pr-evidence-delivery'

type Options = {
  event: IpcMainInvokeEvent
  authority: MainPersonalProjectSourceAuthority
  transport: MainNativeGitHubTransport
  admission: MainProjectSourceAdmission
  selectionRevision: number
  signal: AbortSignal
  expectedHead?: string
  isCurrent(): boolean
  send(packet: MainSelectedPrFactPacket): void
}

/** One response supplies both the private HEAD receipt and the cached G1 projection. */
export async function refreshMainSelectedPr(options: Options) {
  const { authority, admission, event, signal } = options
  let current: MainSelectedPrHeadAuthority | null = null
  let projection: Extract<SelectedGitHubPrProjection, { status: 'ready' }> | null = null
  let provider: MainTrustedSelectedPrHeadProvider | undefined
  let composition: MainSelectedPrSourceComposition | undefined
  let grantCurrent = (): boolean => true
  let expiresAtMs = 0
  const isCurrent = (): boolean =>
    !signal.aborted && options.isCurrent() && admission.ready() && grantCurrent()
  try {
    if (!isCurrent() || !(await authority.requestConsent(event)) || !isCurrent()) {
      return { status: 'denied' as const }
    }
    provider = new MainTrustedSelectedPrHeadProvider({
      enabled: true,
      isOwnerAuthorized: isCurrent,
      authority: {
        readCurrent: () => (isCurrent() ? current : null),
        subscribeChanges: admission.subscribeChanges
      },
      adapter: {
        subscribeChanges: admission.subscribeChanges,
        readEvidence: async (captured, readSignal) => {
          if (!current || !isCurrent()) {
            return null
          }
          const lease = {
            ...current,
            operation: 'selectedPrRead' as const,
            projectId: current.binding.projectId,
            workspaceId: current.binding.workspaceId,
            actionId: randomUUID(),
            expiresAtMs: Math.min(expiresAtMs, Date.now() + 15_000),
            signal: AbortSignal.any([signal, readSignal]),
            isCurrent
          }
          const result = await (options.expectedHead === undefined
            ? options.transport.readSelectedSnapshot(lease)
            : options.transport.readSelected({ ...lease, headSha: options.expectedHead }))
          if (!isCurrent() || result.status !== 'ready') {
            return null
          }
          projection = result
          const pr = result.snapshot.facts.find((fact) => fact.kind === 'pull_request')
          return pr?.kind === 'pull_request'
            ? copyMainSelectedPrHead({
                ...captured,
                headSha: pr.headSha,
                observedAtMs: Date.now()
              })
            : null
        }
      }
    })
    composition = new MainSelectedPrSourceComposition({
      enabled: true,
      authority: {
        attest: (invocation) => authority.attest(invocation),
        retireAll: () => authority.retireAll(),
        run: (invocation, load, deliver) =>
          authority.run(
            invocation,
            (binding, grantSignal, context) => {
              grantCurrent = context.isCurrent
              expiresAtMs = context.expiresAtMs
              current = copyMainSelectedPrAuthority({
                ...context,
                binding,
                selectionRevision: options.selectionRevision
              })
              return load(binding, grantSignal, context)
            },
            deliver
          )
      },
      provider,
      readiness: admission.readiness,
      lifecycle: admission.lifecycle,
      readCurrent: () => (isCurrent() ? current : null),
      readProjection: async () => (isCurrent() ? projection : null)
    })
    return await composition.run(
      event,
      (packet) => {
        if (!isCurrent()) {
          throw new Error('SOURCE_REVOKED')
        }
        options.send(packet)
      },
      signal
    )
  } catch {
    return { status: 'unavailable' as const }
  } finally {
    composition?.dispose()
    provider?.dispose()
  }
}
