import type { BrowserWindow, WebContents } from 'electron'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'
import { MainProjectSourceIntegration } from './project-source-main-integration'
import type { MainProjectSourceCatalog } from './project-source-main-catalog'

type AppProfile = 'personal' | 'corporate' | 'development'
type Options = Readonly<{
  catalog: MainProjectSourceCatalog
  expectedDocumentUrl: string
  currentAppProfile(): AppProfile
  currentProfileIdentity(): string | null
}>
const windowOwners = new WeakMap<BrowserWindow, MainProjectSourceBootstrap>()
const contentsOwners = new WeakMap<WebContents, MainProjectSourceBootstrap>()

/** Lifecycle wiring only: no production credential or confinement provider is approved. */
export class MainProjectSourceBootstrap {
  private readonly profile: string | null
  private readonly appProfile: AppProfile
  private integration: MainProjectSourceIntegration | null = null
  private credential: MainCredentialEvidenceProvider | null = null
  private window: BrowserWindow | null = null
  private contents: WebContents | null = null
  private unsubscribe: (() => void) | null = null
  private disposed = false
  private readonly retire = (): void => {
    try {
      this.integration?.revoke()
    } catch {
      this.dispose()
    }
  }
  private readonly retireDocument = (): void => {
    this.retire()
    try {
      this.options.catalog.invalidate()
    } catch {
      this.dispose()
    }
  }
  private readonly detach = (): void => this.detachWindow()

  constructor(private readonly options: Options) {
    try {
      this.profile = options.currentProfileIdentity()
      this.appProfile = options.currentAppProfile()
    } catch {
      this.profile = null
      this.appProfile = 'development'
      this.disposed = true
      return
    }
    try {
      const unsubscribe = options.catalog.subscribe(() => {
        if (!this.isCurrentProfile()) {
          this.dispose()
        } else {
          this.retire()
        }
      })
      if (typeof unsubscribe !== 'function') {
        this.dispose()
      } else if (this.disposed) {
        unsubscribe()
      } else {
        this.unsubscribe = unsubscribe
      }
    } catch {
      this.dispose()
    }
  }

  private isCurrentProfile(): boolean {
    try {
      return (
        this.profile !== null &&
        this.profile === this.options.currentProfileIdentity() &&
        this.appProfile === this.options.currentAppProfile()
      )
    } catch {
      return false
    }
  }

  /** Only the explicit Main window factory calls this, before loading its document. */
  attachMainWindow(window: BrowserWindow): boolean {
    if (this.disposed || this.appProfile !== 'personal' || !this.isCurrentProfile()) {
      return false
    }
    const contents = window.webContents
    if (
      window.isDestroyed() ||
      contents.isDestroyed() ||
      windowOwners.has(window) ||
      contentsOwners.has(contents)
    ) {
      return false
    }
    this.detachWindow()
    if (this.disposed || !this.isCurrentProfile()) {
      return false
    }
    this.window = window
    this.contents = contents
    windowOwners.set(window, this)
    contentsOwners.set(contents, this)
    try {
      const approvedSession = contents.session
      if (!approvedSession) {
        throw new Error('Main session unavailable')
      }
      const credential = new MainCredentialEvidenceProvider()
      this.credential = credential
      this.integration = new MainProjectSourceIntegration({
        enabled: false,
        approvedWebContents: contents,
        catalog: this.options.catalog,
        credential,
        origin: {
          approvedWindow: window,
          approvedSession,
          expectedDocumentUrl: this.options.expectedDocumentUrl,
          currentAppProfile: () => (this.isCurrentProfile() ? this.appProfile : 'development')
        },
        runner: {
          executable: { path: '', realPath: '', dev: 0, ino: 0, size: 0, mtimeMs: 0, sha256: '' },
          environment: {},
          runtime: () => ({ packaged: false, profile: 'development', execution: 'native' })
        }
      })
      window.on('closed', this.detach)
      contents.on('destroyed', this.detach)
      contents.on('did-start-navigation', this.retireDocument)
      contents.on('will-navigate', this.retireDocument)
      contents.on('did-navigate', this.retireDocument)
      contents.on('render-process-gone', this.retireDocument)
      return true
    } catch {
      this.detachWindow()
      return false
    }
  }

  private detachWindow(): void {
    const cleanup = (action: () => void): void => {
      try {
        action()
      } catch {
        /* Continue retiring independent owners. */
      }
    }
    const integration = this.integration
    this.integration = null
    cleanup(() => integration?.dispose())
    const credential = this.credential
    this.credential = null
    cleanup(() => credential?.dispose())
    if (this.window) {
      cleanup(() => this.options.catalog.invalidate())
    }
    if (this.window) {
      cleanup(() => this.window?.removeListener('closed', this.detach))
      windowOwners.delete(this.window)
    }
    if (this.contents) {
      cleanup(() => this.contents?.removeListener('destroyed', this.detach))
      cleanup(() => this.contents?.removeListener('did-start-navigation', this.retireDocument))
      cleanup(() => this.contents?.removeListener('will-navigate', this.retireDocument))
      cleanup(() => this.contents?.removeListener('did-navigate', this.retireDocument))
      cleanup(() => this.contents?.removeListener('render-process-gone', this.retireDocument))
      contentsOwners.delete(this.contents)
    }
    this.window = null
    this.contents = null
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.detachWindow()
    const unsubscribe = this.unsubscribe
    this.unsubscribe = null
    try {
      unsubscribe?.()
    } catch {
      /* Authority is already retired. */
    }
  }
}
