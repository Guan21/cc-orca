import { randomUUID } from 'node:crypto'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'
import type { ElectronSourceOriginOptions } from './project-source-electron-origin'
import type { SourceOperationResult, VerifiedSourceDocument } from './project-source-grant-registry'
import type { MainProjectSourceCatalog } from './project-source-main-catalog'
import type { MainCredentialEvidenceProvider } from './project-source-main-credential'
import {
  MainRegisteredSelectedPrRepository,
  type RegistrationResult
} from './project-source-main-repository-registration'
import { MainNativeGitHubTransport } from './project-source-native-transport'
import { MainPersonalProjectSourceAuthority } from './project-source-personal-authority'
import { confirmProjectSourceRegistration } from './project-source-registration-consent'

type Options = Readonly<{
  enabled?: boolean
  approvedWebContents?: WebContents
  catalog: Pick<MainProjectSourceCatalog, 'readCatalog' | 'readSelection' | 'isCurrentWorktree'> &
    Partial<Pick<MainProjectSourceCatalog, 'subscribe'>>
  credential: Pick<MainCredentialEvidenceProvider, 'current' | 'principal' | 'subscribeRevocation'>
  origin: Omit<ElectronSourceOriginOptions, 'currentPrincipal' | 'revokeWebContents'>
  runner: ConstructorParameters<typeof MainNativeGitHubTransport>[0]['runner']
}>

type Fence = Readonly<{
  document: VerifiedSourceDocument
  selectionRevision: number
  projectId: string
  workspaceId: string
  epoch: number
  isCurrent(): boolean
}>

/** Main-only composition. Bootstrap/selection mutation wiring and live providers remain gated. */
export class MainProjectSourceIntegration {
  private readonly authority: MainPersonalProjectSourceAuthority
  private readonly transport: MainNativeGitHubTransport
  private readonly incarnation = randomUUID()
  private readonly listeners = new Map<WebContents, () => void>()
  private readonly unsubscribe: (() => void)[] = []
  private pending = new AbortController()
  private epoch = 1
  private registering = false
  private refreshing = false
  private disposed = false

  constructor(private readonly options: Options) {
    this.authority = new MainPersonalProjectSourceAuthority({
      ...options.origin,
      currentPrincipal: () => options.credential.current()
    })
    this.transport = new MainNativeGitHubTransport({
      enabled: options.enabled,
      principal: options.credential.principal,
      runner: options.runner
    })
    if (options.catalog.subscribe) {
      this.unsubscribe.push(options.catalog.subscribe(() => this.revoke()))
    }
    this.unsubscribe.push(
      options.credential.subscribeRevocation(() => {
        this.revoke()
        this.transport.retireAll()
      })
    )
  }

  /** All Main selection/mutation/profile changes must arrive here before state publication. */
  revoke(): void {
    this.epoch += 1
    this.pending.abort()
    this.pending = new AbortController()
    this.activeRegistration?.retireAll()
    this.activeRegistration = null
    this.authority.retireAll()
  }

  private watch(sender: WebContents): void {
    if (this.listeners.has(sender)) {
      return
    }
    const retire = (): void => this.revoke()
    this.listeners.set(sender, retire)
    sender.on('did-start-navigation', retire)
    sender.on('will-navigate', retire)
    sender.on('did-navigate', retire)
    sender.on('render-process-gone', retire)
    sender.on('destroyed', retire)
  }

  private fence(event: IpcMainInvokeEvent): Fence | null {
    if (this.disposed || this.options.enabled !== true || !this.options.catalog.subscribe) {
      return null
    }
    if (!this.options.approvedWebContents || event.sender !== this.options.approvedWebContents) {
      this.revoke()
      return null
    }
    const document = this.authority.attest(event)
    const selected = this.options.catalog.readSelection()
    if (!document || !selected || selected.selectionRevision < 1) {
      this.revoke()
      return null
    }
    this.watch(event.sender)
    const epoch = this.epoch
    const snapshot = JSON.stringify([document, selected, this.options.catalog.readCatalog()])
    const isCurrent = (): boolean => {
      if (this.disposed || this.epoch !== epoch) {
        return false
      }
      try {
        const latest = this.authority.attest(event)
        const current = this.options.catalog.readSelection()
        if (
          latest &&
          current &&
          JSON.stringify([latest, current, this.options.catalog.readCatalog()]) === snapshot
        ) {
          return true
        }
      } catch {
        /* Missing authoritative state must retire, never revive. */
      }
      this.revoke()
      return false
    }
    return {
      document,
      selectionRevision: selected.selectionRevision,
      projectId: selected.projectId,
      workspaceId: selected.workspaceId,
      epoch,
      isCurrent
    }
  }

  async register(event: IpcMainInvokeEvent): Promise<RegistrationResult> {
    if (this.registering || this.refreshing) {
      return 'denied'
    }
    this.registering = true
    try {
      if (this.options.enabled !== true || this.disposed) {
        return 'denied'
      }
      this.revoke()
      const fence = this.fence(event)
      if (!fence) {
        return 'denied'
      }
      const signal = this.pending.signal
      // B4a validates the real catalog before presenting any registration prompt.
      const request = new MainRegisteredSelectedPrRepository({
        readCatalog: () => this.options.catalog.readCatalog(),
        readSelection: () => this.options.catalog.readSelection(),
        readPrincipal: () => this.options.credential.current(),
        isCurrentWorktree: (selection) => this.options.catalog.isCurrentWorktree(selection),
        verifyRepository: async (repository, registrationSignal) => {
          if (!fence.isCurrent()) {
            return null
          }
          const accepted = await confirmProjectSourceRegistration(
            event,
            fence.projectId,
            repository,
            fence.isCurrent
          )
          if (!accepted || !fence.isCurrent()) {
            return null
          }
          const result = await this.transport.register({
            ...fence,
            operation: 'repositoryRegistration',
            repository,
            bindingRevision: fence.epoch,
            grantRevision: fence.epoch,
            sessionIncarnation: this.incarnation,
            actionId: randomUUID(),
            expiresAtMs: Date.now() + 15_000,
            signal: AbortSignal.any([signal, registrationSignal])
          })
          return fence.isCurrent() && result.status === 'registered' ? result.identity : null
        }
      })
      const abort = (): void => request.retireAll()
      signal.addEventListener('abort', abort, { once: true })
      try {
        const result = await request.registerSelected()
        if (!fence.isCurrent()) {
          return 'stale'
        }
        if (result !== 'registered') {
          return result
        }
        const binding = request.currentBinding()
        if (!binding || !this.authority.selectTrusted(event, binding)) {
          return 'denied'
        }
        // Adopt only the validated B4a object; no identity is reconstructed from selectors.
        this.activeRegistration = request
        return 'registered'
      } finally {
        signal.removeEventListener('abort', abort)
        if (this.activeRegistration !== request) {
          request.retireAll()
        }
      }
    } catch {
      this.revoke()
      return 'unavailable'
    } finally {
      this.registering = false
    }
  }

  private activeRegistration: MainRegisteredSelectedPrRepository | null = null

  /** Main-pinned HEAD is an expected result constraint, never proof of authorization. */
  async refresh(
    event: IpcMainInvokeEvent,
    headSha: string,
    deliver: (result: Extract<SelectedGitHubPrProjection, { status: 'ready' }>) => void
  ): Promise<SourceOperationResult | { status: 'unavailable' }> {
    if (this.refreshing || this.registering) {
      return { status: 'denied' }
    }
    this.refreshing = true
    try {
      const fence = this.fence(event)
      if (!fence || !this.activeRegistration?.currentBinding()) {
        return { status: 'denied' }
      }
      if (!(await this.authority.requestConsent(event)) || !fence.isCurrent()) {
        return { status: 'denied' }
      }
      return await this.authority.run(
        event,
        async (binding, signal, context) => {
          const result = await this.transport.readSelected({
            ...context,
            operation: 'selectedPrRead',
            projectId: fence.projectId,
            workspaceId: fence.workspaceId,
            selectionRevision: fence.selectionRevision,
            actionId: randomUUID(),
            binding,
            headSha,
            signal: AbortSignal.any([signal, this.pending.signal]),
            isCurrent: () =>
              fence.isCurrent() &&
              context.isCurrent() &&
              JSON.stringify(this.activeRegistration?.currentBinding()) === JSON.stringify(binding)
          })
          if (!fence.isCurrent() || !context.isCurrent() || result.status !== 'ready') {
            throw new Error('SOURCE_UNAVAILABLE')
          }
          return result
        },
        (result) => {
          if (!fence.isCurrent()) {
            throw new Error('SOURCE_UNAVAILABLE')
          }
          deliver(result)
        }
      )
    } catch {
      this.revoke()
      return { status: 'unavailable' }
    } finally {
      this.refreshing = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.revoke()
    this.transport.retireAll()
    for (const unsubscribe of this.unsubscribe) {
      unsubscribe()
    }
    for (const [sender, retire] of this.listeners) {
      sender.removeListener('did-start-navigation', retire)
      sender.removeListener('will-navigate', retire)
      sender.removeListener('did-navigate', retire)
      sender.removeListener('render-process-gone', retire)
      sender.removeListener('destroyed', retire)
    }
    this.listeners.clear()
  }
}
