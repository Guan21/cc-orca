import type { BrowserWindow, WebContents } from 'electron'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'
import { MainProjectSourceIntegration } from './project-source-main-integration'
import type { MainProjectSourceCatalog } from './project-source-main-catalog'
import type { MainProjectSelectionProducer } from './project-source-main-producer'
import { registerProjectSourceSelectionRetirement } from './project-source-selection-retirement'
import { registerProjectSourceOperationOwner } from './project-source-operation-ipc'

type AppProfile = 'personal' | 'corporate' | 'development'
type Options = Readonly<{
  catalog: MainProjectSourceCatalog
  producer?: MainProjectSelectionProducer
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
  private retireSelectionIntent: (() => void) | null = null
  private retireOperationIntent: (() => void) | null = null
  private disposed = false
  private attaching = false
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
    if (this.attaching) {
      return false
    }
    this.attaching = true
    try {
      return this.attachWindow(window)
    } finally {
      this.attaching = false
    }
  }

  private attachWindow(window: BrowserWindow): boolean {
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
    if (
      this.disposed ||
      !this.isCurrentProfile() ||
      window.isDestroyed() ||
      contents.isDestroyed() ||
      windowOwners.has(window) ||
      contentsOwners.has(contents)
    ) {
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
      const integration = new MainProjectSourceIntegration({
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
      if (
        this.disposed ||
        this.window !== window ||
        this.contents !== contents ||
        !this.isCurrentProfile() ||
        windowOwners.get(window) !== this ||
        contentsOwners.get(contents) !== this
      ) {
        integration.dispose()
        this.detachWindow()
        return false
      }
      this.integration = integration
      if (this.options.producer) {
        this.options.producer.attachMainWindow(window)
        this.retireSelectionIntent = registerProjectSourceSelectionRetirement({
          producer: this.options.producer,
          window,
          expectedDocumentUrl: this.options.expectedDocumentUrl,
          currentAppProfile: () => (this.isCurrentProfile() ? this.appProfile : 'development')
        })
      }
      this.retireOperationIntent = registerProjectSourceOperationOwner({
        window,
        expectedDocumentUrl: this.options.expectedDocumentUrl,
        currentAppProfile: () => (this.isCurrentProfile() ? this.appProfile : 'development'),
        // No reviewed live credential, HEAD, confinement or delivery provider exists yet.
        isEnabled: () => false,
        register: (event) => integration.register(event)
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
    const credential = this.credential
    const window = this.window
    const contents = this.contents
    this.integration = null
    this.credential = null
    this.window = null
    this.contents = null
    const retireSelectionIntent = this.retireSelectionIntent
    this.retireSelectionIntent = null
    cleanup(() => retireSelectionIntent?.())
    const retireOperationIntent = this.retireOperationIntent
    this.retireOperationIntent = null
    cleanup(() => retireOperationIntent?.())
    cleanup(() => this.options.producer?.detachWindow())
    cleanup(() => integration?.dispose())
    cleanup(() => credential?.dispose())
    if (window) {
      cleanup(() => this.options.catalog.invalidate())
    }
    if (window) {
      cleanup(() => window.removeListener('closed', this.detach))
      if (windowOwners.get(window) === this) {
        windowOwners.delete(window)
      }
    }
    if (contents) {
      cleanup(() => contents.removeListener('destroyed', this.detach))
      cleanup(() => contents.removeListener('did-start-navigation', this.retireDocument))
      cleanup(() => contents.removeListener('will-navigate', this.retireDocument))
      cleanup(() => contents.removeListener('did-navigate', this.retireDocument))
      cleanup(() => contents.removeListener('render-process-gone', this.retireDocument))
      if (contentsOwners.get(contents) === this) {
        contentsOwners.delete(contents)
      }
    }
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

  openSelectionPicker(window: BrowserWindow): void {
    if (!this.disposed && this.window === window && this.isCurrentProfile()) {
      this.options.producer?.openPicker(window)
    }
  }
}
