import type { BrowserWindow } from 'electron'
import {
  SOURCE_LIFECYCLE_DOMAINS,
  type MainSelectedPrCompositionOptions
} from './project-source-composition-contract'
import { MainSelectedPrSourceComposition } from './project-source-main-composition'
import type { MainCredentialEvidenceProvider } from './project-source-main-credential'
import type { MainProjectSourceCatalog } from './project-source-main-catalog'

type Options = Readonly<{
  window: BrowserWindow
  credential: Pick<MainCredentialEvidenceProvider, 'subscribeRevocation'>
  catalog: Pick<MainProjectSourceCatalog, 'invalidate'>
  retire(): void
}>

/** Conservative retirement observations do not establish complete publication ordering. */
export class MainProjectSourceLifecycleBridge {
  readonly lifecycle: NonNullable<MainSelectedPrCompositionOptions['lifecycle']> = Object.freeze({})
  private readonly composition = new MainSelectedPrSourceComposition()
  private readonly cleanup: (() => void)[] = []
  private disposed = false
  private invalidating = false
  private installing = true
  private interrupted = false

  private readonly retireDocument = (): void => {
    if (this.disposed) {
      return
    }
    try {
      this.invalidate()
    } finally {
      try {
        this.options.catalog.invalidate()
      } catch {
        this.dispose()
      }
    }
  }

  constructor(private readonly options: Options) {
    const contents = options.window.webContents
    const retire = this.retireDocument
    try {
      const unsubscribe = options.credential.subscribeRevocation(() => this.invalidate())
      if (typeof unsubscribe !== 'function') {
        throw new Error('SOURCE_UNAVAILABLE')
      }
      this.cleanup.push(unsubscribe)
      this.cleanup.push(() => options.window.removeListener('close', retire))
      options.window.on('close', retire)
      this.cleanup.push(() => contents.removeListener('will-frame-navigate', retire))
      contents.on('will-frame-navigate', retire)
      this.cleanup.push(() => contents.removeListener('will-navigate', retire))
      contents.on('will-navigate', retire)
      this.cleanup.push(() => contents.removeListener('did-start-navigation', retire))
      contents.on('did-start-navigation', retire)
      this.cleanup.push(() => contents.removeListener('did-frame-navigate', retire))
      contents.on('did-frame-navigate', retire)
      this.cleanup.push(() => contents.removeListener('did-navigate', retire))
      contents.on('did-navigate', retire)
      this.cleanup.push(() => contents.removeListener('frame-created', retire))
      contents.on('frame-created', retire)
      this.cleanup.push(() => contents.removeListener('render-process-gone', retire))
      contents.on('render-process-gone', retire)
      if (this.interrupted || this.disposed) {
        throw new Error('SOURCE_UNAVAILABLE')
      }
    } catch {
      this.dispose()
      throw new Error('SOURCE_UNAVAILABLE')
    } finally {
      this.installing = false
    }
  }

  invalidate(): void {
    if (this.disposed || this.invalidating) {
      return
    }
    this.interrupted ||= this.installing
    this.invalidating = true
    try {
      this.composition.invalidate()
      this.options.retire()
    } catch {
      this.dispose()
    } finally {
      this.invalidating = false
    }
  }

  readiness(): Readonly<{
    composition: 'disabled' | 'disposed'
    unavailableDomains: typeof SOURCE_LIFECYCLE_DOMAINS
  }> {
    return Object.freeze({
      composition: this.disposed ? 'disposed' : 'disabled',
      unavailableDomains: SOURCE_LIFECYCLE_DOMAINS
    })
  }

  dispose(): void {
    if (!this.disposed) {
      this.invalidate()
      this.disposed = true
      this.composition.dispose()
    }
    for (const cleanup of this.cleanup.splice(0)) {
      try {
        cleanup()
      } catch {
        // A failed unsubscribe must not retain independent lifecycle listeners.
      }
    }
  }
}
