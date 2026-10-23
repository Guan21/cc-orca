/**
 * #116 / #152: Main-only, in-memory authorization fence for a single selected PR.
 *
 * No IPC handler, renderer bridge, credential read, GitHub request, durable
 * source or network policy is installed here. Callers MUST supply identities
 * freshly authenticated from Electron Main (never renderer-supplied IDs) and
 * bindings verified through the Main-owned Project catalog + GitHub registration.
 *
 * The confirm callback MUST present an independently user-confirmed, native
 * consent UI; selecting Project/PR is NOT consent. The read callback is allowed
 * only after consent and must pin the approved Personal/native GitHub transport.
 */
import { randomUUID } from 'node:crypto'
import {
  positive,
  validDocument,
  validBinding,
  copyDocument,
  copyBinding,
  sameDocument
} from './project-source-grant-validation'

export type VerifiedSourceDocument = Readonly<{
  profile: 'personal-packaged'
  executionRealm: 'native'
  installationId: string
  windowId: number
  webContentsId: number
  frameProcessId: number
  frameRoutingId: number
  documentId: string
  sessionPartition: string
  principalId: string
  credentialGeneration: number
}>

export type TrustedSelectedPrBinding = Readonly<{
  projectId: string
  workspaceKind: 'folder' | 'worktree'
  workspaceId: string
  hostSetupId: string
  executionHostId: string
  repository: Readonly<{
    host: 'github.com'
    id: number
    nodeId: string
    owner: string
    name: string
  }>
  prNumber: number
}>

type Scope = Readonly<{
  document: VerifiedSourceDocument
  binding: TrustedSelectedPrBinding
  bindingRevision: number
  grantRevision: number
  sessionIncarnation: string
}>

type PendingGrant = Readonly<{
  scope: Scope
  expiresAt: number
}>

type SelectionState = {
  scope: Scope
  granted?: PendingGrant
  pending?: AbortController
}

export type SourceOperationResult =
  | { status: 'delivered' }
  | { status: 'denied' | 'expired' | 'revoked' }

export type MainSelectedPrOperationContext = Readonly<{
  document: VerifiedSourceDocument
  bindingRevision: number
  grantRevision: number
  sessionIncarnation: string
  expiresAtMs: number
  isCurrent(): boolean
}>

const MAX_GRANT_MS = 15 * 60_000

/**
 * The registry owns ALL binding/grant revisions and abort signals. One active
 * Project/PR binding per authenticated WebContents. Old grants never reappear
 * after A->B->A, document replacement, process restart or explicit revoke.
 */
export class MainSelectedPrGrantRegistry {
  private readonly incarnation = randomUUID()
  private readonly states = new Map<number, SelectionState>()
  private revision = 0
  private retirementDepth = 0

  constructor(
    private readonly confirmUser: (scope: TrustedSelectedPrBinding) => Promise<boolean>,
    private readonly now: () => number = Date.now
  ) {}

  private nextRevision(): number {
    if (!Number.isSafeInteger(this.revision + 1)) {
      throw new Error('Project read revision overflow: stop and restart')
    }
    this.revision += 1
    return this.revision
  }

  private current(
    document: VerifiedSourceDocument | null,
    retiring = false
  ): SelectionState | null {
    if ((!retiring && this.retirementDepth) || !validDocument(document)) {
      return null
    }
    const state = this.states.get(document.webContentsId)
    return state && sameDocument(state.scope.document, document) ? state : null
  }

  /**
   * Main must call this on every Project/repo/PR/worktree/host selection,
   * including returning to an older selection with identical display names.
   * The immutable repository nodeId must already have trusted provenance.
   */
  select(document: VerifiedSourceDocument, binding: TrustedSelectedPrBinding): boolean {
    if (this.retirementDepth) {
      return false
    }
    if (!validDocument(document) || !validBinding(binding)) {
      // A rejected switch must also revoke any old read authority for this
      // WebContents; retaining a previously authorized Project is unsafe.
      if (document && positive(document.webContentsId)) {
        this.retireWebContents(document.webContentsId)
      }
      return false
    }
    const expectedRevision = this.revision + 1
    this.retireWebContents(document.webContentsId)
    if (this.revision !== expectedRevision) {
      return false
    }
    const scope: Scope = Object.freeze({
      document: copyDocument(document),
      binding: copyBinding(binding),
      bindingRevision: this.nextRevision(),
      grantRevision: this.nextRevision(),
      sessionIncarnation: this.incarnation
    })
    this.states.set(document.webContentsId, { scope })
    return true
  }

  /** User must explicitly confirm with a native, Main-owned confirmation UI. */
  async requestGrant(verifiedNow: () => VerifiedSourceDocument | null): Promise<boolean> {
    const before = this.current(verifiedNow())
    if (!before) {
      return false
    }
    const bound = before.scope
    const accepted = await this.confirmUser(copyBinding(bound.binding))
    if (!accepted || this.current(verifiedNow()) !== before) {
      return false
    }
    // An older outstanding dialog is never allowed to reinstate a revoked grant.
    if (before.scope !== bound || before.granted) {
      return false
    }
    const now = this.now()
    if (
      !Number.isFinite(now) ||
      before.scope !== bound ||
      before.granted ||
      this.states.get(bound.document.webContentsId) !== before
    ) {
      return false
    }
    const grantRevision = this.nextRevision()
    const scope = Object.freeze({ ...bound, grantRevision })
    before.scope = scope
    before.granted = Object.freeze({ scope, expiresAt: now + MAX_GRANT_MS })
    return true
  }

  revoke(document: VerifiedSourceDocument): void {
    const grantRevision = this.nextRevision()
    const state = this.current(document, true)
    if (!state) {
      return
    }
    const pending = state.pending
    state.pending = undefined
    state.granted = undefined
    state.scope = Object.freeze({
      ...state.scope,
      grantRevision
    })
    this.abortRetired([pending])
  }

  /** Called on navigation, renderer termination, window close and logout. */
  retireWebContents(webContentsId: number): void {
    this.nextRevision()
    const previous = this.states.get(webContentsId)
    this.states.delete(webContentsId)
    this.abortRetired([previous?.pending])
  }

  /** Called on account/credential replacement or policy/repository changes. */
  retireAll(): void {
    this.nextRevision()
    const pending = [...this.states.values()].map((state) => state.pending)
    this.states.clear()
    this.abortRetired(pending)
  }

  private abortRetired(pending: (AbortController | undefined)[]): void {
    this.retirementDepth += 1
    try {
      for (const operation of pending) {
        operation?.abort()
      }
    } finally {
      this.retirementDepth -= 1
    }
  }

  /**
   * Main-owned loader and delivery callbacks. Reauthenticate from the current
   * BrowserWindow/frame/document/session after await and immediately before
   * delivery. No old result is made observable when authority changes.
   */
  async run<T>(
    verifiedNow: () => VerifiedSourceDocument | null,
    load: (
      scope: TrustedSelectedPrBinding,
      signal: AbortSignal,
      context: MainSelectedPrOperationContext
    ) => Promise<T>,
    deliver: (value: T) => void
  ): Promise<SourceOperationResult> {
    const before = this.current(verifiedNow())
    if (!before || !before.granted || before.pending) {
      return { status: 'denied' }
    }
    const grant = before.granted
    const pending = new AbortController()
    before.pending = pending
    const ownsOperation = (): boolean =>
      !this.retirementDepth &&
      !pending.signal.aborted &&
      before.pending === pending &&
      before.granted === grant &&
      this.states.get(grant.scope.document.webContentsId) === before
    const context: MainSelectedPrOperationContext = Object.freeze({
      document: grant.scope.document,
      bindingRevision: grant.scope.bindingRevision,
      grantRevision: grant.scope.grantRevision,
      sessionIncarnation: grant.scope.sessionIncarnation,
      expiresAtMs: grant.expiresAt,
      isCurrent: () => {
        try {
          const attested = this.current(verifiedNow())
          const now = this.now()
          if (
            attested === before &&
            ownsOperation() &&
            Number.isFinite(now) &&
            now < grant.expiresAt
          ) {
            return true
          }
        } catch {
          /* Failed attestation permanently retires this operation. */
        }
        pending.abort()
        return false
      }
    })
    try {
      const startedAt = this.now()
      if (!ownsOperation()) {
        return { status: 'revoked' }
      }
      if (!Number.isFinite(startedAt) || startedAt >= grant.expiresAt) {
        this.revoke(grant.scope.document)
        return { status: 'expired' }
      }
      const value = await load(copyBinding(grant.scope.binding), pending.signal, context)
      const after = this.current(verifiedNow())
      if (after !== before || !ownsOperation()) {
        return { status: 'revoked' }
      }
      const finalDocument = this.current(verifiedNow())
      const finishedAt = this.now()
      if (finalDocument !== before || !ownsOperation()) {
        return { status: 'revoked' }
      }
      if (!Number.isFinite(finishedAt) || finishedAt >= grant.expiresAt) {
        this.revoke(grant.scope.document)
        return { status: 'expired' }
      }
      // No callbacks or awaits intervene between final ownership/expiry checks and delivery.
      deliver(value)
      return { status: 'delivered' }
    } finally {
      if (before.pending === pending) {
        before.pending = undefined
      }
      if (before.granted === grant) {
        before.granted = undefined
      }
    }
  }

  /** Exposure for non-sensitive audit of revision only, not a grant token. */
  getIncarnation(): string {
    return this.incarnation
  }
}
