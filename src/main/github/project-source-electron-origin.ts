/**
 * #152 B3 — Main-side Electron origin attestation, deliberately UNWIRED.
 *
 * Never take the window/frame/document/session/principal from IPC params.
 * This guard authenticates an *actual* IpcMainInvokeEvent, only in a packaged
 * Personal window and one Main-pinned Electron Session + renderer document URL.
 *
 * The principal callback must later be wired to verified native gh identity;
 * returning null is the required default until that integration is reviewed.
 * This module does not register IPC, access gh credentials or authorize egress.
 */
import { randomUUID } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import { app, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent, Session, WebContents, WebFrameMain } from 'electron'
import type { VerifiedSourceDocument } from './project-source-grant-registry'

export type VerifiedPersonalGhPrincipal = Readonly<{
  principalId: string
  credentialGeneration: number
}>

export type ElectronSourceOriginOptions = Readonly<{
  /** Exact BrowserWindow supplied by trusted Main bootstrap. */
  approvedWindow?: BrowserWindow
  /** Exact Session object supplied by the trusted Main window-creation code. */
  approvedSession: Session
  /** Main-owned runtime profile, never a renderer argument. */
  currentAppProfile: () => 'personal' | 'corporate' | 'development'
  /** Exact bundled renderer document URL; hash-based navigation is ignored. */
  expectedDocumentUrl: string
  /** Trusted native identity resolver; never derived from renderer arguments. */
  currentPrincipal: () => VerifiedPersonalGhPrincipal | null
  /** Must revoke the per-WebContents grant when a document retires. */
  revokeWebContents: (id: number) => void
}>

type DocumentInstance = Readonly<{
  frame: WebFrameMain
  id: string
}>

function nonempty(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** A new instance must be instantiated from the trusted Main bootstrap only. */
export class PersonalProjectSourceElectronOrigin {
  private readonly installedListeners = new Map<WebContents, () => void>()
  private readonly documents = new WeakMap<WebContents, DocumentInstance>()
  private readonly appIncarnation = randomUUID()
  private readonly sessionId = randomUUID()
  private disposed = false

  constructor(private readonly options: ElectronSourceOriginOptions) {}

  private invalidate(sender: WebContents): void {
    this.documents.delete(sender)
    this.options.revokeWebContents(sender.id)
  }

  private attach(sender: WebContents): void {
    if (this.installedListeners.has(sender)) {
      return
    }
    const retire = (): void => this.invalidate(sender)
    this.installedListeners.set(sender, retire)
    // Retire on navigation START, not just after the replacement document loads.
    // Subframe navigation may also revoke: this is deliberately conservative.
    sender.on('did-start-navigation', retire)
    sender.on('will-navigate', retire)
    sender.on('did-navigate', retire)
    sender.on('render-process-gone', retire)
    sender.once('destroyed', retire)
  }

  /** Returns null until Main can attest every required identity field. */
  attest(event: IpcMainInvokeEvent): VerifiedSourceDocument | null {
    if (this.disposed) {
      return null
    }
    try {
      const document = this.attestCurrent(event)
      if (!document && this.documents.has(event.sender)) {
        this.invalidate(event.sender)
      }
      return document
    } catch {
      this.dispose()
      return null
    }
  }

  private attestCurrent(event: IpcMainInvokeEvent): VerifiedSourceDocument | null {
    if (
      !app.isPackaged ||
      this.options.currentAppProfile() !== 'personal' ||
      !nonempty(this.options.expectedDocumentUrl)
    ) {
      return null
    }
    const sender = event.sender
    const frame = event.senderFrame
    if (
      !sender ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.session !== this.options.approvedSession ||
      !frame ||
      frame !== sender.mainFrame ||
      frame.isDestroyed() ||
      !nonnegative(frame.processId) ||
      !nonnegative(frame.routingId)
    ) {
      return null
    }

    // Do not turn a packaged window into a credential-capable browser.
    // Only its exact Main-approved local renderer entry document is accepted.
    const exactUrl = frame.url.split('#')[0]
    if (exactUrl !== this.options.expectedDocumentUrl.split('#')[0]) {
      return null
    }
    const window = BrowserWindow.fromWebContents(sender)
    if (
      !window ||
      (this.options.approvedWindow !== undefined && window !== this.options.approvedWindow) ||
      window.isDestroyed() ||
      window.webContents !== sender ||
      !nonnegative(window.id) ||
      !nonnegative(sender.id)
    ) {
      return null
    }
    const identity = this.options.currentPrincipal()
    if (
      !identity ||
      !nonempty(identity.principalId) ||
      !nonnegative(identity.credentialGeneration)
    ) {
      return null
    }
    this.attach(sender)
    const existing = this.documents.get(sender)
    const document = existing?.frame === frame ? existing : { frame, id: randomUUID() }
    if (document !== existing) {
      this.documents.set(sender, document)
    }
    return {
      profile: 'personal-packaged',
      executionRealm: 'native',
      installationId: this.appIncarnation,
      windowId: window.id,
      webContentsId: sender.id,
      frameProcessId: frame.processId,
      frameRoutingId: frame.routingId,
      documentId: document.id,
      sessionPartition: this.sessionId,
      principalId: identity.principalId,
      credentialGeneration: identity.credentialGeneration
    }
  }

  /** Trusted Main owner calls this on profile/policy/credential logout changes. */
  retire(sender: WebContents): void {
    this.invalidate(sender)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const [sender, retire] of this.installedListeners) {
      this.documents.delete(sender)
      const emitter: Pick<EventEmitter, 'removeListener'> = sender
      for (const name of [
        'did-start-navigation',
        'will-navigate',
        'did-navigate',
        'render-process-gone',
        'destroyed'
      ]) {
        try {
          emitter.removeListener(name, retire)
        } catch {
          // Continue detaching the remaining listeners.
        }
      }
      try {
        this.options.revokeWebContents(sender.id)
      } catch {
        // Disposal remains terminal even when a subscriber fails.
      }
    }
    this.installedListeners.clear()
  }
}
