import { Menu } from 'electron'
import type { EventEmitter } from 'node:events'
import type { BrowserWindow, Session, WebFrameMain } from 'electron'
import type { MainProjectSourceCatalog } from './project-source-main-catalog'
import type {
  MainProjectSelectionCandidate,
  MainProjectSelectionSnapshot,
  MainProjectSelectionSource
} from './project-source-main-selection'
import { confirmProjectSourceNative } from './project-source-native-confirmation'
import { verifyProjectSourceWindowDocument } from './project-source-window-document'

type Options = Readonly<{
  catalog: MainProjectSourceCatalog
  expectedDocumentUrl: string
  currentAppProfile(): 'personal' | 'corporate' | 'development'
  currentProfileIdentity(): string | null
}>

/** Process-local scope selection only. This owner has no registration, credential or read API. */
export class MainProjectSelectionProducer implements MainProjectSelectionSource {
  private revision = 1
  private candidate: MainProjectSelectionCandidate | null = null
  private fingerprint: string | null = null
  private frame: WebFrameMain | null = null
  private window: BrowserWindow | null = null
  private session: Session | null = null
  private pending: AbortController | null = null
  private readonly profile: string | null
  private disposed = false
  private publishing = false
  private clearing = false
  private catalogEvents = 0
  private readonly listeners = new Set<(snapshot: MainProjectSelectionSnapshot) => void>()
  private readonly unsubscribe: () => void
  private readonly retire = (): void => this.clear()
  private readonly detach = (): void => this.detachWindow()

  constructor(private readonly options: Options) {
    this.profile = options.currentProfileIdentity()
    this.unsubscribe = options.catalog.subscribe(() => {
      if (this.disposed) {
        return
      }
      if (this.publishing && ++this.catalogEvents === 1) {
        return
      }
      this.clear()
    })
  }

  attachMainWindow(window: BrowserWindow): void {
    this.detachWindow()
    if (this.disposed) {
      return
    }
    this.window = window
    this.session = window.webContents.session
    window.on('closed', this.detach)
    window.webContents.on('destroyed', this.detach)
    const contents: Pick<EventEmitter, 'on'> = window.webContents
    for (const event of [
      'did-start-navigation',
      'will-navigate',
      'did-navigate',
      'render-process-gone'
    ] as const) {
      contents.on(event, this.retire)
    }
  }

  detachWindow(): void {
    const window = this.window
    this.window = null
    this.session = null
    this.clear()
    if (!window) {
      return
    }
    window.removeListener('closed', this.detach)
    window.webContents.removeListener('destroyed', this.detach)
    const contents: Pick<EventEmitter, 'removeListener'> = window.webContents
    for (const event of [
      'did-start-navigation',
      'will-navigate',
      'did-navigate',
      'render-process-gone'
    ] as const) {
      contents.removeListener(event, this.retire)
    }
  }

  private current(window: BrowserWindow, frame = window.webContents.mainFrame): boolean {
    try {
      return (
        !this.disposed &&
        !this.clearing &&
        this.window === window &&
        this.session !== null &&
        this.profile !== null &&
        this.profile === this.options.currentProfileIdentity() &&
        verifyProjectSourceWindowDocument(
          { ...this.options, approvedWindow: window, approvedSession: this.session },
          window.webContents,
          frame
        )
      )
    } catch {
      return false
    }
  }

  readCurrent(): MainProjectSelectionSnapshot {
    if (
      this.candidate &&
      (!this.window ||
        !this.current(this.window, this.frame!) ||
        this.options.catalog.inspectSelectionCandidate(this.candidate)?.fingerprint !==
          this.fingerprint)
    ) {
      this.clear()
    }
    return Object.freeze({ revision: this.revision, candidate: this.candidate })
  }

  subscribeChanges(listener: (snapshot: MainProjectSelectionSnapshot) => void): () => void {
    if (this.disposed) {
      throw new Error('Selection owner disposed')
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    if (this.clearing) {
      return
    }
    this.clearing = true
    const pending = this.pending
    try {
      this.pending = null
      this.fingerprint = null
      this.frame = null
      this.publish(null)
      pending?.abort()
    } finally {
      this.clearing = false
    }
  }

  private publish(candidate: MainProjectSelectionCandidate | null): void {
    if (this.disposed) {
      return
    }
    if (this.publishing || this.revision === Number.MAX_SAFE_INTEGER) {
      this.disposed = true
      this.candidate = null
      this.options.catalog.invalidate()
      return
    }
    this.revision += 1
    this.publishing = true
    this.catalogEvents = 0
    try {
      this.candidate = null
      if (!this.options.catalog.invalidate() || this.disposed) {
        return
      }
      if (candidate && !this.options.catalog.inspectSelectionCandidate(candidate)) {
        return
      }
      this.catalogEvents = 0
      this.candidate = candidate
      const snapshot = this.readCurrent()
      const listeners = [...this.listeners]
      for (const listener of listeners) {
        if (this.disposed) {
          break
        }
        listener(snapshot)
      }
    } catch {
      this.disposed = true
      this.candidate = null
      this.options.catalog.invalidate()
    } finally {
      this.publishing = false
    }
  }

  /** Called only by the native Main application menu; no renderer scope is accepted. */
  openPicker(window: BrowserWindow): void {
    this.clear()
    if (!this.current(window)) {
      return
    }
    const revision = this.revision
    try {
      const candidates = this.options.catalog.listSelectionCandidates()
      let consumed = false
      const items: Electron.MenuItemConstructorOptions[] = candidates.map((candidate) => {
        const inspected = this.options.catalog.inspectSelectionCandidate(candidate)
        return {
          label:
            `${candidate.projectId} / ${candidate.workspaceId} / PR #${candidate.prNumber}`.replace(
              /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu,
              ' '
            ),
          click: async () => {
            if (consumed || revision !== this.revision || !this.current(window)) {
              return
            }
            consumed = true
            if (
              !inspected ||
              this.options.catalog.inspectSelectionCandidate(candidate)?.fingerprint !==
                inspected.fingerprint
            ) {
              return
            }
            await this.confirmCandidate(window, candidate)
          }
        }
      })
      if (items.length === 0) {
        items.push({ label: 'No eligible local Worktree with a linked GitHub PR', enabled: false })
      }
      items.push(
        { type: 'separator' },
        { label: 'Clear GitHub Project Source selection', click: () => this.clear() }
      )
      Menu.buildFromTemplate(items).popup({ window })
    } catch {
      this.clear()
    }
  }

  async confirmCandidate(
    window: BrowserWindow,
    input: MainProjectSelectionCandidate
  ): Promise<boolean> {
    this.clear()
    if (!this.current(window)) {
      return false
    }
    try {
      const candidate = Object.freeze(structuredClone(input))
      const before = this.options.catalog.inspectSelectionCandidate(candidate)
      if (!before) {
        return false
      }
      const revision = this.revision
      const frame = window.webContents.mainFrame
      const pending = new AbortController()
      this.pending = pending
      const accepted = await confirmProjectSourceNative(
        window,
        {
          type: 'question',
          title: 'DevCrew GitHub Project Source selection',
          message: 'Select this scope for GitHub Project Source?',
          detail: before.detail,
          buttons: ['Cancel', 'Select scope'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        },
        pending.signal
      )
      if (this.pending !== pending) {
        return false
      }
      this.pending = null
      if (
        !accepted ||
        pending.signal.aborted ||
        revision !== this.revision ||
        !this.current(window, frame) ||
        this.options.catalog.inspectSelectionCandidate(candidate)?.fingerprint !==
          before.fingerprint
      ) {
        return false
      }
      this.fingerprint = before.fingerprint
      this.frame = frame
      this.publish(candidate)
      return !this.disposed && this.candidate === candidate
    } catch {
      this.clear()
      return false
    }
  }

  dispose(): void {
    this.detachWindow()
    this.disposed = true
    this.unsubscribe()
    this.listeners.clear()
    this.options.catalog.invalidate()
  }
}
