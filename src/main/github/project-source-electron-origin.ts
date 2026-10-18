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
import { app, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent, Session, WebContents, WebFrameMain } from 'electron'
import type { VerifiedSourceDocument } from './project-source-grant-registry'

export type VerifiedPersonalGhPrincipal = Readonly<{
  principalId: string
  credentialGeneration: number
}>

export type ElectronSourceOriginOptions = Readonly<{
  /** Exact Session object supplied by the trusted Main window-creation code. */
  approvedSession: Session
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
  private readonly installedListeners = new WeakSet<WebContents>()
  private readonly documents = new WeakMap<WebContents, DocumentInstance>()
  private readonly appIncarnation = randomUUID()
  private readonly sessionId = randomUUID()

  constructor(private readonly options: ElectronSourceOriginOptions) {}

  private invalidate(sender: WebContents): void {
    this.documents.delete(sender)
    this.options.revokeWebContents(sender.id)
  }

  private attach(sender: WebContents): void {
    if (this.installedListeners.has(sender)) {
      return
    }
    this.installedListeners.add(sender)
    const retire = (): void => this.invalidate(sender)
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
    if (!app.isPackaged || !nonempty(this.options.expectedDocumentUrl)) {
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
    const document =
      existing?.frame === frame
        ? existing
        : { frame, id: randomUUID() }
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
}
