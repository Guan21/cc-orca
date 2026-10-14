import { randomUUID } from 'node:crypto'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'
import { getTrustedUIRendererRegistrationRevision, getTrustedUIRendererWindow } from '../ipc/ui'
import { isRendererDocumentNavigation } from '../window/renderer-document-navigation'

/** Desktop session ownership only; this is neither a user login nor a source grant. */
export type ProjectSourceReaderProof = {
  readonly applicationSessionId: string
  readonly documentGeneration: symbol
  readonly windowId: number
  readonly webContentsId: number
}

export type ProjectSourceReaderResult =
  | { readonly status: 'proven'; readonly identity: ProjectSourceReaderProof }
  | {
      readonly status: 'denied'
      readonly reason: 'unregistered-reader' | 'foreign-frame' | 'document-not-proven'
    }

type DesktopRegistration = {
  readonly window: BrowserWindow
  readonly contents: WebContents
  readonly authorizedDocumentUrl: string
  readonly registrationRevision: bigint
  frame: WebFrameMain | null
  proof: ProjectSourceReaderProof | null
  dispose: () => void
}

function isAuthorizedDocument(expected: string, actual: string): boolean {
  try {
    return (
      isRendererDocumentNavigation(expected, actual) &&
      new URL(expected).pathname === new URL(actual).pathname
    )
  } catch {
    return false
  }
}

/** No production composition: only Main may provide the expected application document. */
export class ProjectSourceReaderIdentity {
  private readonly applicationSessionId = randomUUID()
  private registration: DesktopRegistration | null = null
  private ended = false

  registerCurrentDesktopWindow(authorizedDocumentUrl: string): boolean {
    this.retire()
    if (this.ended) {
      return false
    }
    try {
      const window = getTrustedUIRendererWindow()
      if (!window || window.isDestroyed()) {
        return false
      }
      const contents = window.webContents
      if (
        contents.isDestroyed() ||
        contents.getType() !== 'window' ||
        contents.isLoadingMainFrame() ||
        !contents.mainFrame ||
        !isAuthorizedDocument(authorizedDocumentUrl, contents.getURL())
      ) {
        return false
      }
      const registration: DesktopRegistration = {
        window,
        contents,
        authorizedDocumentUrl,
        registrationRevision: getTrustedUIRendererRegistrationRevision(),
        frame: contents.mainFrame,
        proof: null,
        dispose: () => {}
      }
      const invalidateDocument = (): void => {
        registration.frame = null
        registration.proof = null
      }
      const navigationStarted = (
        _event: Electron.Event,
        _url: string,
        isSameDocument: boolean,
        isMainFrame: boolean
      ): void => {
        if (isMainFrame && !isSameDocument) {
          invalidateDocument()
        }
      }
      const documentLoaded = (): void => {
        if (this.registration !== registration) {
          return
        }
        invalidateDocument()
        registration.frame = contents.mainFrame
        if (this.isCurrent(registration)) {
          this.mintProof(registration)
        }
      }
      const documentCommitted = (
        _event: Electron.Event,
        _url: string,
        _code: number,
        _status: string,
        isMainFrame: boolean
      ): void => {
        if (isMainFrame) {
          invalidateDocument()
        }
      }
      const retire = (): void => {
        if (this.registration === registration) {
          this.retire()
        }
      }
      contents.on('did-start-navigation', navigationStarted)
      contents.on('did-frame-navigate', documentCommitted)
      contents.on('did-finish-load', documentLoaded)
      contents.on('render-process-gone', retire)
      contents.on('destroyed', retire)
      window.on('closed', retire)
      registration.dispose = () => {
        invalidateDocument()
        contents.removeListener('did-start-navigation', navigationStarted)
        contents.removeListener('did-frame-navigate', documentCommitted)
        contents.removeListener('did-finish-load', documentLoaded)
        contents.removeListener('render-process-gone', retire)
        contents.removeListener('destroyed', retire)
        window.removeListener('closed', retire)
      }
      this.registration = registration
      this.mintProof(registration)
      return true
    } catch {
      this.retire()
      return false
    }
  }

  /** Capture synchronously at original event admission, before any await or event retention. */
  capture(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): ProjectSourceReaderResult {
    const registration = this.registration
    if (!registration || event.sender !== registration.contents) {
      return { status: 'denied', reason: 'unregistered-reader' }
    }
    if (!registration.proof) {
      return { status: 'denied', reason: 'document-not-proven' }
    }
    if (!this.isCurrent(registration)) {
      this.retire()
      return { status: 'denied', reason: 'document-not-proven' }
    }
    if (event.senderFrame !== registration.frame) {
      return { status: 'denied', reason: 'foreign-frame' }
    }
    return { status: 'proven', identity: registration.proof }
  }

  /** Recheck after every await and immediately before releasing data or performing an operation. */
  validate(identity: ProjectSourceReaderProof): boolean {
    const registration = this.registration
    if (!registration || registration.proof !== identity) {
      return false
    }
    if (!this.isCurrent(registration)) {
      this.retire()
      return false
    }
    return true
  }

  close(): void {
    this.ended = true
    this.retire()
  }

  private mintProof(registration: DesktopRegistration): void {
    registration.proof = Object.freeze({
      applicationSessionId: this.applicationSessionId,
      documentGeneration: Symbol('Main reader document'),
      windowId: registration.window.id,
      webContentsId: registration.contents.id
    })
  }

  private isCurrent(registration: DesktopRegistration): boolean {
    try {
      const { window, contents, frame, authorizedDocumentUrl } = registration
      return (
        !this.ended &&
        this.registration === registration &&
        getTrustedUIRendererRegistrationRevision() === registration.registrationRevision &&
        getTrustedUIRendererWindow() === window &&
        !window.isDestroyed() &&
        window.webContents === contents &&
        !contents.isDestroyed() &&
        contents.getType() === 'window' &&
        !contents.isLoadingMainFrame() &&
        frame !== null &&
        contents.mainFrame === frame &&
        isAuthorizedDocument(authorizedDocumentUrl, contents.getURL())
      )
    } catch {
      return false
    }
  }

  private retire(): void {
    const registration = this.registration
    this.registration = null
    registration?.dispose()
  }
}
